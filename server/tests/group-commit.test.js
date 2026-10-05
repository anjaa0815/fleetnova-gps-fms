import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGroupCommit } from '../gps/groupCommit.js';
import { dbEnv } from './dbEnv.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('group commit: writes within the window share one flush, each caller waits for it', async () => {
  const batches = [];
  const gc = createGroupCommit(async (items) => { await sleep(5); batches.push(items); }, { delayMs: 20, maxItems: 100 });
  const results = await Promise.all([1, 2, 3, 4].map((n) => gc.add(n)));
  assert.equal(results.length, 4);
  assert.deepEqual(batches, [[1, 2, 3, 4]]);
  await gc.add(5); // a later write starts a new batch
  assert.deepEqual(batches, [[1, 2, 3, 4], [5]]);
});

test('group commit: a failed flush rejects every caller of the batch, the next batch works', async () => {
  let fail = true;
  const gc = createGroupCommit(async () => { if (fail) throw new Error('db down'); }, { delayMs: 10 });
  const settled = await Promise.allSettled([gc.add('a'), gc.add('b'), gc.add('c')]);
  assert.deepEqual(settled.map((s) => s.status), ['rejected', 'rejected', 'rejected']);
  assert.match(settled[0].reason.message, /db down/);
  fail = false;
  await gc.add('d');
});

test('group commit: a full batch is flushed at once; delay 0 writes straight through', async () => {
  const sizes = [];
  const full = createGroupCommit(async (items) => { sizes.push(items.length); }, { delayMs: 60000, maxItems: 3 });
  const t0 = Date.now();
  await Promise.all([full.add(1), full.add(2), full.add(3)]);
  assert.ok(Date.now() - t0 < 1000, 'must not wait for the long delay');
  assert.deepEqual(sizes, [3]);

  const direct = [];
  const off = createGroupCommit(async (items) => { direct.push(items.length); }, { delayMs: 0 });
  await Promise.all([off.add(1), off.add(2)]);
  assert.deepEqual(direct, [1, 1]);
});

// ---- tenant safety of the grouped writes: records of different organizations in the same batch ----
const HTTP_PORT = 5300 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-groupcommit-test-${process.pid}.json`);
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
      GPS_TCP_PORT: '0', GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret', GPS_BATCH_MS: '40',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv()
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('Server did not start');
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

async function org(name, email, prefix) {
  const reg = await api('POST', '/auth/register', { body: { organizationName: name, name: 'A', email, password: 'password123' } });
  const token = reg.body.data.token;
  const devices = [];
  for (let i = 0; i < 5; i += 1) {
    const d = await api('POST', '/devices', { token, body: { name: `${prefix}-${i}`, imei: `${prefix}device${i}`, protocol: 'osmand' } });
    assert.equal(d.status, 201, JSON.stringify(d.body));
    devices.push(d.body.data);
  }
  return { token, devices };
}

test('records of two organizations arriving in the same batch are stored under the right organization', async () => {
  const a = await org('Batch A', 'a@batch.example', 'aaa');
  const b = await org('Batch B', 'b@batch.example', 'bbb');
  const base = Date.now() - 600000;
  const sends = [];
  for (let n = 0; n < 6; n += 1) {
    for (const [owner, lat] of [[a, 47.9], [b, 48.9]]) {
      for (const d of owner.devices) {
        const ts = new Date(base + n * 10000).toISOString();
        sends.push(fetch(`${BASE}/gps/osmand?id=${d.imei}&key=${d.secret}&lat=${lat}&lon=106.9&speed=10&timestamp=${encodeURIComponent(ts)}`).then((r) => r.status));
      }
    }
  }
  // all 60 requests are in flight together, so they land in the same few batches
  assert.deepEqual([...new Set(await Promise.all(sends))], [200]);

  for (const [owner, lat] of [[a, 47.9], [b, 48.9]]) {
    for (const d of owner.devices) {
      const q = `deviceId=${d._id}&from=${encodeURIComponent(new Date(base - 60000).toISOString())}&to=${encodeURIComponent(new Date(base + 3600000).toISOString())}`;
      const res = await api('GET', `/tracking/history?${q}`, { token: owner.token });
      assert.equal(res.body.data.totalPoints, 6, `${d.name} stored ${res.body.data.totalPoints}`);
      assert.ok(res.body.data.points.every((p) => p.lat === lat), 'positions belong to this organization');
    }
    const live = await api('GET', '/tracking/live', { token: owner.token });
    assert.equal(live.body.data.length, 5);
    assert.ok(live.body.data.every((p) => p.lat === lat));
  }
});
