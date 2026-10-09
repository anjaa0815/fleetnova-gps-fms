import crypto from 'crypto';
import { DataEngine } from '../models/dataEngine.js';
import { runAsSystem } from '../middleware/tenantContext.js';
import { limitsFor, isWithinLimit } from '../config/plans.js';
import { findMissingRef } from '../utils/refs.js';
import { registerTraccarDevice, removeTraccarDevice, traccarConfigured } from '../services/traccarClient.js';
import { commandsSupported } from '../services/deviceCommands.js';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const TELTONIKA_IMEI = /^\d{15}$/;
const OSMAND_ID = /^[A-Za-z0-9_-]{6,32}$/;

export const isOnline = (device) =>
  Boolean(device.lastSeenAt) && Date.now() - new Date(device.lastSeenAt).getTime() < ONLINE_WINDOW_MS;

const vehicleSummary = (vehicle) =>
  vehicle && typeof vehicle === 'object'
    ? {
        _id: vehicle._id,
        vehicleId: vehicle.vehicleId,
        registrationNumber: vehicle.registrationNumber,
        brand: vehicle.brand,
        model: vehicle.model,
        status: vehicle.status
      }
    : vehicle || null;

export const serializeDevice = (device) => ({
  _id: device._id,
  name: device.name,
  imei: device.imei,
  protocol: device.protocol,
  vehicle: vehicleSummary(device.vehicle),
  simNumber: device.simNumber || '',
  immobilizer: Boolean(device.immobilizer),
  commandsSupported: commandsSupported(device.protocol),
  lastSeenAt: device.lastSeenAt || null,
  lastPosition: device.lastPosition || null,
  online: isOnline(device),
  // HTTP (OsmAnd) devices authenticate with this key; Teltonika trackers identify by IMEI only
  ...(device.protocol === 'osmand' ? { secret: device.secret } : {}),
  createdAt: device.createdAt
});

// @desc Where trackers should send their data
// @route GET /api/devices/connection-info
export const getConnectionInfo = (req, res) => {
  const portFrom = (value, fallback) => (value === undefined || value === '' ? fallback : Number(value));
  const tcpPort = portFrom(process.env.GPS_TCP_PORT, 5027);
  const gt06Port = portFrom(process.env.GT06_TCP_PORT, 5023);
  res.status(200).json({
    success: true,
    data: {
      teltonika: { enabled: tcpPort > 0, port: tcpPort > 0 ? tcpPort : null, codecs: ['8', '8E'] },
      gt06: { enabled: gt06Port > 0, port: gt06Port > 0 ? gt06Port : null },
      traccar: { enabled: Boolean(process.env.TRACCAR_FORWARD_TOKEN), path: '/api/gps/traccar', synced: traccarConfigured() },
      osmand: { path: '/api/gps/osmand', parameters: 'id, key, lat, lon, timestamp, speed (knots), bearing, altitude' }
    }
  });
};

// @route GET /api/devices
export const getDevices = async (req, res, next) => {
  try {
    const devices = await DataEngine.find('devices', {}, { populate: 'vehicle' });
    res.status(200).json({ success: true, data: devices.map(serializeDevice) });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/devices
export const createDevice = async (req, res, next) => {
  try {
    const { name, imei, protocol = 'teltonika', vehicle = null, simNumber = '' } = req.body;

    if (!name || typeof name !== 'string' || !imei) {
      return res.status(400).json({ success: false, message: 'Device name and IMEI are required' });
    }
    if (!['teltonika', 'osmand', 'gt06', 'traccar'].includes(protocol)) {
      return res.status(400).json({ success: false, message: 'Invalid protocol' });
    }
    const id = String(imei).trim();
    if (protocol === 'teltonika' && !TELTONIKA_IMEI.test(id)) {
      return res.status(400).json({ success: false, message: 'A Teltonika IMEI has exactly 15 digits' });
    }
    if (protocol === 'gt06' && !TELTONIKA_IMEI.test(id)) {
      return res.status(400).json({ success: false, message: 'A GT06 IMEI has exactly 15 digits' });
    }
    if ((protocol === 'osmand' || protocol === 'traccar') && !OSMAND_ID.test(id)) {
      return res.status(400).json({ success: false, message: 'Device id must be 6-32 letters, digits, - or _' });
    }

    const count = await DataEngine.countDocuments('devices');
    if (!isWithinLimit(limitsFor(req.org).maxDevices, count)) {
      return res.status(403).json({ success: false, message: 'Device limit reached for your plan' });
    }

    // Identifiers are unique across the whole platform (a tracker connects without any organization context)
    const taken = await runAsSystem(async () => Boolean(await DataEngine.findOne('devices', { imei: id })));
    if (taken) {
      return res.status(400).json({ success: false, message: 'A device with this IMEI is already registered' });
    }

    if (vehicle) {
      const missing = await findMissingRef([['vehicles', vehicle, 'Vehicle']]);
      if (missing) return res.status(404).json({ success: false, message: `${missing} not found` });
      if (await DataEngine.findOne('devices', { vehicle })) {
        return res.status(400).json({ success: false, message: 'This vehicle already has a tracker assigned' });
      }
    }

    const device = await DataEngine.create('devices', {
      name: name.trim(),
      imei: id,
      protocol,
      vehicle: vehicle || null,
      simNumber: String(simNumber).trim(),
      secret: protocol === 'osmand' ? crypto.randomBytes(12).toString('hex') : undefined,
      lastSeenAt: null,
      lastPosition: null
    });

    // Traccar ignores devices it does not know, so register the tracker there too (best effort)
    const traccarSync = protocol === 'traccar' ? await registerTraccarDevice({ uniqueId: id, name: device.name }) : undefined;

    const populated = await DataEngine.findById('devices', device._id, { populate: 'vehicle' });
    return res.status(201).json({
      success: true,
      message: 'Device registered successfully',
      data: serializeDevice(populated),
      ...(traccarSync ? { traccarSync } : {})
    });
  } catch (error) {
    return next(error);
  }
};

// @route PUT /api/devices/:id
export const updateDevice = async (req, res, next) => {
  try {
    const existing = await DataEngine.findById('devices', req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Device not found' });

    const update = {};
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ success: false, message: 'Device name is required' });
      update.name = String(req.body.name).trim();
    }
    if (req.body.simNumber !== undefined) update.simNumber = String(req.body.simNumber).trim();
    if (req.body.immobilizer !== undefined) {
      // switches the engine commands on: only an administrator, who confirms the relay is installed and tested
      if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only an administrator can change this' });
      update.immobilizer = req.body.immobilizer === true;
      if (update.immobilizer !== Boolean(existing.immobilizer)) {
        console.log(`[Commands] Engine commands ${update.immobilizer ? 'enabled' : 'disabled'} for device ${existing._id} by ${req.user.email}`);
      }
    }

    if (req.body.vehicle !== undefined) {
      const vehicle = req.body.vehicle || null;
      if (vehicle) {
        const missing = await findMissingRef([['vehicles', vehicle, 'Vehicle']]);
        if (missing) return res.status(404).json({ success: false, message: `${missing} not found` });
        const other = await DataEngine.findOne('devices', { vehicle });
        if (other && String(other._id) !== String(existing._id)) {
          return res.status(400).json({ success: false, message: 'This vehicle already has a tracker assigned' });
        }
      }
      update.vehicle = vehicle;
    }

    const device = await DataEngine.findByIdAndUpdate('devices', req.params.id, update);
    const populated = await DataEngine.findById('devices', device._id, { populate: 'vehicle' });
    return res.status(200).json({ success: true, message: 'Device updated successfully', data: serializeDevice(populated) });
  } catch (error) {
    return next(error);
  }
};

// @route DELETE /api/devices/:id
export const deleteDevice = async (req, res, next) => {
  try {
    const removed = await DataEngine.findByIdAndDelete('devices', req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Device not found' });
    if (removed.protocol === 'traccar') await removeTraccarDevice(removed.imei);
    return res.status(200).json({ success: true, message: 'Device deleted successfully' });
  } catch (error) {
    return next(error);
  }
};
