import { DataEngine } from '../models/dataEngine.js';
import { serializeDevice } from './deviceController.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 31 * DAY_MS;
const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 10000;

const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// @desc Last known position of every tracker in the organization
// @route GET /api/tracking/live
export const getLivePositions = async (req, res, next) => {
  try {
    const devices = await DataEngine.find('devices', {}, { populate: 'vehicle' });
    const data = devices
      .map(serializeDevice)
      .filter((d) => d.lastPosition && Number.isFinite(d.lastPosition.lat))
      .map((d) => ({
        deviceId: d._id,
        name: d.name,
        online: d.online,
        lastSeenAt: d.lastSeenAt,
        vehicle: d.vehicle,
        ...d.lastPosition
      }));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

// @desc Route history (playback) for a vehicle or a device
// @route GET /api/tracking/history?vehicleId=..|deviceId=..&from=..&to=..&limit=..
export const getHistory = async (req, res, next) => {
  try {
    const { vehicleId, deviceId } = req.query;
    if (!vehicleId && !deviceId) {
      return res.status(400).json({ success: false, message: 'vehicleId or deviceId is required' });
    }

    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - DAY_MS);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return res.status(400).json({ success: false, message: 'Invalid time range' });
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
      return res.status(400).json({ success: false, message: 'Time range cannot exceed 31 days' });
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 10), MAX_LIMIT);

    // The reference must belong to the caller's organization (the data layer only finds its own records)
    if (vehicleId && !(await DataEngine.findById('vehicles', vehicleId))) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }
    if (deviceId && !(await DataEngine.findById('devices', deviceId))) {
      return res.status(404).json({ success: false, message: 'Device not found' });
    }

    const filter = { timestamp: { $gte: from, $lte: to } };
    if (vehicleId) filter.vehicle = String(vehicleId);
    if (deviceId) filter.device = String(deviceId);

    const positions = await DataEngine.find('positions', filter, { sort: { timestamp: 1 } });

    let distanceKm = 0;
    for (let i = 1; i < positions.length; i += 1) distanceKm += haversineKm(positions[i - 1], positions[i]);

    // Keep the overall shape of the route when there are more points than the client asked for
    let points = positions;
    if (positions.length > limit) {
      const stride = positions.length / limit;
      points = Array.from({ length: limit }, (_, i) => positions[Math.floor(i * stride)]);
      points[points.length - 1] = positions[positions.length - 1];
    }

    res.status(200).json({
      success: true,
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        totalPoints: positions.length,
        distanceKm: Math.round(distanceKm * 10) / 10,
        points: points.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          speed: p.speed,
          heading: p.heading,
          ignition: p.ignition,
          timestamp: p.timestamp
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};
