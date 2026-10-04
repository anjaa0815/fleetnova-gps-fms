import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { encodeAvlPacket, encodeLogin } from '../gps/protocols/teltonika.js';

const HTTP_PORT = 3800 + Math.floor(Math.random() * 90);
const TCP_PORT = 5100 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-gps-test-${process.pid}.json`);
const SUPER = { email: 'platform@gps.example', password: 'platform-pass-1' };

let server;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* plain text response */ }
  return { status: res.status, body: parsed };
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

// Minimal tracker: connects, optionally logs in, sends buffers and collects the replies
function tracker() {
  const socket = net.connect(TCP_PORT, '127.0.0.1');
  const chunks = [];
  let waiter = null;
  let closed = false;
  socket.on('data', (d) => { chunks.push(d); waiter?.(); });
  socket.on('close', () => { closed = true; waiter?.(); });
  socket.on('error', () => {});

  const nextReply = (bytes) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No reply from server')), 4000);
    const check = () => {
      const have = Buffer.concat(chunks);
      if (have.length >= bytes) {
        clearTimeout(timer);
        chunks.length = 0;
        if (have.length > bytes) chunks.push(have.subarray(bytes));
        resolve(have.subarray(0, bytes));
      } else if (closed) {
        clearTimeout(timer);
        resolve(have);
      }
    };
    waiter = check;
    check();
  });

  return {
    isClosed: () => closed,
    login: async (imei) => { socket.write(encodeLogin(imei)); return (await nextReply(1))[0]; },
    send: async (buffer) => { socket.write(buffer); const r = await nextReply(4); return r.length === 4 ? r.readUInt32BE(0) : null; },
    close: () => socket.destroy()
  };
}

const rec = (offsetSec, lat, lng, extra = {}) => ({
  timestamp: new Date(Date.now() - 3600 * 1000 + offsetSec * 1000),
  lat, lng, altitude: 1300, heading: 90, satellites: 9, speed: 40, io: { 239: 1 }, ...extra
});

const vehicle = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'Test', model: 'T1', fuelType: 'Diesel' });
let counter = 0;
const nextImei = () => `35630704244${String(1000 + counter++)}`;

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(HTTP_PORT),
      HOST: '127.0.0.1',
      GPS_TCP_PORT: String(TCP_PORT), GT06_TCP_PORT: '0',
      GPS_TCP_HOST: '127.0.0.1',
      JWT_SECRET: 'test-secret', RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false',
      FLEETNOVA_DATA_FILE: DATA_FILE,
      ADMIN_EMAIL: SUPER.email,
      ADMIN_PASSWORD: SUPER.password
    },
    stdio: 'ignore'
  });
  await waitForServer();
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

const signUp = async (org, email) => {
  const res = await api('POST', '/auth/register', { body: { organizationName: org, name: `${org} admin`, email, password: 'password123' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

test('device registration validates input and keeps IMEIs unique platform-wide', async () => {
  const a = await signUp('Dev A', 'a@dev.example');
  const b = await signUp('Dev B', 'b@dev.example');
  const imei = nextImei();

  assert.equal((await api('POST', '/devices', { token: a.token, body: { name: 'x', imei: '123' } })).status, 400);
  const ok = await api('POST', '/devices', { token: a.token, body: { name: 'Truck tracker', imei } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.secret, undefined); // Teltonika devices have no HTTP secret

  // Another organization cannot register the same tracker
  assert.equal((await api('POST', '/devices', { token: b.token, body: { name: 'Stolen', imei } })).status, 400);

  // ...and cannot see, change or delete it
  assert.equal((await api('GET', '/devices', { token: b.token })).body.data.length, 0);
  assert.equal((await api('PUT', `/devices/${ok.body.data._id}`, { token: b.token, body: { name: 'hax' } })).status, 404);
  assert.equal((await api('DELETE', `/devices/${ok.body.data._id}`, { token: b.token })).status, 404);

  // One tracker per vehicle; vehicles of other organizations cannot be linked
  const v = await api('POST', '/vehicles', { token: a.token, body: vehicle('DEV 1') });
  const vb = await api('POST', '/vehicles', { token: b.token, body: vehicle('DEV 2') });
  assert.equal((await api('PUT', `/devices/${ok.body.data._id}`, { token: a.token, body: { vehicle: vb.body.data._id } })).status, 404);
  assert.equal((await api('PUT', `/devices/${ok.body.data._id}`, { token: a.token, body: { vehicle: v.body.data._id } })).status, 200);
  const second = await api('POST', '/devices', { token: a.token, body: { name: 'Second', imei: nextImei(), vehicle: v.body.data._id } });
  assert.equal(second.status, 400);
});

test('Teltonika tracker: login, data, live position and history', async () => {
  const a = await signUp('Track A', 'a@track.example');
  const b = await signUp('Track B', 'b@track.example');
  const v = await api('POST', '/vehicles', { token: a.token, body: vehicle('TRK 1') });
  const imei = nextImei();
  const dev = await api('POST', '/devices', { token: a.token, body: { name: 'T1', imei, vehicle: v.body.data._id } });
  assert.equal(dev.status, 201);

  // Unknown tracker is rejected
  const stranger = tracker();
  assert.equal(await stranger.login(nextImei()), 0);

  const t = tracker();
  assert.equal(await t.login(imei), 1);
  // Moving north from Ulaanbaatar: ~0.01 deg latitude per step
  const records = [0, 60, 120].map((s, i) => rec(s, 47.9 + i * 0.01, 106.9));
  assert.equal(await t.send(encodeAvlPacket(records)), 3);

  const live = await api('GET', '/tracking/live', { token: a.token });
  assert.equal(live.body.data.length, 1);
  assert.equal(live.body.data[0].lat, 47.92);
  assert.equal(live.body.data[0].vehicle.registrationNumber, 'TRK 1');
  assert.equal(live.body.data[0].online, true);
  assert.equal(live.body.data[0].ignition, true);

  const history = await api('GET', `/tracking/history?vehicleId=${v.body.data._id}`, { token: a.token });
  assert.equal(history.status, 200);
  assert.equal(history.body.data.totalPoints, 3);
  assert.ok(history.body.data.distanceKm > 2 && history.body.data.distanceKm < 2.5, `distance ${history.body.data.distanceKm}`);
  assert.equal(history.body.data.points[0].lat, 47.9);

  // Retransmission (missed ACK) must not duplicate points
  assert.equal(await t.send(encodeAvlPacket(records)), 3);
  const again = await api('GET', `/tracking/history?vehicleId=${v.body.data._id}`, { token: a.token });
  assert.equal(again.body.data.totalPoints, 3);

  // Codec 8 Extended works on the same connection
  assert.equal(await t.send(encodeAvlPacket([rec(180, 47.93, 106.9)], { extended: true })), 1);
  assert.equal((await api('GET', '/tracking/live', { token: a.token })).body.data[0].lat, 47.93);

  // Another organization sees nothing of it
  assert.equal((await api('GET', '/tracking/live', { token: b.token })).body.data.length, 0);
  assert.equal((await api('GET', `/tracking/history?vehicleId=${v.body.data._id}`, { token: b.token })).status, 404);
  assert.equal((await api('GET', `/tracking/history?deviceId=${dev.body.data._id}`, { token: b.token })).status, 404);

  t.close();
  stranger.close();
});

test('bad data is dropped without breaking the connection', async () => {
  const a = await signUp('Bad Data', 'a@bad.example');
  const v = await api('POST', '/vehicles', { token: a.token, body: vehicle('BAD 1') });
  const imei = nextImei();
  await api('POST', '/devices', { token: a.token, body: { name: 'T', imei, vehicle: v.body.data._id } });

  const t = tracker();
  assert.equal(await t.login(imei), 1);

  // corrupt CRC -> acknowledged with 0 records so the tracker retries
  const corrupt = encodeAvlPacket([rec(0, 47.9, 106.9)]);
  corrupt[corrupt.length - 1] ^= 0xff;
  assert.equal(await t.send(corrupt), 0);

  // no fix (0,0), impossible latitude, timestamp from the future: consumed but not stored
  const junk = [
    rec(0, 0, 0),
    rec(1, 91, 106.9),
    { ...rec(2, 47.9, 106.9), timestamp: new Date(Date.now() + 5 * 24 * 3600 * 1000) },
    rec(3, 47.95, 106.95)
  ];
  assert.equal(await t.send(encodeAvlPacket(junk)), 4);
  const history = await api('GET', `/tracking/history?vehicleId=${v.body.data._id}`, { token: a.token });
  assert.equal(history.body.data.totalPoints, 1);
  assert.equal(history.body.data.points[0].lat, 47.95);

  // garbage bytes close the connection
  const rogue = tracker();
  rogue.close();
  const g = net.connect(TCP_PORT, '127.0.0.1');
  g.on('error', () => {});
  g.write(Buffer.from('GET / HTTP/1.1\r\n\r\n'));
  await new Promise((resolve) => g.on('close', resolve));
  t.close();
});

test('suspended organizations and removed devices are cut off', async () => {
  const org = await signUp('Cut Off', 'a@cut.example');
  const platform = (await api('POST', '/auth/login', { body: SUPER })).body.data.token;
  const imei = nextImei();
  const dev = await api('POST', '/devices', { token: org.token, body: { name: 'T', imei } });

  const t = tracker();
  assert.equal(await t.login(imei), 1);
  assert.equal(await t.send(encodeAvlPacket([rec(0, 47.9, 106.9)])), 1);

  await api('PUT', `/platform/organizations/${org.organization._id}`, { token: platform, body: { status: 'suspended' } });
  const blocked = tracker();
  assert.equal(await blocked.login(imei), 0);
  // an already open connection stops being served
  assert.equal(await t.send(encodeAvlPacket([rec(60, 47.91, 106.9)])), null);
  assert.ok(t.isClosed());

  await api('PUT', `/platform/organizations/${org.organization._id}`, { token: platform, body: { status: 'active' } });
  assert.equal((await api('DELETE', `/devices/${dev.body.data._id}`, { token: org.token })).status, 200);
  const gone = tracker();
  assert.equal(await gone.login(imei), 0);
});

test('HTTP (OsmAnd) devices need their secret key', async () => {
  const a = await signUp('Http A', 'a@http.example');
  const v = await api('POST', '/vehicles', { token: a.token, body: vehicle('HTTP 1') });
  const dev = await api('POST', '/devices', {
    token: a.token,
    body: { name: 'Phone', imei: 'phone-driver-1', protocol: 'osmand', vehicle: v.body.data._id }
  });
  assert.equal(dev.status, 201);
  const { secret } = dev.body.data;
  assert.match(secret, /^[0-9a-f]{24}$/);

  const ts = Math.floor(Date.now() / 1000);
  const url = (extra) => `/gps/osmand?id=phone-driver-1&lat=47.92&lon=106.92&timestamp=${ts}&speed=10&bearing=45${extra}`;
  assert.equal((await api('GET', url(''))).status, 401);
  assert.equal((await api('GET', url('&key=wrong'))).status, 401);
  assert.equal((await api('GET', '/gps/osmand?key=x')).status, 400);

  const ok = await api('GET', url(`&key=${secret}`));
  assert.equal(ok.status, 200);
  assert.equal(ok.body, 'OK');

  const live = await api('GET', '/tracking/live', { token: a.token });
  assert.equal(live.body.data.length, 1);
  assert.equal(live.body.data[0].lat, 47.92);
  assert.equal(live.body.data[0].speed, 19); // 10 knots = 18.52 km/h

  // A Teltonika tracker cannot be impersonated over HTTP, whatever key is sent
  const imei = nextImei();
  await api('POST', '/devices', { token: a.token, body: { name: 'T', imei } });
  assert.equal((await api('GET', `/gps/osmand?id=${imei}&lat=47.9&lon=106.9&key=anything`)).status, 401);
});

test('plan device limit is enforced', async () => {
  const a = await signUp('Limit Devices', 'a@limitdev.example');
  for (let i = 0; i < 10; i += 1) {
    const res = await api('POST', '/devices', { token: a.token, body: { name: `D${i}`, imei: nextImei() } });
    assert.equal(res.status, 201, `device ${i}`);
  }
  assert.equal((await api('POST', '/devices', { token: a.token, body: { name: 'one too many', imei: nextImei() } })).status, 403);
});
