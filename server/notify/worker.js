import { DataEngine } from '../models/dataEngine.js';
import { getProvider } from './providers.js';

const MAX_ATTEMPTS = 4;
const BATCH = 20;
const RETRY_DELAYS_MS = (process.env.DELIVERY_RETRY_DELAYS_MS || '30000,120000,600000')
  .split(',')
  .map((n) => Number(n))
  .filter((n) => Number.isFinite(n) && n >= 0);

let running = false;

// Sends queued deliveries that are due. Runs outside any request (no tenant context), so it sees all
// organizations; every update touches one delivery by id.
export async function processDueDeliveries() {
  if (running) return 0;
  running = true;
  let processed = 0;
  try {
    const due = await DataEngine.find(
      'deliveries',
      { status: 'queued', nextAttemptAt: { $lte: new Date() } },
      { sort: { createdAt: 1 }, limit: BATCH }
    );

    for (const delivery of due) {
      processed += 1;
      const attempts = (delivery.attempts || 0) + 1;

      const org = await DataEngine.findById('organizations', delivery.orgId);
      if (!org || org.status !== 'active') {
        // eslint-disable-next-line no-await-in-loop
        await DataEngine.findByIdAndUpdate('deliveries', delivery._id, { status: 'skipped', lastError: 'Organization is not active' });
        continue;
      }

      const provider = getProvider(delivery.channel);
      try {
        // eslint-disable-next-line no-await-in-loop
        await provider.send({ to: delivery.to, subject: delivery.subject, text: delivery.text });
        // eslint-disable-next-line no-await-in-loop
        await DataEngine.findByIdAndUpdate('deliveries', delivery._id, {
          status: 'sent',
          attempts,
          simulated: provider.simulated,
          sentAt: new Date().toISOString(),
          lastError: ''
        });
      } catch (error) {
        const giveUp = error.permanent || attempts >= MAX_ATTEMPTS;
        const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 60000;
        // eslint-disable-next-line no-await-in-loop
        await DataEngine.findByIdAndUpdate('deliveries', delivery._id, {
          status: giveUp ? 'failed' : 'queued',
          attempts,
          lastError: String(error.message).slice(0, 300),
          nextAttemptAt: giveUp ? null : new Date(Date.now() + delay).toISOString()
        });
      }
    }
  } finally {
    running = false;
  }
  return processed;
}

export function startDeliveryWorker() {
  const interval = Number(process.env.DELIVERY_POLL_MS) || 5000;
  const timer = setInterval(() => {
    processDueDeliveries().catch((error) => console.error(`[Delivery] Worker error: ${error.message}`));
  }, interval);
  timer.unref?.();
  return timer;
}
