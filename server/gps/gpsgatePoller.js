import { DataEngine } from '../models/dataEngine.js';
import { runAsSystem, runWithTenant } from '../middleware/tenantContext.js';
import { fetchGpsgateUnits, gpsgateConfigured } from '../services/gpsgateClient.js';
import { findActiveDeviceByImei, ingestRecords } from './ingestion.js';

// Polls the GpsGate server for each unit's latest position and stores new ones for the matching device
// (protocol 'gpsgate', identifier = IMEI). With GPSGATE_AUTO_REGISTER_ORG (an organization slug) unknown GpsGate
// units are registered as devices of that organization, so the whole GpsGate fleet shows up without manual setup.
export const gpsgateState = { enabled: false, lastPollAt: null, lastError: null, units: 0, stored: 0 };

const pollSeconds = () => Math.max(2, Number(process.env.GPSGATE_POLL_SEC) || 30);

let warnedSlug = null;

async function autoRegisterOrg() {
  const slug = String(process.env.GPSGATE_AUTO_REGISTER_ORG || '').trim().toLowerCase();
  if (!slug) return null;
  const org = await runAsSystem(() => DataEngine.findOne('organizations', { slug }));
  if (!org || org.status !== 'active') {
    if (warnedSlug !== slug) console.warn(`[GpsGate] GPSGATE_AUTO_REGISTER_ORG "${slug}" is not an active organization`);
    warnedSlug = slug;
    return null;
  }
  warnedSlug = null;
  return org;
}

async function registerUnit(org, unit) {
  // Identifiers are unique platform-wide: never take over a device that another protocol or org already uses
  const taken = await runAsSystem(() => DataEngine.findOne('devices', { imei: unit.imei }));
  if (taken) return null;
  await runWithTenant({ orgId: String(org._id) }, () =>
    DataEngine.create('devices', {
      name: unit.name.slice(0, 80),
      imei: unit.imei,
      protocol: 'gpsgate',
      vehicle: null,
      simNumber: '',
      lastSeenAt: null,
      lastPosition: null
    })
  );
  return runAsSystem(() => findActiveDeviceByImei(unit.imei));
}

export async function pollGpsgateOnce() {
  const units = await fetchGpsgateUnits();
  const org = await autoRegisterOrg();
  let stored = 0;
  for (const unit of units) {
    try {
      let device = await runAsSystem(() => findActiveDeviceByImei(unit.imei));
      if (!device && org) device = await registerUnit(org, unit);
      if (!device || device.protocol !== 'gpsgate' || !unit.record) continue;
      // usersstatus repeats the last fix until the unit reports again
      const last = device.lastPosition?.timestamp ? new Date(device.lastPosition.timestamp).getTime() : 0;
      if (unit.record.timestamp.getTime() <= last) continue;
      await ingestRecords(device, [unit.record]);
      stored += 1;
    } catch (error) {
      console.error(`[GpsGate] Unit ${unit.gpsgateId} failed: ${error.message}`);
    }
  }
  Object.assign(gpsgateState, { lastPollAt: new Date().toISOString(), lastError: null, units: units.length });
  gpsgateState.stored += stored;
  return { units: units.length, stored };
}

let timer = null;

export function startGpsgatePoller() {
  if (!gpsgateConfigured()) return false;
  gpsgateState.enabled = true;
  let running = false;
  const tick = async () => {
    if (running) return; // a slow GpsGate must not stack polls
    running = true;
    try {
      await pollGpsgateOnce();
    } catch (error) {
      gpsgateState.lastError = error.message;
      console.error(`[GpsGate] Poll failed: ${error.message}`);
    } finally {
      running = false;
    }
  };
  tick();
  timer = setInterval(tick, pollSeconds() * 1000);
  timer.unref?.();
  console.log(`[GpsGate] Polling ${process.env.GPSGATE_URL} every ${pollSeconds()} s`);
  return true;
}

export function stopGpsgatePoller() {
  if (timer) clearInterval(timer);
  timer = null;
}
