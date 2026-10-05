// Group commit: writes that arrive within a few milliseconds of each other (from many trackers) are sent to the
// database as ONE operation. Every caller still waits until its own data is stored (so a tracker is only
// acknowledged after its records are durable), and all callers of a batch see the same failure.
//
// GPS_BATCH_MS (default 10) is the longest a write waits for company; 0 turns grouping off.
const DEFAULT_DELAY_MS = process.env.GPS_BATCH_MS !== undefined ? Number(process.env.GPS_BATCH_MS) : 10;

export function createGroupCommit(flushBatch, { delayMs = DEFAULT_DELAY_MS, maxItems = 500 } = {}) {
  let pending = [];
  let timer = null;

  const flush = async () => {
    clearTimeout(timer);
    timer = null;
    const batch = pending;
    pending = [];
    if (batch.length === 0) return;
    try {
      await flushBatch(batch.map((entry) => entry.item));
      batch.forEach((entry) => entry.resolve());
    } catch (error) {
      batch.forEach((entry) => entry.reject(error));
    }
  };

  return {
    add(item) {
      if (!(delayMs > 0)) return flushBatch([item]);
      return new Promise((resolve, reject) => {
        pending.push({ item, resolve, reject });
        if (pending.length >= maxItems) flush();
        else if (!timer) timer = setTimeout(flush, delayMs);
      });
    },
    flush
  };
}
