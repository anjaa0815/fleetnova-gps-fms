import { DataEngine } from '../models/dataEngine.js';
import { isInsideGeofence } from './geometry.js';
import { getActiveGeofences } from './geofenceCache.js';
import { enqueueDeliveries } from '../notify/dispatcher.js';

const RECENT_WINDOW_MS = 10 * 60 * 1000; // older (buffered) records never raise live alerts
const CONFIRM_REPORTS = 2; // consecutive over-limit reports needed (filters single GPS speed spikes)
const COOLDOWN_MS = 60 * 1000; // same alert for the same device/geofence at most once a minute (boundary flapping)

const lastAlertAt = new Map();

function coolingDown(key, now) {
  const last = lastAlertAt.get(key);
  if (last && now - last < COOLDOWN_MS) return true;
  lastAlertAt.set(key, now);
  if (lastAlertAt.size > 20000) lastAlertAt.clear();
  return false;
}

export const initialAlertState = () => ({ initialized: false, inside: [], overLimitCount: 0, speedingAlerted: false });

// Evaluates geofence and speed rules for newly received records of one device.
// Must run inside the organization's tenant context. Returns the new alert state (the caller persists it)
// and creates the notifications.
export async function evaluateAlerts({ device, org, records, previousTimestamp }) {
  const now = Date.now();
  const state = { ...initialAlertState(), ...(device.alertState || {}) };
  state.inside = [...(state.inside || [])];

  const fresh = records
    .filter((r) => r.timestamp.getTime() > previousTimestamp && r.timestamp.getTime() >= now - RECENT_WINDOW_MS)
    .sort((a, b) => a.timestamp - b.timestamp);
  if (fresh.length === 0) return state;

  const vehicleId = String(device.vehicle?._id || device.vehicle || '');
  const geofences = (await getActiveGeofences(device.orgId)).filter(
    (g) => g.vehicles.length === 0 || (vehicleId && g.vehicles.includes(vehicleId))
  );
  const speedLimit = org?.settings?.speedLimitKmh || 0;

  const events = [];

  for (const record of fresh) {
    // ---- geofences ----
    const insideNow = geofences.filter((g) => isInsideGeofence(g, record.lat, record.lng)).map((g) => g._id);
    if (!state.initialized) {
      // first position ever seen: learn where the vehicle is without raising "entered" alerts
      state.initialized = true;
    } else {
      const before = new Set(state.inside);
      const after = new Set(insideNow);
      geofences.forEach((g) => {
        if (after.has(g._id) && !before.has(g._id) && g.alertOnEnter) {
          if (!coolingDown(`${device._id}:${g._id}:enter`, now)) events.push({ type: 'geofence_enter', geofence: g, record });
        }
        if (!after.has(g._id) && before.has(g._id) && g.alertOnExit) {
          if (!coolingDown(`${device._id}:${g._id}:exit`, now)) events.push({ type: 'geofence_exit', geofence: g, record });
        }
      });
    }
    state.inside = insideNow;

    // ---- speeding ----
    if (speedLimit > 0 && record.speed > speedLimit) {
      state.overLimitCount += 1;
      if (state.overLimitCount >= CONFIRM_REPORTS && !state.speedingAlerted) {
        state.speedingAlerted = true;
        if (!coolingDown(`${device._id}:speeding`, now)) events.push({ type: 'speeding', record, speedLimit });
      }
    } else {
      state.overLimitCount = 0;
      state.speedingAlerted = false;
    }
  }

  if (events.length > 0) await notify(device, vehicleId, events, org);
  return state;
}

async function notify(device, vehicleId, events, org) {
  const vehicle = vehicleId ? await DataEngine.findById('vehicles', vehicleId) : null;
  const label = vehicle?.registrationNumber || device.name;
  const relatedEntity = vehicle ? 'Vehicle' : 'Device';
  const relatedEntityId = String(vehicle?._id || device._id);

  const templates = {
    speeding: {
      titleKey: 'Speed limit exceeded',
      messageKey: '{vehicle} is travelling at {speed} km/h (limit {limit} km/h).'
    },
    geofence_enter: { titleKey: 'Entered geofence', messageKey: '{vehicle} entered "{geofence}".' },
    geofence_exit: { titleKey: 'Left geofence', messageKey: '{vehicle} left "{geofence}".' }
  };

  for (const event of events) {
    const { titleKey, messageKey } = templates[event.type];
    const params = {
      vehicle: label,
      speed: Math.round(event.record.speed),
      limit: event.speedLimit,
      geofence: event.geofence?.name,
      lat: event.record.lat,
      lng: event.record.lng
    };
    const fill = (text) => text.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '');
    // eslint-disable-next-line no-await-in-loop
    const notification = await DataEngine.create('notifications', {
      type: event.type,
      title: fill(titleKey),
      message: fill(messageKey),
      titleKey,
      messageKey,
      params,
      relatedEntity,
      relatedEntityId,
      isRead: false
    });

    // Email / SMS: queued here, sent by the delivery worker. A failure must not lose the in-app alert.
    try {
      // eslint-disable-next-line no-await-in-loop
      await enqueueDeliveries({ org, notification });
    } catch (error) {
      console.error(`[Delivery] Could not queue deliveries: ${error.message}`);
    }
  }
}
