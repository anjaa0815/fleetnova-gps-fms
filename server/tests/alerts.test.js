import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { encodeAvlPacket, encodeLogin } from '../gps/protocols/teltonika.js';
import { isInsideGeofence, haversineMeters } from '../gps/geometry.js';

const HTTP_PORT = 3700 + Math.floor(Math.random() * 90);
const TCP_PORT = 5600 + Math.floor(Math.random() * 300);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-alerts-test-${process.pid}.json`);

let server;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not start');
}

function tracker() {
  const socket = net.connect(TCP_PORT, '127.0.0.1');
  const chunks = [];
  let waiter = null;
  socket.on('data', (d) => { chunks.push(d); waiter?.(); });
  socket.on('error', () => {});
  const next = (bytes) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No reply')), 4000);
    waiter = () => {
      const have = Buffer.concat(chunks);
      if (have.length >= bytes) { clearTimeout(timer); chunks.length = 0; resolve(have.subarray(0, bytes)); }
    };
    waiter();
  });
  return {
    login: async (imei) => { socket.write(encodeLogin(imei)); return (await next(1))[0]; },
    send: async (records) => { socket.write(encodeAvlPacket(records)); return (await next(4)).readUInt32BE(0); },
    close: () => socket.destroy()
  };
}

let clock = 0;
// A report from "a few seconds ago"; each call is later than the previous one
const fix = (lat, lng, speed = 30) => ({
  timestamp: new Date(Date.now() - 60 * 1000 + (clock += 1000)),
  lat, lng, altitude: 1300, heading: 0, satellites: 9, speed, io: {}
});

const vehicle = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'T', model: 'T1', fuelType: 'Diesel' });
let imeiCounter = 0;
const nextImei = () => `35630704255${String(1000 + imeiCounter++)}`;

const signUp = async (org, email) => {
  const res = await api('POST', '/auth/register', { body: { organizationName: org, name: 'Admin', email, password: 'password123' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

// org + vehicle + connected Teltonika tracker
async function setup(name) {
  const org = await signUp(name, `admin@${name.toLowerCase().replace(/\W/g, '')}.example`);
  const v = await api('POST', '/vehicles', { token: org.token, body: vehicle(`${name.slice(0, 3).toUpperCase()} 1`) });
  const imei = nextImei();
  const dev = await api('POST', '/devices', { token: org.token, body: { name: 'T', imei, vehicle: v.body.data._id } });
  assert.equal(dev.status, 201);
  const t = tracker();
  assert.equal(await t.login(imei), 1);
  return { org, vehicle: v.body.data, device: dev.body.data, t };
}

const alerts = async (token) =>
  (await api('GET', '/notifications', { token })).body.data.filter((n) => ['speeding', 'geofence_enter', 'geofence_exit'].includes(n.type));

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: String(TCP_PORT), GT06_TCP_PORT: '0', GPS_TCP_HOST: '127.0.0.1', JWT_SECRET: 'test-secret', FLEETNOVA_DATA_FILE: DATA_FILE
    },
    stdio: 'ignore'
  });
  await waitForServer();
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

test('geometry helpers', () => {
  const circle = { shape: 'circle', center: { lat: 47.9188, lng: 106.9176 }, radiusM: 500 };
  assert.equal(isInsideGeofence(circle, 47.9188, 106.9176), true);
  assert.equal(isInsideGeofence(circle, 47.9188 + 0.003, 106.9176), true); // ~333 m
  assert.equal(isInsideGeofence(circle, 47.9188 + 0.01, 106.9176), false); // ~1.1 km
  const square = { shape: 'polygon', polygon: [[47.9, 106.9], [47.9, 107.0], [48.0, 107.0], [48.0, 106.9]] };
  assert.equal(isInsideGeofence(square, 47.95, 106.95), true);
  assert.equal(isInsideGeofence(square, 48.05, 106.95), false);
  assert.ok(Math.abs(haversineMeters(47.9, 106.9, 47.91, 106.9) - 1112) < 5);
});

test('geofence API validates input and is isolated per organization', async () => {
  const a = await signUp('Fence A', 'a@fence.example');
  const b = await signUp('Fence B', 'b@fence.example');
  const circle = { name: 'Depot', shape: 'circle', center: { lat: 47.9188, lng: 106.9176 }, radiusM: 300 };

  assert.equal((await api('POST', '/geofences', { token: a.token, body: { ...circle, radiusM: 5 } })).status, 400);
  assert.equal((await api('POST', '/geofences', { token: a.token, body: { ...circle, center: { lat: 99, lng: 0 } } })).status, 400);
  assert.equal((await api('POST', '/geofences', { token: a.token, body: { name: 'x', shape: 'polygon', polygon: [[1, 1], [2, 2]] } })).status, 400);
  assert.equal((await api('POST', '/geofences', { token: a.token, body: { ...circle, name: '' } })).status, 400);
  assert.equal((await api('POST', '/geofences', { token: a.token, body: { ...circle, color: 'red' } })).status, 400);

  const ok = await api('POST', '/geofences', { token: a.token, body: circle });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const poly = await api('POST', '/geofences', {
    token: a.token,
    body: { name: 'Zone', shape: 'polygon', polygon: [[47.9, 106.9], [47.9, 107.0], [48.0, 106.95]] }
  });
  assert.equal(poly.status, 201);

  assert.equal((await api('GET', '/geofences', { token: a.token })).body.data.length, 2);
  assert.equal((await api('GET', '/geofences', { token: b.token })).body.data.length, 0);
  assert.equal((await api('PUT', `/geofences/${ok.body.data._id}`, { token: b.token, body: { name: 'hax' } })).status, 404);
  assert.equal((await api('DELETE', `/geofences/${ok.body.data._id}`, { token: b.token })).status, 404);

  // B cannot restrict a fence to A's vehicle
  const va = await api('POST', '/vehicles', { token: a.token, body: vehicle('FNC 1') });
  assert.equal((await api('POST', '/geofences', { token: b.token, body: { ...circle, vehicles: [va.body.data._id] } })).status, 404);

  const upd = await api('PUT', `/geofences/${ok.body.data._id}`, { token: a.token, body: { name: 'Main depot', radiusM: 400 } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.radiusM, 400);
  assert.equal((await api('DELETE', `/geofences/${poly.body.data._id}`, { token: a.token })).status, 200);
});

test('enter / exit alerts, no alert for the very first position, one alert per crossing', async () => {
  const { org, t } = await setup('Fence Alerts');
  const fence = await api('POST', '/geofences', {
    token: org.token,
    body: { name: 'City depot', shape: 'circle', center: { lat: 47.9188, lng: 106.9176 }, radiusM: 500 }
  });
  assert.equal(fence.status, 201);

  // first ever report happens to be inside the fence -> no "entered" alert
  assert.equal(await t.send([fix(47.9188, 106.9176)]), 1);
  assert.equal((await alerts(org.token)).length, 0);

  // leaves the fence
  assert.equal(await t.send([fix(47.95, 106.9176)]), 1);
  let list = await alerts(org.token);
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'geofence_exit');
  assert.equal(list[0].params.geofence, 'City depot');
  assert.match(list[0].message, /left "City depot"/);
  assert.equal(list[0].messageKey, '{vehicle} left "{geofence}".');

  // keeps driving outside: nothing new
  assert.equal(await t.send([fix(47.96, 106.9176)]), 1);
  assert.equal((await alerts(org.token)).length, 1);

  // returns: "entered" (flapping back out immediately is suppressed by the cool-down, state stays correct)
  assert.equal(await t.send([fix(47.9188, 106.9176)]), 1);
  list = await alerts(org.token);
  assert.deepEqual(list.map((n) => n.type).sort(), ['geofence_enter', 'geofence_exit']);
  t.close();
});

test('geofence options: enter-only fences and per-vehicle fences', async () => {
  const { org, vehicle: v, t } = await setup('Fence Options');
  const other = await api('POST', '/vehicles', { token: org.token, body: vehicle('OTH 1') });
  const center = { lat: 47.9188, lng: 106.9176 };
  // applies to another vehicle only -> must never alert for this tracker
  await api('POST', '/geofences', { token: org.token, body: { name: 'Other only', shape: 'circle', center, radiusM: 500, vehicles: [other.body.data._id] } });
  // enter only
  await api('POST', '/geofences', { token: org.token, body: { name: 'Enter only', shape: 'circle', center, radiusM: 500, alertOnExit: false, vehicles: [v._id] } });

  assert.equal(await t.send([fix(47.95, 106.9176)]), 1); // outside (initialises state)
  assert.equal(await t.send([fix(47.9188, 106.9176)]), 1); // enters both circles geometrically
  assert.equal(await t.send([fix(47.95, 106.9176)]), 1); // leaves

  const list = await alerts(org.token);
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'geofence_enter');
  assert.equal(list[0].params.geofence, 'Enter only');
  t.close();
});

test('speeding alert: needs the org limit, two consecutive reports, once per episode', async () => {
  const { org, t } = await setup('Speeders');

  // validation of the organization setting
  assert.equal((await api('PUT', '/organization', { token: org.token, body: { settings: { speedLimitKmh: 500 } } })).status, 400);
  assert.equal((await api('PUT', '/organization', { token: org.token, body: { settings: { speedLimitKmh: 'fast' } } })).status, 400);

  // no limit configured -> never alerts
  assert.equal(await t.send([fix(47.9, 106.9, 150), fix(47.91, 106.9, 150)]), 2);
  assert.equal((await alerts(org.token)).length, 0);

  const set = await api('PUT', '/organization', { token: org.token, body: { settings: { speedLimitKmh: 90 } } });
  assert.equal(set.status, 200);
  assert.equal(set.body.data.settings.speedLimitKmh, 90);

  // a single spike does not alert
  assert.equal(await t.send([fix(47.92, 106.9, 130)]), 1);
  assert.equal(await t.send([fix(47.93, 106.9, 60)]), 1);
  assert.equal((await alerts(org.token)).length, 0);

  // sustained speeding alerts once, with the actual numbers
  assert.equal(await t.send([fix(47.94, 106.9, 120), fix(47.95, 106.9, 125), fix(47.96, 106.9, 130)]), 3);
  const list = await alerts(org.token);
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'speeding');
  assert.equal(list[0].params.limit, 90);
  assert.equal(list[0].params.speed, 125);
  assert.match(list[0].message, /125 km\/h \(limit 90 km\/h\)/);

  // the next episode (after slowing down) is a new alert once the cool-down is over -> within it, still one
  assert.equal(await t.send([fix(47.97, 106.9, 50), fix(47.98, 106.9, 140), fix(47.99, 106.9, 140)]), 3);
  assert.equal((await alerts(org.token)).length, 1);
  t.close();
});

test('old (buffered) records and other organizations never raise alerts', async () => {
  const a = await setup('Buffered A');
  const b = await setup('Buffered B');
  await api('PUT', '/organization', { token: a.org.token, body: { settings: { speedLimitKmh: 50 } } });
  await api('POST', '/geofences', { token: a.org.token, body: { name: 'F', shape: 'circle', center: { lat: 48, lng: 107 }, radiusM: 500 } });

  // an hour-old backlog at 200 km/h through the fence: stored, but not "live"
  const old = (s, lat, lng) => ({ ...fix(lat, lng, 200), timestamp: new Date(Date.now() - 3 * 3600 * 1000 + s * 1000) });
  assert.equal(await a.t.send([old(0, 47.99, 107), old(10, 48, 107), old(20, 48.01, 107), old(30, 48.02, 107)]), 4);
  assert.equal((await alerts(a.org.token)).length, 0);

  // B has no limit and no fences; A's rules do not apply to it
  assert.equal(await b.t.send([fix(48, 107, 200), fix(48, 107, 200)]), 2);
  assert.equal((await alerts(b.org.token)).length, 0);
  a.t.close();
  b.t.close();
});
