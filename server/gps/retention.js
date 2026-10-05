import { DataEngine } from '../models/dataEngine.js';
import { runWithTenant } from '../middleware/tenantContext.js';
import { positionRetentionDays } from '../config/plans.js';

const DAY_MS = 24 * 60 * 60 * 1000;

let running = false;

// Deletes positions older than each organization's retention (plan based, see positionRetentionDays).
// Suspended organizations are purged too. Returns { organizations, deleted }.
export async function purgeOldPositions(now = Date.now()) {
  if (running) return { organizations: 0, deleted: 0 };
  running = true;
  let deleted = 0;
  let organizations = 0;
  try {
    const orgs = await DataEngine.find('organizations', {});
    for (const org of orgs) {
      const days = positionRetentionDays(org.plan);
      if (days < 0) continue; // kept forever
      organizations += 1;
      const cutoff = new Date(now - days * DAY_MS).toISOString();
      try {
        // eslint-disable-next-line no-await-in-loop
        deleted += await runWithTenant({ orgId: String(org._id) }, () =>
          DataEngine.deleteMany('positions', { timestamp: { $lt: cutoff } })
        );
      } catch (error) {
        console.error(`[Retention] Purge failed for organization ${org._id}: ${error.message}`);
      }
    }
  } finally {
    running = false;
  }
  if (deleted > 0) console.log(`[Retention] Removed ${deleted} expired GPS positions.`);
  return { organizations, deleted };
}

// First run shortly after start, then every POSITION_PURGE_INTERVAL_MS (default 6 hours).
export function startRetentionWorker() {
  const interval = Number(process.env.POSITION_PURGE_INTERVAL_MS) || 6 * 60 * 60 * 1000;
  const firstRun = process.env.POSITION_PURGE_DELAY_MS !== undefined ? Number(process.env.POSITION_PURGE_DELAY_MS) : 60 * 1000;
  const run = () => purgeOldPositions().catch((error) => console.error(`[Retention] Worker error: ${error.message}`));
  const first = setTimeout(run, firstRun);
  const timer = setInterval(run, interval);
  first.unref?.();
  timer.unref?.();
  return timer;
}
