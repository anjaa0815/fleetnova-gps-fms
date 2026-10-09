import crypto from 'crypto';

let secret = process.env.JWT_SECRET;

if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[CLIXGPS] JWT_SECRET environment variable is required in production');
  }
  // Dev only: random per-process secret (tokens are invalidated on restart)
  secret = crypto.randomBytes(48).toString('hex');
  console.warn('[CLIXGPS] JWT_SECRET not set - using an ephemeral development secret.');
}

export const JWT_SECRET = secret;
