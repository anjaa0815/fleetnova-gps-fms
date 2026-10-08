import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

// port band of this file is separate from every other test file (the runner runs files in parallel)
const PORT = 8400 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-act-as-${process.pid}.json`);
const SUPER = { email: 'platform@test.example', password: 'platform-pass-1' };

let server;

async function api(method, route, { token, body, actAs } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(actAs ? { 'X-Act-As-Org': actAs } : {})
    },
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

const login = async (email, password) => api('POST', '/auth/login', { body: { email, password } });
const superToken = async () => (await login(SUPER.email, SUPER.password)).body.data.token;
const vehicle = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'Test', model: 'T1', fuelType: 'Diesel' });

async function newOrg(name, adminEmail) {
  const token = await superToken();
  const res = await api('POST', '/platform/organizations', {
    token,
    body: { organizationName: name, plan: 'trial', adminName: `${name} admin`, adminEmail, adminPassword: 'password123' }
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const admin = (await login(adminEmail, 'password123')).body.data;
  return { org: res.body.data.organization, admin, token };
}

async function auditRows(token, orgId, expected) {
  for (let i = 0; i < 40; i += 1) {
    const res = await api('GET', `/platform/audit?orgId=${orgId}`, { token });
    if (res.body.data.length >= expected) return res.body.data;
    await new Promise((r) => setTimeout(r, 100));
  }
  return (await api('GET', `/platform/audit?orgId=${orgId}`, { token })).body.data;
}

test('the platform owner works inside an organization as its administrator', async () => {
  const a = await newOrg('Alpha Co', 'admin@alpha.example');
  const b = await newOrg('Beta Co', 'admin@beta.example');
  const token = a.token;
  await api('POST', '/vehicles', { token: a.admin.token, body: vehicle('ALPHA 1') });
  await api('POST', '/vehicles', { token: b.admin.token, body: vehicle('BETA 1') });

  // without the header the platform owner still sees no fleet data
  assert.equal((await api('GET', '/vehicles', { token })).status, 403);

  // inside Alpha: Alpha's data, with administrator rights
  const list = await api('GET', '/vehicles', { token, actAs: a.org._id });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.deepEqual(list.body.data.map((v) => v.registrationNumber), ['ALPHA 1']);
  const created = await api('POST', '/vehicles', { token, actAs: a.org._id, body: vehicle('ALPHA 2') });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.orgId, a.org._id);
  const changed = await api('PUT', `/vehicles/${created.body.data._id}`, { token, actAs: a.org._id, body: { model: 'Fixed by support' } });
  assert.equal(changed.status, 200);
  // ... and the organization's own admin sees the change
  const seen = (await api('GET', '/vehicles', { token: a.admin.token })).body.data.find((v) => v._id === created.body.data._id);
  assert.equal(seen.model, 'Fixed by support');
  // maintenance, users and the organization's settings too
  assert.equal((await api('GET', '/maintenance', { token, actAs: a.org._id })).status, 200);
  assert.equal((await api('GET', '/auth/users', { token, actAs: a.org._id })).status, 200);
  assert.equal((await api('PUT', '/organization', { token, actAs: a.org._id, body: { settings: { speedLimitKmh: 80 } } })).status, 200);

  // the session reports who it is: an administrator of that organization, flagged as acting
  const me = await api('GET', '/auth/me', { token, actAs: a.org._id });
  assert.equal(me.body.data.role, 'admin');
  assert.equal(me.body.data.acting, true);
  assert.equal(me.body.data.organization._id, a.org._id);
  const plain = await api('GET', '/auth/me', { token });
  assert.equal(plain.body.data.role, 'super_admin');
  assert.equal(plain.body.data.acting, false);

  // unknown or malformed organizations
  assert.equal((await api('GET', '/vehicles', { token, actAs: 'does-not-exist' })).status, 404);
  assert.equal((await api('GET', '/vehicles', { token, actAs: '0123456789abcdef01234567' })).status, 404);

  // platform routes are for the platform owner outside an organization
  assert.equal((await api('GET', '/platform/organizations', { token, actAs: a.org._id })).status, 403);
});

test('nobody else can use the header', async () => {
  const a = await newOrg('Gamma Co', 'admin@gamma.example');
  const b = await newOrg('Delta Co', 'admin@delta.example');
  await api('POST', '/vehicles', { token: a.admin.token, body: vehicle('GAMMA 1') });
  await api('POST', '/vehicles', { token: b.admin.token, body: vehicle('DELTA 1') });

  // an administrator of Gamma naming Delta still gets Gamma
  const own = await api('GET', '/vehicles', { token: a.admin.token, actAs: b.org._id });
  assert.deepEqual(own.body.data.map((v) => v.registrationNumber), ['GAMMA 1']);
  const created = await api('POST', '/vehicles', { token: a.admin.token, actAs: b.org._id, body: vehicle('GAMMA 2') });
  assert.equal(created.body.data.orgId, a.org._id);
  assert.equal((await api('GET', '/platform/audit', { token: a.admin.token })).status, 403);
  assert.equal((await api('GET', '/platform/audit')).status, 401);
  // and no audit row is written for them
  const rows = await auditRows(a.token, b.org._id, 0);
  assert.equal(rows.length, 0);
});

test('suspended and expired organizations can still be fixed; every change is logged', async () => {
  const a = await newOrg('Epsilon Co', 'admin@epsilon.example');
  const token = a.token;
  // suspend the organization and end its trial
  assert.equal((await api('PUT', `/platform/organizations/${a.org._id}`, { token, body: { status: 'suspended', trialEndsAt: '2020-01-01T00:00:00Z' } })).status, 200);
  assert.equal((await api('GET', '/vehicles', { token: a.admin.token })).status, 403, 'its own users are locked out');

  const created = await api('POST', '/vehicles', { token, actAs: a.org._id, body: vehicle('EPS 1') });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal((await api('PUT', `/vehicles/${created.body.data._id}`, { token, actAs: a.org._id, body: { notes: 'x' } })).status, 200);
  assert.equal((await api('GET', '/vehicles', { token, actAs: a.org._id })).status, 200);
  assert.equal((await api('POST', '/vehicles', { token, actAs: a.org._id, body: { registrationNumber: '' } })).status >= 400, true);
  assert.equal((await api('DELETE', `/vehicles/${created.body.data._id}`, { token, actAs: a.org._id })).status, 200);

  // the log: the four changes (reads are not logged), newest first, with the result
  const rows = await auditRows(token, a.org._id, 4);
  assert.equal(rows.length, 4, JSON.stringify(rows));
  assert.deepEqual(rows.map((r) => r.method).sort(), ['DELETE', 'POST', 'POST', 'PUT']);
  assert.ok(rows.every((r) => r.actorEmail === SUPER.email && r.orgName === 'Epsilon Co' && r.path.startsWith('/api/vehicles')));
  assert.ok(rows.some((r) => r.method === 'POST' && r.status === 201));
  assert.ok(rows.some((r) => r.method === 'POST' && r.status >= 400), 'a refused change is logged too');
  assert.ok(!JSON.stringify(rows).includes('EPS 1'), 'request bodies are not stored');
  assert.ok(new Date(rows[0].at) >= new Date(rows[3].at));
  // other organizations' logs are separate
  assert.equal((await auditRows(token, '0123456789abcdef01234567', 0)).length, 0);
});
