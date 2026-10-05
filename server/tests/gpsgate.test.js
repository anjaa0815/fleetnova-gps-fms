import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';
import { toRecord } from '../services/gpsgateClient.js';

const HTTP_PORT = 4600 + Math.floor(Math.random() * 90);
const MOCK_PORT = 4700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-gpsgate-test-${process.pid}.json`);
const APP_ID = '34';

let server;
let mock;
let logins = 0;
let validToken = null;
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

// Units as the mock GpsGate reports them. A: auto-registered, B: registered by another org,
// C: no fix yet, D: IMEI already used by a Teltonika device
const IMEI = { A: '352093081110001', B: '352093081110002', C: '352093081110003', D: '352093081110004' };
const statuses = {
  1: { id: 1, name: 'Howo 01', trackPoint: { valid: true, utc: minutesAgo(5), position: { latitude: 47.91, longitude: 106.91, altitude: 1300 }, velocity: { groundSpeed: 10, heading: 90 } }, variables: [{ name: 'Ignition', value: 'true' }] },
  2: { id: 2, name: 'Howo 02', trackPoint: { valid: true, utc: minutesAgo(4), position: { latitude: 47.92, longitude: 106.92 }, velocity: { groundSpeed: 0, heading: 0 } }, variables: [] },
  3: { id: 3, name: 'Howo 03', trackPoint: { valid: true, utc: '0001-01-01T00:00:00Z', position: { latitude: 0, longitude: 0 }, velocity: {} }, variables: [] },
  4: { id: 4, name: 'Howo 04', trackPoint: { valid: true, utc: minutesAgo(3), position: { latitude: 47.93, longitude: 106.93 }, velocity: { groundSpeed: 5 } }, variables: [] }
};
const users = [
  { id: 1, name: 'Howo 01', devices: [{ imei: IMEI.A }] },
  { id: 2, name: 'Howo 02', devices: [{ imei: IMEI.B }] },
  { id: 3, name: 'Howo 03', devices: [{ imei: IMEI.C }] },
  { id: 4, name: 'Howo 04', devices: [{ imei: IMEI.D }] }
];

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* plain */ }
  return { status: res.status, body: parsed };
}

const waitFor = async (check, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Condition not met in time');
};

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      const prefix = `/comGpsGate/api/v.1/applications/${APP_ID}`;
      if (req.method === 'POST' && req.url === `${prefix}/tokens`) {
        const { username, password } = JSON.parse(raw || '{}');
        if (username !== 'api-user' || password !== 'api-pass') { res.statusCode = 401; return res.end('{}'); }
        logins += 1;
        validToken = `token-${logins}`;
        return res.end(JSON.stringify({ token: validToken }));
      }
      if (req.headers.authorization !== validToken) { res.statusCode = 401; return res.end('{}'); }
      if (req.url === `${prefix}/usersstatus`) return res.end(JSON.stringify(Object.values(statuses)));
      if (req.url === `${prefix}/users`) return res.end(JSON.stringify(users));
      res.statusCode = 404;
      return res.end('{}');
    });
  });
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: '0', GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
      ADMIN_EMAIL: 'platform@gpsgate.example', ADMIN_PASSWORD: 'platform-pass-1',
      GPSGATE_URL: `http://127.0.0.1:${MOCK_PORT}/comGpsGate/api/v.1/`, GPSGATE_APP_ID: APP_ID,
      GPSGATE_USERNAME: 'api-user', GPSGATE_PASSWORD: 'api-pass', GPSGATE_POLL_SEC: '2',
      GPSGATE_AUTO_REGISTER_ORG: 'gpsgate-fleet'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not start');
});

after(() => {
  server?.kill();
  mock?.close();
  fs.rmSync(DATA_FILE, { force: true });
});

test('GpsGate status conversion', () => {
  const r = toRecord(statuses[1], 'ms');
  assert.equal(r.lat, 47.91);
  assert.equal(r.speed, 36); // 10 m/s
  assert.equal(r.io[239], 1);
  assert.equal(toRecord(statuses[1], 'kmh').speed, 10);
  assert.equal(toRecord(statuses[3]), null); // never reported
  assert.equal(toRecord({ ...statuses[2], trackPoint: { ...statuses[2].trackPoint, valid: false } }), null);
  // Older GpsGate versions put the fix on the status itself
  const flat = toRecord({ utc: minutesAgo(1), position: { latitude: 1, longitude: 2 }, velocity: { groundSpeed: 1 } });
  assert.deepEqual([flat.lat, flat.lng, flat.speed], [1, 2, 3.6]);
});

test('GpsGate polling: auto-registration, manual devices, tenancy, dedupe and re-login', async () => {
  // Another organization registers one GpsGate unit by hand, and a Teltonika tracker with a unit's IMEI
  const other = await api('POST', '/auth/register', { body: { organizationName: 'Other Org', name: 'B', email: 'b@gpsgate.example', password: 'password123' } });
  const otherToken = other.body.data.token;
  const manual = await api('POST', '/devices', { token: otherToken, body: { name: 'Manual', imei: IMEI.B, protocol: 'gpsgate' } });
  assert.equal(manual.status, 201, JSON.stringify(manual.body));
  assert.equal((await api('POST', '/devices', { token: otherToken, body: { name: 'bad', imei: 'a b', protocol: 'gpsgate' } })).status, 400);
  assert.equal((await api('POST', '/devices', { token: otherToken, body: { name: 'Tele', imei: IMEI.D } })).status, 201);

  // The organization that receives every other GpsGate unit
  const reg = await api('POST', '/auth/register', { body: { organizationName: 'GpsGate Fleet', name: 'A', email: 'a@gpsgate.example', password: 'password123' } });
  const token = reg.body.data.token;

  const live = await waitFor(async () => {
    const r = await api('GET', '/tracking/live', { token });
    return r.body.data?.length ? r.body.data : null;
  });
  // C has no fix yet, B and D belong to the other organization
  assert.deepEqual(live.map((d) => d.name), ['Howo 01']);
  assert.equal(live[0].speed, 36);
  assert.equal(live[0].ignition, true);

  const devices = (await api('GET', '/devices', { token })).body.data;
  assert.deepEqual(devices.map((d) => d.imei).sort(), [IMEI.A, IMEI.C]);
  assert.ok(devices.every((d) => d.protocol === 'gpsgate'));

  const otherLive = await waitFor(async () => {
    const r = await api('GET', '/tracking/live', { token: otherToken });
    return r.body.data?.length ? r.body.data : null;
  });
  assert.deepEqual(otherLive.map((d) => d.name), ['Manual']); // the Teltonika device ignores GpsGate data

  const info = (await api('GET', '/devices/connection-info', { token })).body.data.gpsgate;
  assert.equal(info.enabled, true);
  assert.equal(info.units, 4);
  assert.equal(info.lastError, null);

  // The same fix polled again is not stored twice; a new fix is, after the GpsGate token expired
  const unitA = devices.find((d) => d.imei === IMEI.A);
  const history = () => api('GET', `/tracking/history?deviceId=${unitA._id}`, { token });
  await new Promise((r) => setTimeout(r, 4500));
  assert.equal((await history()).body.data.totalPoints, 1);

  validToken = 'expired';
  const loginsBefore = logins;
  statuses[1].trackPoint = { ...statuses[1].trackPoint, utc: minutesAgo(1), position: { latitude: 47.95, longitude: 106.95 } };
  await waitFor(async () => (await history()).body.data.totalPoints === 2);
  assert.equal(logins, loginsBefore + 1);
});
