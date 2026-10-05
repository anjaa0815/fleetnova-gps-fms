import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';
import { positionRetentionDays, PLANS } from '../config/plans.js';

const HTTP_PORT = 7800 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-retention-test-${process.pid}.json`);
const SUPER = { email: 'platform@retention.example', password: 'platform-pass-1' };
const DAY = 24 * 60 * 60 * 1000;

let server;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* plain text */ }
  return { status: res.status, body: parsed };
}

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: '0', GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
      ADMIN_EMAIL: SUPER.email, ADMIN_PASSWORD: SUPER.password,
      POSITION_PURGE_DELAY_MS: '1500', POSITION_PURGE_INTERVAL_MS: '600'
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

test('retention days per plan, with a safe environment override', () => {
  assert.equal(positionRetentionDays('trial', {}), PLANS.trial.positionRetentionDays);
  assert.ok(PLANS.trial.positionRetentionDays < PLANS.basic.positionRetentionDays);
  assert.ok(PLANS.basic.positionRetentionDays < PLANS.pro.positionRetentionDays);
  assert.equal(positionRetentionDays('unknown-plan', {}), PLANS.trial.positionRetentionDays);
  assert.equal(positionRetentionDays('pro', { POSITION_RETENTION_DAYS: '14' }), 14);
  assert.equal(positionRetentionDays('pro', { POSITION_RETENTION_DAYS: '-1' }), -1);
  // typos and 0 must never mean "delete everything"
  for (const bad of ['0', 'abc', '', '1.5', '-5']) {
    assert.equal(positionRetentionDays('pro', { POSITION_RETENTION_DAYS: bad }), PLANS.pro.positionRetentionDays, bad);
  }
});

const AGES = [5, 40, 100, 300];

async function orgWithPositions(name, email, plan, platformToken) {
  const reg = await api('POST', '/auth/register', { body: { organizationName: name, name: 'A', email, password: 'password123' } });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const { token, organization } = reg.body.data;
  if (plan !== 'trial') {
    const put = await api('PUT', `/platform/organizations/${organization._id}`, { token: platformToken, body: { plan } });
    assert.equal(put.status, 200, JSON.stringify(put.body));
  }
  const dev = await api('POST', '/devices', { token, body: { name: 'Phone', imei: `ret-${plan}-${Math.floor(Math.random() * 1e6)}`, protocol: 'osmand' } });
  assert.equal(dev.status, 201, JSON.stringify(dev.body));
  for (const age of AGES) {
    const ts = new Date(Date.now() - age * DAY).toISOString();
    const res = await fetch(`${BASE}/gps/osmand?id=${dev.body.data.imei}&key=${dev.body.data.secret}&lat=47.9&lon=106.9&speed=5&timestamp=${encodeURIComponent(ts)}`);
    assert.equal(res.status, 200, await res.text());
  }
  return { token, deviceId: dev.body.data._id };
}

// Number of stored points within an hour of "age days ago"
async function pointsAt(org, age) {
  const centre = Date.now() - age * DAY;
  const q = `deviceId=${org.deviceId}&from=${encodeURIComponent(new Date(centre - 3600e3).toISOString())}&to=${encodeURIComponent(new Date(centre + 3600e3).toISOString())}`;
  const res = await api('GET', `/tracking/history?${q}`, { token: org.token });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.totalPoints;
}

test('expired positions are purged per organization according to its plan', async () => {
  const platform = (await api('POST', '/auth/login', { body: SUPER })).body.data.token;
  const trial = await orgWithPositions('Ret Trial', 't@retention.example', 'trial', platform); // 30 days
  const basic = await orgWithPositions('Ret Basic', 'b@retention.example', 'basic', platform); // 90 days
  const enterprise = await orgWithPositions('Ret Ent', 'e@retention.example', 'enterprise', platform); // 730 days

  // the worker runs every 600 ms after a 1.5 s delay
  await new Promise((r) => setTimeout(r, 4000));

  assert.deepEqual(await Promise.all(AGES.map((a) => pointsAt(trial, a))), [1, 0, 0, 0]);
  assert.deepEqual(await Promise.all(AGES.map((a) => pointsAt(basic, a))), [1, 1, 0, 0]);
  assert.deepEqual(await Promise.all(AGES.map((a) => pointsAt(enterprise, a))), [1, 1, 1, 1]);

  // the limits shown to the organization include the retention
  const mine = await api('GET', '/organization', { token: trial.token });
  assert.equal(mine.body.data.limits.positionRetentionDays, 30);
});
