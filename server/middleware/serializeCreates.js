// Plan limits ("10 vehicles") are checked by counting what exists and then creating. Two requests that arrive at the same
// moment both count 9 and both create: the limit is exceeded. This middleware lets only one creation per organization and
// kind (vehicles, devices, users) run at a time, in the order the requests came in; the next one starts when the answer to
// the previous one has been sent, so its count includes it. Other requests are not affected.
//
// The queue lives in this process, which is how the app runs (one Node process: the GPS caches and the rate limits are
// per process too). With several processes the limit would need a lock they share.
const MAX_HOLD_MS = 15000; // a safety net: a request that never answers cannot block the organization for ever

const tails = new Map(); // key -> promise of the last queued request

function acquire(key) {
  const previous = tails.get(key) || Promise.resolve();
  let release;
  const mine = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => mine);
  tails.set(key, tail);
  tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return previous.then(() => release);
}

// kind: what is created ('vehicles', 'devices', 'users'); orgOf: which organization the request creates it in
export const serializeCreates = (kind, orgOf = (req) => req.user?.orgId) => (req, res, next) => {
  const orgId = orgOf(req);
  if (!orgId) return next();
  acquire(`${orgId}:${kind}`)
    .then((release) => {
      let released = false;
      const free = () => {
        if (released) return;
        released = true;
        clearTimeout(timer);
        release();
      };
      const timer = setTimeout(free, MAX_HOLD_MS);
      res.on('close', free); // after the answer was sent (or the connection dropped)
      next();
    })
    .catch(next);
};
