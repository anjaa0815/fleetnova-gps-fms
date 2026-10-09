import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

// A plan limit holds when many requests arrive at the same moment: a "count, then create" check lets several of them
// through. These tests fire many creations at once at an organization on the trial plan (10 vehicles, 10 devices,
// 5 users) and count what exists afterwards. (The JSON store never interleaves two requests, so the race only shows
// on MongoDB: run with TEST_MONGODB_URI to see it.)
// port band of this file is separate from every other test file (the runner runs files in parallel)
const PORT = 8600 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-plan-limits-${process.pid}.json`);
const SUPER = { email: 'platform@test.example', password: 'platform-pass-1' };

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
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not start');
}

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      GPS_TCP_PORT: '0',
      GT06_TCP_PORT: '0',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      JWT_SECRET: 'test-secret', RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false',
      FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
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

async function newOrg(name) {
  const sup = (await api('POST', '/auth/login', { body: SUPER })).body.data.token;
  const created = await api('POST', '/platform/organizations', {
    token: sup,
    body: { organizationName: name, plan: 'trial', adminName: 'Admin', adminEmail: `admin@${name.toLowerCase()}.example`, adminPassword: 'password123' }
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const admin = (await api('POST', '/auth/login', { body: { email: `admin@${name.toLowerCase()}.example`, password: 'password123' } })).body.data;
  return { org: created.body.data.organization, token: admin.token, sup };
}

const tally = (results) => results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

test('vehicles: 30 at once on a 10-vehicle plan create exactly 10', async () => {
  const { token } = await newOrg('Vlimit');
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    api('POST', '/vehicles', { token, body: { registrationNumber: `LIM ${i}`, vehicleType: 'Truck', brand: 'B', model: 'M', fuelType: 'Diesel' } })));
  assert.deepEqual(tally(results), { 201: 10, 403: 20 }, JSON.stringify(tally(results)));
  assert.equal((await api('GET', '/vehicles?limit=100', { token })).body.data.length, 10);
});

test('devices: 30 at once on a 10-device plan register exactly 10', async () => {
  const { token } = await newOrg('Dlimit');
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) =>
    api('POST', '/devices', { token, body: { name: `Tracker ${i}`, imei: String(100000000000000 + i), protocol: 'teltonika' } })));
  assert.deepEqual(tally(results), { 201: 10, 403: 20 }, JSON.stringify(tally(results)));
  assert.equal((await api('GET', '/devices', { token })).body.data.length, 10);
});

test('users: the administrator and the platform owner adding users at once stay within 5 users', async () => {
  const { org, token, sup } = await newOrg('Ulimit');
  const person = (i) => ({ name: `P${i}`, email: `p${i}@ulimit.example`, password: 'password123', role: 'driver' });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0
      ? api('POST', '/auth/users', { token, body: person(i) })
      : api('POST', `/platform/organizations/${org._id}/users`, { token: sup, body: person(i) })));
  assert.deepEqual(tally(results), { 201: 4, 403: 16 }, JSON.stringify(tally(results)));
  assert.equal((await api('GET', '/auth/users', { token })).body.data.length, 5, 'the administrator + 4 new users');
});

test('a request that fails does not hold the others back, and the limit frees up after a delete', async () => {
  const { token } = await newOrg('Flimit');
  const vehicle = (i) => ({ registrationNumber: `FREE ${i}`, vehicleType: 'Truck', brand: 'B', model: 'M', fuelType: 'Diesel' });
  // invalid and duplicate requests in the middle of valid ones
  const batch = await Promise.all([
    api('POST', '/vehicles', { token, body: { registrationNumber: 'ONLY' } }),
    api('POST', '/vehicles', { token, body: vehicle(1) }),
    api('POST', '/vehicles', { token, body: vehicle(1) }),
    api('POST', '/vehicles', { token, body: vehicle(2) })
  ]);
  // which of the two identical requests reaches the server first is not fixed: exactly one of them is created
  const [invalid, dupA, dupB, other] = batch.map((r) => r.status);
  assert.equal(invalid, 400);
  assert.deepEqual([dupA, dupB].sort(), [201, 400]);
  assert.equal(other, 201);
  const filled = await Promise.all(Array.from({ length: 10 }, (_, i) => api('POST', '/vehicles', { token, body: vehicle(10 + i) })));
  assert.equal(tally(filled)[201], 8, 'room for 8 more');
  const first = (await api('GET', '/vehicles?limit=100', { token })).body.data[0];
  assert.equal((await api('DELETE', `/vehicles/${first._id}`, { token })).status, 200);
  assert.equal((await api('POST', '/vehicles', { token, body: vehicle(99) })).status, 201, 'a deleted vehicle frees its place');
  assert.equal((await api('POST', '/vehicles', { token, body: vehicle(100) })).status, 403);
});
