import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

const HTTP_PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-ids-test-${process.pid}.json`);
let server;

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

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: '0', GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv()
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
  fs.rmSync(DATA_FILE, { force: true });
});

const vehicle = (n) => ({ registrationNumber: `ID ${n}`, vehicleType: 'Truck', brand: 'B', model: 'M', fuelType: 'Diesel', registrationExpiry: '2030-01-01', insuranceExpiry: '2030-01-01', fuelCapacity: 100, manufacturingYear: 2020 });

test('identifiers stay unique after deletions and under concurrent creates, per organization', async () => {
  const reg = async (name, email) => (await api('POST', '/auth/register', { body: { organizationName: name, name: 'A', email, password: 'password123' } })).body.data.token;
  const a = await reg('Ids A', 'a@ids.example');
  const b = await reg('Ids B', 'b@ids.example');

  const ids = [];
  for (let i = 1; i <= 5; i += 1) {
    const r = await api('POST', '/vehicles', { token: a, body: vehicle(i) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids.push(r.body.data.vehicleId);
  }
  assert.deepEqual(ids, ['VEH-1001', 'VEH-1002', 'VEH-1003', 'VEH-1004', 'VEH-1005']);

  // deleting a middle record used to make the next "count + 1" collide with VEH-1005
  const list = (await api('GET', '/vehicles', { token: a })).body.data;
  assert.equal((await api('DELETE', `/vehicles/${list.find((v) => v.vehicleId === 'VEH-1002')._id}`, { token: a })).status, 200);
  const next = await api('POST', '/vehicles', { token: a, body: vehicle(6) });
  assert.equal(next.status, 201, JSON.stringify(next.body));
  assert.equal(next.body.data.vehicleId, 'VEH-1006');

  // concurrent creates
  const burst = await Promise.all(Array.from({ length: 5 }, (_, i) => api('POST', '/vehicles', { token: a, body: vehicle(100 + i) })));
  assert.deepEqual(burst.map((r) => r.status), Array(5).fill(201), JSON.stringify(burst.find((r) => r.status !== 201)?.body));
  const burstIds = burst.map((r) => r.body.data.vehicleId);
  assert.equal(new Set(burstIds).size, 5);

  // another organization has its own sequence
  const other = await api('POST', '/vehicles', { token: b, body: vehicle(1) });
  assert.equal(other.body.data.vehicleId, 'VEH-1001');

  // fuel logs also create an expense each: concurrent fuel logs must not collide on either identifier
  const vid = next.body.data._id;
  const fuels = await Promise.all(Array.from({ length: 8 }, (_, i) => api('POST', '/fuel', {
    token: a,
    body: { vehicleId: vid, date: new Date(Date.now() - i * 60000).toISOString(), fuelType: 'Diesel', quantity: 10, pricePerLiter: 3000, odometerReading: 1000 + i, fuelStation: 'S' }
  })));
  assert.deepEqual(fuels.map((r) => r.status), Array(8).fill(201), JSON.stringify(fuels.find((r) => r.status !== 201)?.body));
  assert.equal(new Set(fuels.map((r) => r.body.data.fuelRecordId)).size, 8);
});
