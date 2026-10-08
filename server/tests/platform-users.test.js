import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

// port band of this file is separate from every other test file (the runner runs files in parallel)
const PORT = 8300 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-platform-users-${process.pid}.json`);
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

const login = async (email, password) => api('POST', '/auth/login', { body: { email, password } });
const superToken = async () => (await login(SUPER.email, SUPER.password)).body.data.token;

async function newOrg(name, adminEmail, plan = 'trial') {
  const token = await superToken();
  const res = await api('POST', '/platform/organizations', {
    token,
    body: { organizationName: name, plan, adminName: `${name} admin`, adminEmail, adminPassword: 'password123' }
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { org: res.body.data.organization, adminEmail, token };
}

const person = (email, role, extra = {}) => ({ name: `Person ${email}`, email, password: 'password123', role, ...extra });
const vehicle = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'Test', model: 'T1', fuelType: 'Diesel' });

test('the platform owner renames an organization without changing its login address', async () => {
  const { org, token } = await newOrg('Old Name LLC', 'rename@old.example');
  const renamed = await api('PUT', `/platform/organizations/${org._id}`, { token, body: { name: '  New Name LLC ' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.data.name, 'New Name LLC');
  assert.equal(renamed.body.data.slug, org.slug, 'the slug (?org=...) stays');

  for (const bad of ['', ' ', 'x', 'a'.repeat(101), 42]) {
    assert.equal((await api('PUT', `/platform/organizations/${org._id}`, { token, body: { name: bad } })).status, 400, `name ${JSON.stringify(bad)}`);
  }
  const listed = (await api('GET', '/platform/organizations', { token })).body.data.find((o) => o._id === org._id);
  assert.equal(listed.name, 'New Name LLC');
});

test('the platform owner adds a manager and a driver; they get exactly their own permissions', async () => {
  const { org, token } = await newOrg('Roles Co', 'admin@roles.example');
  const base = `/platform/organizations/${org._id}/users`;

  const before = await api('GET', base, { token });
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.data.map((u) => u.role), ['admin']);
  assert.ok(!JSON.stringify(before.body).includes('password'), 'no password hashes in the list');

  const manager = await api('POST', base, { token, body: person('manager@roles.example', 'fleet_manager') });
  assert.equal(manager.status, 201, JSON.stringify(manager.body));
  assert.equal(manager.body.data.role, 'fleet_manager');
  assert.equal(manager.body.data.orgId, org._id);
  const driver = await api('POST', base, { token, body: person('driver@roles.example', 'driver') });
  assert.equal(driver.status, 201);
  assert.equal((await api('POST', base, { token, body: { name: 'No Role', email: 'norole@roles.example', password: 'password123' } })).body.data.role, 'driver', 'driver is the default');

  // the manager can run the fleet but cannot manage users; the driver cannot change fleet data
  const m = (await login('manager@roles.example', 'password123')).body.data;
  assert.equal(m.organization._id, org._id);
  assert.equal((await api('POST', '/vehicles', { token: m.token, body: vehicle('MGR 1') })).status, 201);
  assert.equal((await api('GET', '/auth/users', { token: m.token })).status, 403);
  const d = (await login('driver@roles.example', 'password123')).body.data;
  assert.equal((await api('POST', '/vehicles', { token: d.token, body: vehicle('DRV 1') })).status, 403);

  // validation
  assert.equal((await api('POST', base, { token, body: person('manager@roles.example', 'driver') })).status, 400, 'duplicate email');
  assert.equal((await api('POST', base, { token, body: person('MANAGER@roles.example', 'driver') })).status, 400, 'duplicate email, other case');
  assert.equal((await api('POST', base, { token, body: person('weak@roles.example', 'driver', { password: 'short' }) })).status, 400);
  assert.equal((await api('POST', base, { token, body: person('x@roles.example', 'superuser') })).status, 400);
  assert.equal((await api('POST', base, { token, body: person('y@roles.example', 'super_admin') })).status, 400, 'a platform account cannot be created here');
  assert.equal((await api('POST', base, { token, body: { email: 'z@roles.example', password: 'password123' } })).status, 400);
  assert.equal((await api('POST', `/platform/organizations/does-not-exist/users`, { token, body: person('q@roles.example', 'driver') })).status, 404);

  // the plan's user limit still applies (trial: 5 users; 4 exist now)
  assert.equal((await api('POST', base, { token, body: person('fifth@roles.example', 'driver') })).status, 201);
  assert.equal((await api('POST', base, { token, body: person('sixth@roles.example', 'driver') })).status, 403);
});

test('only the platform owner can use these routes, and only on users of that organization', async () => {
  const a = await newOrg('Tenant One', 'one@tenant.example');
  const b = await newOrg('Tenant Two', 'two@tenant.example');
  const adminA = (await login('one@tenant.example', 'password123')).body.data;
  const adminB = (await login('two@tenant.example', 'password123')).body.data;

  // an organization admin is not the platform owner
  for (const [method, route, body] of [
    ['GET', `/platform/organizations/${a.org._id}/users`],
    ['POST', `/platform/organizations/${a.org._id}/users`, person('hack@tenant.example', 'admin')],
    ['PUT', `/platform/organizations/${a.org._id}/users/${adminA._id}`, { password: 'password456' }],
    ['PUT', `/platform/organizations/${a.org._id}`, { name: 'Mine now' }]
  ]) {
    assert.equal((await api(method, route, { token: adminA.token, body })).status, 403, `${method} ${route}`);
    assert.equal((await api(method, route, { body })).status, 401, `${method} ${route} without a token`);
  }

  // a malformed id is simply not found (on MongoDB it used to be a 500)
  assert.equal((await api('GET', '/vehicles/not-an-id', { token: adminA.token })).status, 404);

  // a user of organization B is not reachable through organization A
  const token = a.token;
  assert.equal((await api('PUT', `/platform/organizations/${a.org._id}/users/${adminB._id}`, { token, body: { status: 'inactive' } })).status, 404);
  assert.equal((await login('two@tenant.example', 'password123')).status, 200, 'B was not touched');
  // nor is a platform account
  const superId = (await login(SUPER.email, SUPER.password)).body.data._id;
  assert.equal((await api('PUT', `/platform/organizations/${a.org._id}/users/${superId}`, { token, body: { status: 'inactive' } })).status, 404);
  assert.equal((await login(SUPER.email, SUPER.password)).status, 200);
  assert.equal(b.org.name, 'Tenant Two');
});

test('a new password ends the old sessions; deactivating and reactivating works; the last admin is protected', async () => {
  const { org, token } = await newOrg('Access Co', 'admin@access.example');
  const base = `/platform/organizations/${org._id}/users`;
  await api('POST', base, { token, body: person('worker@access.example', 'fleet_manager') });
  const worker = (await login('worker@access.example', 'password123')).body.data;
  const users = (await api('GET', base, { token })).body.data;
  const adminUser = users.find((u) => u.role === 'admin');
  const workerUser = users.find((u) => u.email === 'worker@access.example');
  assert.equal((await api('GET', '/vehicles', { token: worker.token })).status, 200);

  // password reset
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: { password: 'short' } })).status, 400);
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: { password: 12345678 } })).status, 400);
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: {} })).status, 400, 'nothing to update');
  const reset = await api('PUT', `${base}/${workerUser._id}`, { token, body: { password: 'brand-new-pass-1' } });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.ok(!JSON.stringify(reset.body).includes('brand-new-pass-1'));
  assert.equal((await api('GET', '/vehicles', { token: worker.token })).status, 401, 'the old session ended');
  assert.equal((await login('worker@access.example', 'password123')).status, 401, 'the old password no longer works');
  assert.equal((await login('worker@access.example', 'brand-new-pass-1')).status, 200);

  // deactivate / reactivate
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: { status: 'nonsense' } })).status, 400);
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: { status: 'inactive' } })).status, 200);
  const blocked = await login('worker@access.example', 'brand-new-pass-1');
  assert.equal(blocked.status, 403);
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: { status: 'active', role: 'driver' } })).body.data.role, 'driver');
  assert.equal((await login('worker@access.example', 'brand-new-pass-1')).status, 200);

  // the only administrator can be neither deactivated nor demoted ...
  const msg = 'The organization needs at least one active administrator';
  const noOff = await api('PUT', `${base}/${adminUser._id}`, { token, body: { status: 'inactive' } });
  assert.equal(noOff.status, 400);
  assert.equal(noOff.body.message, msg);
  assert.equal((await api('PUT', `${base}/${adminUser._id}`, { token, body: { role: 'driver' } })).status, 400);
  // ... but can be once a second active administrator exists
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: { role: 'admin' } })).status, 200);
  assert.equal((await api('PUT', `${base}/${adminUser._id}`, { token, body: { status: 'inactive' } })).status, 200);
  assert.equal((await api('PUT', `${base}/${workerUser._id}`, { token, body: { status: 'inactive' } })).status, 400, 'now the worker is the last one');
});
