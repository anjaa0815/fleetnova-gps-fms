import crypto from 'crypto';
import { findActiveDeviceByImei, ingestRecords } from '../gps/ingestion.js';

const KNOTS_TO_KMH = 1.852;

// Simple in-memory throttle per device id (the endpoint is public)
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 120;
const hits = new Map();

function throttled(id) {
  const now = Date.now();
  const entry = hits.get(id);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(id, { start: now, count: 1 });
    if (hits.size > 10000) hits.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

function parseTimestamp(value) {
  if (value === undefined || value === '') return new Date();
  if (/^\d+(\.\d+)?$/.test(String(value))) {
    const n = Number(value);
    return new Date(n < 1e11 ? n * 1000 : n); // seconds or milliseconds
  }
  return new Date(value);
}

const number = (value) => (value === undefined || value === '' ? undefined : Number(value));

// @desc Position upload in the OsmAnd / Traccar Client format (phones and many apps)
// @route GET|POST /api/gps/osmand?id=<id>&key=<secret>&lat=..&lon=..&timestamp=..&speed=<knots>&bearing=..&altitude=..
export const receiveOsmand = async (req, res, next) => {
  try {
    const params = { ...req.query, ...(req.body && typeof req.body === 'object' ? req.body : {}) };
    const id = params.id ? String(params.id) : '';
    if (!id) return res.status(400).type('text').send('id required');
    if (throttled(id)) return res.status(429).type('text').send('Too many requests');

    const device = await findActiveDeviceByImei(id);
    // Same answer for unknown device / wrong key: do not reveal which identifiers exist
    if (!device || device.protocol !== 'osmand' || !params.key || !safeEqual(params.key, device.secret || '')) {
      return res.status(401).type('text').send('Unauthorized');
    }

    const speedKnots = number(params.speed);
    const record = {
      timestamp: parseTimestamp(params.timestamp),
      lat: number(params.lat),
      lng: number(params.lon ?? params.lng),
      speed: speedKnots === undefined ? 0 : speedKnots * KNOTS_TO_KMH,
      heading: number(params.bearing ?? params.heading) ?? 0,
      altitude: number(params.altitude) ?? 0,
      satellites: 0,
      io: params.ignition !== undefined ? { 239: params.ignition === 'true' || params.ignition === '1' ? 1 : 0 } : {}
    };

    await ingestRecords(device, [record]);
    return res.status(200).type('text').send('OK');
  } catch (error) {
    return next(error);
  }
};
