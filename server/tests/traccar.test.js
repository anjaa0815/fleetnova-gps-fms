import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

const HTTP_PORT = 4300 + Math.floor(Math.random() * 90);
const MOCK_PORT = 4500 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-traccar-test-${process.pid}.json`);
const TOKEN = 'forward-secret-token';

let server;
let mock;
const traccarCalls = [];
let traccarDevices = [];

async function api(method, route, { token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* plain */ }
  return { status: res.status, body: parsed };
}

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  // Mock Traccar REST API (device list only)
  mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      traccarCalls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'GET') {
        const uid = new URL(req.url, 'http://x').searchParams.get('uniqueId');
        return res.end(JSON.stringify(traccarDevices.filter((d) => d.uniqueId === uid)));
      }
      if (req.method === 'POST') {
        const d = { id: traccarDevices.length + 1, ...JSON.parse(raw) };
        traccarDevices.push(d);
        return res.end(JSON.stringify(d));
      }
      if (req.method === 'DELETE') {
        traccarDevices = traccarDevices.filter((d) => `/api/devices/${d.id}` !== req.url);
        res.statusCode = 204;
        return res.end();
      }
      return res.end('{}');
    });
  });
  await new Promise((r) => mock.listen(MOCK_PORT, '127.0.0.1', r));

  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: '0', GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
      ADMIN_EMAIL: 'platform@traccar.example', ADMIN_PASSWORD: 'platform-pass-1',
      TRACCAR_FORWARD_TOKEN: TOKEN, TRACCAR_URL: `http://127.0.0.1:${MOCK_PORT}`, TRACCAR_TOKEN: 'api-token'
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

const forward = (uniqueId, position, headers = { 'X-Traccar-Token': TOKEN }) =>
  api('POST', '/gps/traccar', { headers, body: { device: { uniqueId, name: 'x' }, position } });

const fix = (over = {}) => ({
  valid: true, latitude: 47.9184, longitude: 106.9177, speed: 10, course: 90, altitude: 1300,
  fixTime: new Date(Date.now() - 60000).toISOString().replace('Z', '+00:00'),
  attributes: { ignition: true, sat: 11, totalDistance: 123456 }, ...over
});

test('Traccar forwarding: device sync, token auth, conversion and tenant isolation', async () => {
  const reg = await api('POST', '/auth/register', { body: { organizationName: 'Traccar Org', name: 'A', email: 'a@traccar.example', password: 'password123' } });
  const token = reg.body.data.token;
  const other = await api('POST', '/auth/register', { body: { organizationName: 'Other Org', name: 'B', email: 'b@traccar.example', password: 'password123' } });

  // Registering a Traccar-received device mirrors it into Traccar
  const created = await api('POST', '/devices', { token, body: { name: 'Truck 1', imei: 'TRK-000001', protocol: 'traccar' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.traccarSync, 'synced');
  assert.deepEqual(traccarDevices.map((d) => d.uniqueId), ['TRK-000001']);
  assert.ok(traccarCalls.every((c) => c.auth === 'Bearer api-token'));
  assert.equal((await api('POST', '/devices', { token, body: { name: 'bad', imei: 'x y', protocol: 'traccar' } })).status, 400);
  assert.equal((await api('GET', '/devices/connection-info', { token })).body.data.traccar.enabled, true);

  // Token required (header, bearer or query)
  assert.equal((await forward('TRK-000001', fix(), {})).status, 401);
  assert.equal((await forward('TRK-000001', fix(), { 'X-Traccar-Token': 'nope' })).status, 401);
  assert.equal((await api('POST', `/gps/traccar?token=${TOKEN}`, { body: { device: { uniqueId: 'TRK-000001' }, position: fix({ fixTime: new Date(Date.now() - 120000).toISOString() }) } })).status, 200);
  assert.equal((await forward('TRK-000001', fix(), { Authorization: `Bearer ${TOKEN}` })).status, 200);

  // Malformed / unknown / wrong protocol
  assert.equal((await api('POST', '/gps/traccar', { headers: { 'X-Traccar-Token': TOKEN }, body: { nope: 1 } })).status, 400);
  assert.equal((await forward('UNKNOWN-1', fix())).status, 404);
  const tele = await api('POST', '/devices', { token, body: { name: 'Tele', imei: '356307042441234' } });
  assert.equal(tele.status, 201);
  assert.equal((await forward('356307042441234', fix())).status, 404); // only protocol "traccar" devices accept forwarding

  // No fix and impossible positions are acknowledged but not stored
  assert.equal((await forward('TRK-000001', fix({ valid: false, fixTime: new Date(Date.now() - 30000).toISOString() }))).status, 200);
  assert.equal((await forward('TRK-000001', fix({ latitude: 0, longitude: 0, fixTime: new Date(Date.now() - 20000).toISOString() }))).status, 200);

  // Knots -> km/h, ignition and odometer attributes, live API in the right organization only
  const live = await api('GET', '/tracking/live', { token });
  const dev = live.body.data.find((d) => d.name === 'Truck 1');
  assert.ok(dev, JSON.stringify(live.body));
  assert.equal(dev.speed, 19); // 10 kn = 18.52 km/h
  assert.equal(dev.ignition, true);
  assert.equal(dev.satellites, 11);
  assert.equal((await api('GET', '/tracking/live', { token: other.body.data.token })).body.data.length, 0);

  // Deleting the device removes it from Traccar as well
  assert.equal((await api('DELETE', `/devices/${created.body.data._id}`, { token })).status, 200);
  assert.deepEqual(traccarDevices, []);
});

test('Traccar sync failure does not block device registration', async () => {
  const reg = await api('POST', '/auth/register', { body: { organizationName: 'Down Org', name: 'A', email: 'c@traccar.example', password: 'password123' } });
  mock.close();
  await new Promise((r) => setTimeout(r, 100));
  const created = await api('POST', '/devices', { token: reg.body.data.token, body: { name: 'T', imei: 'TRK-000002', protocol: 'traccar' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.traccarSync, 'failed');
});
