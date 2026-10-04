import { DataEngine } from '../models/dataEngine.js';
import { runWithTenant } from '../middleware/tenantContext.js';
import { getLocalStore, isDBConnected } from '../config/db.js';
import { IO } from './protocols/teltonika.js';
import { evaluateAlerts } from './alerts.js';

const MAX_PAST_MS = 365 * 24 * 60 * 60 * 1000; // buffered offline records can be old
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const MAX_SPEED_KMH = 400;
const MAX_ATTRIBUTES = 40;
const LOCAL_POSITION_CAP = Number(process.env.GPS_LOCAL_POSITION_CAP) || 200000;

// Device timestamps recently stored per device (retransmissions after a missed ACK must not duplicate points)
const recentTimestamps = new Map();
const REMEMBERED_TIMESTAMPS = 500;

const isActive = (org) => org && org.status === 'active';

// Resolves a device that is allowed to send data right now (exists and its organization is active)
export async function loadActiveDevice(deviceId) {
  const device = await DataEngine.findById('devices', deviceId);
  if (!device) return null;
  const org = await DataEngine.findById('organizations', device.orgId);
  return isActive(org) ? device : null;
}

// Authenticates by the identifier a tracker sends (IMEI / id). Returns the device or null.
export async function findActiveDeviceByImei(imei) {
  const device = await DataEngine.findOne('devices', { imei: String(imei) });
  if (!device) return null;
  const org = await DataEngine.findById('organizations', device.orgId);
  return isActive(org) ? device : null;
}

export function validateRecord(record, now = Date.now()) {
  const { lat, lng, speed, timestamp } = record;
  if (![lat, lng].every(Number.isFinite)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // (0,0) is what trackers report without a GPS fix
  if (lat === 0 && lng === 0) return false;
  if (speed != null && (!Number.isFinite(speed) || speed < 0 || speed > MAX_SPEED_KMH)) return false;
  const ts = timestamp instanceof Date ? timestamp.getTime() : NaN;
  if (!Number.isFinite(ts) || ts < now - MAX_PAST_MS || ts > now + MAX_FUTURE_MS) return false;
  return true;
}

function toPosition(device, record) {
  const io = record.io || {};
  const attributes = {};
  Object.entries(io)
    .slice(0, MAX_ATTRIBUTES)
    .forEach(([key, value]) => {
      attributes[`io${key}`] = value;
    });
  return {
    device: device._id,
    vehicle: device.vehicle?._id || device.vehicle || null,
    lat: record.lat,
    lng: record.lng,
    speed: Math.round(record.speed ?? 0),
    heading: Math.round(record.heading ?? 0),
    altitude: Math.round(record.altitude ?? 0),
    satellites: record.satellites ?? 0,
    ignition: io[IO.IGNITION] != null ? Boolean(io[IO.IGNITION]) : record.ignition ?? null,
    odometer: io[IO.TOTAL_ODOMETER] ?? null,
    timestamp: record.timestamp.toISOString(),
    attributes
  };
}

// Stores a batch of decoded records for a device. Returns how many records were consumed (valid or not)
// so the tracker can discard them; throws if storage fails so the tracker retries.
export async function ingestRecords(device, records) {
  const fresh = await loadActiveDevice(device._id);
  if (!fresh) return 0;

  return runWithTenant({ orgId: String(fresh.orgId) }, async () => {
    const seen = recentTimestamps.get(String(fresh._id)) || new Set();
    const now = Date.now();

    const docs = [];
    const accepted = [];
    let newest = null;
    for (const record of records) {
      if (!validateRecord(record, now)) continue;
      const ms = record.timestamp.getTime();
      if (seen.has(ms)) continue;
      seen.add(ms);
      docs.push(toPosition(fresh, record));
      accepted.push(record);
      if (!newest || ms > newest.timestamp.getTime()) newest = record;
    }
    // keep the dedupe window bounded
    if (seen.size > REMEMBERED_TIMESTAMPS) {
      [...seen].slice(0, seen.size - REMEMBERED_TIMESTAMPS).forEach((ts) => seen.delete(ts));
    }
    recentTimestamps.set(String(fresh._id), seen);

    if (docs.length) await DataEngine.createMany('positions', docs);

    const update = { lastSeenAt: new Date(now).toISOString() };
    const previous = fresh.lastPosition?.timestamp ? new Date(fresh.lastPosition.timestamp).getTime() : 0;
    if (newest && newest.timestamp.getTime() >= previous) {
      const position = toPosition(fresh, newest);
      update.lastPosition = {
        lat: position.lat,
        lng: position.lng,
        speed: position.speed,
        heading: position.heading,
        altitude: position.altitude,
        satellites: position.satellites,
        ignition: position.ignition,
        timestamp: position.timestamp
      };
    }
    // Geofence / speed alerts for the new live records. A failure here must never lose the positions.
    if (accepted.length) {
      try {
        const org = await DataEngine.findById('organizations', fresh.orgId);
        update.alertState = await evaluateAlerts({ device: fresh, org, records: accepted, previousTimestamp: previous });
      } catch (error) {
        console.error(`[GPS] Alert evaluation failed: ${error.message}`);
      }
    }

    await DataEngine.findByIdAndUpdate('devices', fresh._id, update);

    if (!isDBConnected()) pruneLocalPositions();
    return records.length;
  });
}

// The JSON store has no TTL index: keep the newest N positions so the file cannot grow forever.
function pruneLocalPositions() {
  const positions = getLocalStore().positions;
  if (positions && positions.length > LOCAL_POSITION_CAP * 1.1) {
    positions.splice(0, positions.length - LOCAL_POSITION_CAP);
  }
}
