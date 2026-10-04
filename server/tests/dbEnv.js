import crypto from 'node:crypto';

// Storage for the spawned test servers. By default the local JSON store is used. With TEST_MONGODB_URI
// (e.g. mongodb://127.0.0.1:27017) every server gets its own throw-away database on that MongoDB and
// REQUIRE_MONGODB makes it fail loudly instead of silently falling back to the JSON store.
export function dbEnv() {
  const base = process.env.TEST_MONGODB_URI;
  if (!base) return {};
  const name = `fleetnova_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  return { MONGODB_URI: `${base.replace(/\/+$/, '')}/${name}`, REQUIRE_MONGODB: 'true' };
}

export const usingMongo = Boolean(process.env.TEST_MONGODB_URI);
