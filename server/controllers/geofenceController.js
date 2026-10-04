import { DataEngine } from '../models/dataEngine.js';
import { findMissingRef } from '../utils/refs.js';
import { invalidateGeofences } from '../gps/geofenceCache.js';

const MAX_GEOFENCES = 200;
const MAX_VERTICES = 200;
const MIN_RADIUS_M = 20;
const MAX_RADIUS_M = 500000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// Returns { value } or { error }
function parseGeometry(body) {
  if (body.shape === 'circle') {
    const lat = Number(body.center?.lat);
    const lng = Number(body.center?.lng);
    const radiusM = Number(body.radiusM);
    if (!validCoord(lat, lng)) return { error: 'Invalid circle center' };
    if (!Number.isFinite(radiusM) || radiusM < MIN_RADIUS_M || radiusM > MAX_RADIUS_M) {
      return { error: `Radius must be between ${MIN_RADIUS_M} and ${MAX_RADIUS_M} metres` };
    }
    return { value: { shape: 'circle', center: { lat, lng }, radiusM, polygon: undefined } };
  }
  if (body.shape === 'polygon') {
    const raw = body.polygon;
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_VERTICES) {
      return { error: `A polygon needs between 3 and ${MAX_VERTICES} points` };
    }
    const polygon = raw.map((p) => [Number(p?.[0]), Number(p?.[1])]);
    if (!polygon.every(([lat, lng]) => validCoord(lat, lng))) return { error: 'Invalid polygon point' };
    return { value: { shape: 'polygon', polygon, center: undefined, radiusM: null } };
  }
  return { error: 'Shape must be "circle" or "polygon"' };
}

async function parseCommon(body, { partial }) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) return { error: 'Geofence name is required (max 80 characters)' };
    out.name = name;
  }
  ['alertOnEnter', 'alertOnExit', 'active'].forEach((key) => {
    if (body[key] !== undefined) out[key] = Boolean(body[key]);
  });
  if (body.color !== undefined) {
    if (!HEX_COLOR.test(body.color)) return { error: 'Color must be a hex color like #2563eb' };
    out.color = body.color;
  }
  if (body.vehicles !== undefined) {
    if (!Array.isArray(body.vehicles) || body.vehicles.length > 500) return { error: 'Invalid vehicle list' };
    const ids = [...new Set(body.vehicles.map(String))];
    const missing = await findMissingRef(ids.map((id) => ['vehicles', id, 'Vehicle']));
    if (missing) return { error: `${missing} not found`, status: 404 };
    out.vehicles = ids;
  }
  return { value: out };
}

const serialize = (g) => ({
  _id: g._id,
  name: g.name,
  shape: g.shape,
  center: g.center || null,
  radiusM: g.radiusM ?? null,
  polygon: g.polygon || null,
  alertOnEnter: g.alertOnEnter !== false,
  alertOnExit: g.alertOnExit !== false,
  vehicles: (g.vehicles || []).map(String),
  color: g.color || '#2563eb',
  active: g.active !== false,
  createdAt: g.createdAt
});

// @route GET /api/geofences
export const getGeofences = async (req, res, next) => {
  try {
    const geofences = await DataEngine.find('geofences');
    res.status(200).json({ success: true, data: geofences.map(serialize) });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/geofences
export const createGeofence = async (req, res, next) => {
  try {
    const common = await parseCommon(req.body, { partial: false });
    if (common.error) return res.status(common.status || 400).json({ success: false, message: common.error });
    const geometry = parseGeometry(req.body);
    if (geometry.error) return res.status(400).json({ success: false, message: geometry.error });

    if ((await DataEngine.countDocuments('geofences')) >= MAX_GEOFENCES) {
      return res.status(403).json({ success: false, message: 'Geofence limit reached' });
    }

    const geofence = await DataEngine.create('geofences', {
      alertOnEnter: true,
      alertOnExit: true,
      active: true,
      color: '#2563eb',
      vehicles: [],
      ...common.value,
      ...geometry.value
    });
    invalidateGeofences(req.org._id);
    return res.status(201).json({ success: true, message: 'Geofence created successfully', data: serialize(geofence) });
  } catch (error) {
    return next(error);
  }
};

// @route PUT /api/geofences/:id
export const updateGeofence = async (req, res, next) => {
  try {
    const existing = await DataEngine.findById('geofences', req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Geofence not found' });

    const common = await parseCommon(req.body, { partial: true });
    if (common.error) return res.status(common.status || 400).json({ success: false, message: common.error });

    const update = { ...common.value };
    // Geometry fields may be sent partially (e.g. only a new radius): merge with the stored shape
    if (['shape', 'center', 'radiusM', 'polygon'].some((key) => req.body[key] !== undefined)) {
      const geometry = parseGeometry({
        shape: req.body.shape ?? existing.shape,
        center: req.body.center ?? existing.center,
        radiusM: req.body.radiusM ?? existing.radiusM,
        polygon: req.body.polygon ?? existing.polygon
      });
      if (geometry.error) return res.status(400).json({ success: false, message: geometry.error });
      Object.assign(update, geometry.value);
    }

    const geofence = await DataEngine.findByIdAndUpdate('geofences', req.params.id, update);
    invalidateGeofences(req.org._id);
    return res.status(200).json({ success: true, message: 'Geofence updated successfully', data: serialize(geofence) });
  } catch (error) {
    return next(error);
  }
};

// @route DELETE /api/geofences/:id
export const deleteGeofence = async (req, res, next) => {
  try {
    const removed = await DataEngine.findByIdAndDelete('geofences', req.params.id);
    if (!removed) return res.status(404).json({ success: false, message: 'Geofence not found' });
    invalidateGeofences(req.org._id);
    return res.status(200).json({ success: true, message: 'Geofence deleted successfully' });
  } catch (error) {
    return next(error);
  }
};
