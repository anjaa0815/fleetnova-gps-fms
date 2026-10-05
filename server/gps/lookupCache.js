import { DataEngine } from '../models/dataEngine.js';

// Organizations are read for every position batch (is it active? speed limit, alert settings) but change rarely:
// keep them in memory for a few seconds. Changes made through this server invalidate the entry at once; with
// several app instances another instance sees a change after at most GPS_ORG_CACHE_MS (default 5 s).
const TTL_MS = process.env.GPS_ORG_CACHE_MS !== undefined ? Number(process.env.GPS_ORG_CACHE_MS) : 5000;
const MAX_ENTRIES = 5000;
const cache = new Map();

export async function getCachedOrganization(orgId) {
  const key = String(orgId);
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.org;
  const org = await DataEngine.findById('organizations', key, { lean: true });
  if (TTL_MS > 0) {
    if (cache.size >= MAX_ENTRIES) cache.clear();
    cache.set(key, { at: now, org });
  }
  return org;
}

export const invalidateOrganization = (orgId) => cache.delete(String(orgId));
