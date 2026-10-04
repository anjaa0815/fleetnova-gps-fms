import { DataEngine } from '../models/dataEngine.js';

// Geofences are read on every position batch: keep them in memory for a short time per organization.
const TTL_MS = 30 * 1000;
const cache = new Map();

export const invalidateGeofences = (orgId) => cache.delete(String(orgId));

// Must be called inside the organization's tenant context
export async function getActiveGeofences(orgId) {
  const key = String(orgId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const items = (await DataEngine.find('geofences', { active: true })).map((g) => ({
    _id: String(g._id),
    name: g.name,
    shape: g.shape,
    center: g.center,
    radiusM: g.radiusM,
    polygon: g.polygon,
    alertOnEnter: g.alertOnEnter !== false,
    alertOnExit: g.alertOnExit !== false,
    vehicles: (g.vehicles || []).map(String)
  }));
  cache.set(key, { at: Date.now(), items });
  return items;
}
