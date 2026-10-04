// In-memory fixed-window rate limiter (no dependency).
//
// The counters live in this process: with several server instances each one counts on its own, so put a shared
// store (e.g. Redis) behind this interface or rate-limit at the reverse proxy when you scale out.
//
// Environment:
//   RATE_LIMIT_DISABLED=true            turns every limiter off (tests, local load tests)
//   RATE_LIMIT_<NAME>_MAX=<n>           override the limit of one limiter  (NAME in upper case, e.g. LOGIN)
//   RATE_LIMIT_<NAME>_WINDOW_SEC=<n>    override its window
//   TRUST_PROXY=1                       behind a reverse proxy: number of proxies whose X-Forwarded-For to trust
const MAX_KEYS = 50000;
const stores = new Set();

export const rateLimitDisabled = () => process.env.RATE_LIMIT_DISABLED === 'true';

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

// Drop expired entries once a minute (the timer never keeps the process alive)
const sweeper = setInterval(() => {
  const now = Date.now();
  stores.forEach((store) => {
    for (const [key, entry] of store) if (entry.resetAt <= now) store.delete(key);
  });
}, 60 * 1000);
sweeper.unref?.();

// options:
//   name         identifies the limiter (and its env variables)
//   windowMs/max defaults; overridable through the environment
//   key(req)     what is being limited (default: client IP)
//   skipSuccess  only requests that end with an error status count (brute-force guards for login)
//   message      error text for the client
export function rateLimit({ name, windowMs, max, key = (req) => req.ip, skipSuccess = false, message = 'Too many requests, please try again later.' }) {
  const upper = name.toUpperCase();
  const limit = numberFromEnv(`RATE_LIMIT_${upper}_MAX`, max);
  const window = numberFromEnv(`RATE_LIMIT_${upper}_WINDOW_SEC`, windowMs / 1000) * 1000;
  const store = new Map();
  stores.add(store);

  return (req, res, next) => {
    if (rateLimitDisabled()) return next();

    const identity = key(req);
    if (identity === null || identity === undefined) return next();
    const id = String(identity).toLowerCase();
    const now = Date.now();

    let entry = store.get(id);
    if (!entry || entry.resetAt <= now) {
      if (!entry && store.size >= MAX_KEYS) {
        // memory guard: forget the oldest tenth of the keys
        let toDrop = Math.ceil(MAX_KEYS / 10);
        for (const oldKey of store.keys()) {
          store.delete(oldKey);
          toDrop -= 1;
          if (toDrop <= 0) break;
        }
      }
      entry = { count: 0, resetAt: now + window };
      store.set(id, entry);
    }

    entry.count += 1;
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - entry.count)));
    res.setHeader('RateLimit-Reset', String(retryAfter));

    if (entry.count > limit) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, code: 'RATE_LIMITED', message, retryAfter });
    }

    if (skipSuccess) {
      res.on('finish', () => {
        if (res.statusCode < 400 && entry.count > 0) entry.count -= 1;
      });
    }
    return next();
  };
}

// Express "trust proxy" setting from TRUST_PROXY: a number of hops, true/false, or an address list
export function trustProxySetting(value = process.env.TRUST_PROXY) {
  if (value === undefined || value === '') return false;
  if (value === 'true') return 1;
  if (value === 'false') return false;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const emailKey = (req) => (typeof req.body?.email === 'string' ? req.body.email.trim() : null);

// Shared limiter instances (one counter per limiter)
export const apiLimiter = rateLimit({ name: 'api', windowMs: 60 * 1000, max: 1200 });

export const registerLimiter = rateLimit({
  name: 'register', windowMs: 60 * 60 * 1000, max: 5,
  message: 'Too many sign-ups from this address. Please try again later.'
});

// Brute-force protection: failed logins per account+IP and per IP; successful logins do not count
export const loginAccountLimiter = rateLimit({
  name: 'login', windowMs: 15 * 60 * 1000, max: 8, skipSuccess: true,
  key: (req) => (emailKey(req) ? `${req.ip}|${emailKey(req)}` : null),
  message: 'Too many failed sign-in attempts. Please try again later.'
});
export const loginIpLimiter = rateLimit({
  name: 'login_ip', windowMs: 15 * 60 * 1000, max: 60, skipSuccess: true,
  message: 'Too many failed sign-in attempts. Please try again later.'
});

export const passwordResetLimiter = rateLimit({
  name: 'password_reset', windowMs: 60 * 60 * 1000, max: 5,
  key: (req) => `${req.ip}|${emailKey(req) || ''}`
});

export const verifyIpLimiter = rateLimit({ name: 'verify', windowMs: 60 * 60 * 1000, max: 30 });
export const resendIpLimiter = rateLimit({ name: 'resend_ip', windowMs: 60 * 60 * 1000, max: 10 });
export const resendEmailLimiter = rateLimit({
  name: 'resend_email', windowMs: 60 * 60 * 1000, max: 3,
  key: (req) => emailKey(req)
});

export const publicLimiter = rateLimit({ name: 'public', windowMs: 60 * 1000, max: 60 });
