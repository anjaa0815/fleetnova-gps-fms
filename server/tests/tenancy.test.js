import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-test-${process.pid}.json`);
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
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not start');
}

const vehicle = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'Test', model: 'T1', fuelType: 'Diesel' });

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
      JWT_SECRET: 'test-secret',
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
  const res = await api('POST', '/auth/register', {
    body: { organizationName: org, name: `${org} admin`, email, password: 'password123' }
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

test('self-service sign-up creates an organization with its own admin', async () => {
  const a = await signUp('Acme Logistics', 'admin@acme.example');
  assert.equal(a.role, 'admin');
  assert.equal(a.organization.name, 'Acme Logistics');
  assert.equal(a.organization.slug, 'acme-logistics');
  assert.equal(a.organization.plan, 'trial');
  assert.ok(a.token);

  const cyr = await signUp('Монгол Карго ХХК', 'cyr@acme.example');
  assert.equal(cyr.organization.slug, 'mongol-kargo');
  const cyr2 = await signUp('Монгол Карго ХХК', 'cyr2@acme.example');
  assert.equal(cyr2.organization.slug, 'mongol-kargo-2');

  const dup = await api('POST', '/auth/register', {
    body: { organizationName: 'Other', name: 'x', email: 'admin@acme.example', password: 'password123' }
  });
  assert.equal(dup.status, 400);

  const noOrg = await api('POST', '/auth/register', {
    body: { name: 'x', email: 'noorg@example.com', password: 'password123' }
  });
  assert.equal(noOrg.status, 400);
});

test('organizations cannot see or change each other\'s data', async () => {
  const a = await signUp('Tenant A', 'a@tenant.example');
  const b = await signUp('Tenant B', 'b@tenant.example');

  const created = await api('POST', '/vehicles', { token: a.token, body: vehicle('AAA 111') });
  assert.equal(created.status, 201);
  const vehicleId = created.body.data._id;
  assert.equal(created.body.data.orgId, a.organization._id);

  // B sees nothing of A
  const listB = await api('GET', '/vehicles', { token: b.token });
  assert.equal(listB.body.totalRecords, 0);
  assert.equal((await api('GET', `/vehicles/${vehicleId}`, { token: b.token })).status, 404);
  assert.equal((await api('PUT', `/vehicles/${vehicleId}`, { token: b.token, body: { notes: 'hacked' } })).status, 404);
  assert.equal((await api('DELETE', `/vehicles/${vehicleId}`, { token: b.token })).status, 404);

  // A's vehicle is untouched
  const still = await api('GET', `/vehicles/${vehicleId}`, { token: a.token });
  assert.equal(still.status, 200);
  assert.notEqual(still.body.data.notes, 'hacked');

  // Identifiers are unique per organization, not globally
  const sameReg = await api('POST', '/vehicles', { token: b.token, body: vehicle('AAA 111') });
  assert.equal(sameReg.status, 201);
  const dupReg = await api('POST', '/vehicles', { token: a.token, body: vehicle('AAA 111') });
  assert.equal(dupReg.status, 400);

  // Dashboard only counts own data
  const dash = await api('GET', '/dashboard', { token: b.token });
  assert.equal(dash.body.data.cards.totalVehicles, 1);
});

test('references to another organization\'s records are rejected', async () => {
  const a = await signUp('Ref A', 'a@ref.example');
  const b = await signUp('Ref B', 'b@ref.example');

  const driver = await api('POST', '/drivers', {
    token: a.token,
    body: { name: 'D', email: 'd@x.example', phone: '1', licenseNumber: 'LIC-1', licenseExpiry: '2030-01-01' }
  });
  assert.equal(driver.status, 201, JSON.stringify(driver.body));

  const res = await api('POST', '/vehicles', {
    token: b.token,
    body: { ...vehicle('BBB 222'), assignedDriver: driver.body.data._id }
  });
  assert.equal(res.status, 404);

  const foreignVehicle = await api('POST', '/vehicles', { token: a.token, body: vehicle('AAA 333') });
  const fuel = await api('POST', '/fuel', {
    token: b.token,
    body: { vehicleId: foreignVehicle.body.data._id, fuelType: 'Diesel', quantity: 10, pricePerLiter: 3000, odometerReading: 1, fuelStation: 's' }
  });
  assert.equal(fuel.status, 404);
});

test('organization admins manage only their own users and cannot escalate to platform roles', async () => {
  const a = await signUp('Users A', 'a@users.example');
  const b = await signUp('Users B', 'b@users.example');

  const created = await api('POST', '/auth/users', {
    token: a.token,
    body: { name: 'Manager', email: 'mgr@users.example', password: 'password123', role: 'fleet_manager' }
  });
  assert.equal(created.status, 201);

  const escalate = await api('POST', '/auth/users', {
    token: a.token,
    body: { name: 'Evil', email: 'evil@users.example', password: 'password123', role: 'super_admin' }
  });
  assert.equal(escalate.status, 400);

  const listA = await api('GET', '/auth/users', { token: a.token });
  assert.equal(listA.body.data.length, 2);
  const listB = await api('GET', '/auth/users', { token: b.token });
  assert.equal(listB.body.data.length, 1);

  // B cannot modify A's user, and nobody can edit themselves into a lockout
  const patch = await api('PUT', `/auth/users/${created.body.data._id}/status`, { token: b.token, body: { status: 'inactive' } });
  assert.equal(patch.status, 404);
  const self = await api('PUT', `/auth/users/${a.token ? listA.body.data.find((u) => u.role === 'admin')._id : ''}/status`, {
    token: a.token,
    body: { role: 'driver' }
  });
  assert.equal(self.status, 400);

  // Managers cannot manage users
  const mgr = await api('POST', '/auth/login', { body: { email: 'mgr@users.example', password: 'password123' } });
  const forbidden = await api('GET', '/auth/users', { token: mgr.body.data.token });
  assert.equal(forbidden.status, 403);
});

test('platform admin manages organizations but cannot read tenant data; org users cannot reach platform API', async () => {
  const org = await signUp('Platform Subject', 'p@subject.example');
  await api('POST', '/vehicles', { token: org.token, body: vehicle('PPP 444') });

  const login = await api('POST', '/auth/login', { body: SUPER });
  assert.equal(login.status, 200);
  assert.equal(login.body.data.role, 'super_admin');
  const platform = login.body.data.token;

  const list = await api('GET', '/platform/organizations', { token: platform });
  assert.equal(list.status, 200);
  const subject = list.body.data.find((o) => o.slug === 'platform-subject');
  assert.equal(subject.usage.vehicles, 1);
  assert.equal(subject.usage.users, 1);

  assert.equal((await api('GET', '/vehicles', { token: platform })).status, 403);
  assert.equal((await api('GET', '/platform/organizations', { token: org.token })).status, 403);

  // Create a tenant on behalf of a customer
  const made = await api('POST', '/platform/organizations', {
    token: platform,
    body: { organizationName: 'Sold Co', plan: 'basic', adminName: 'Boss', adminEmail: 'boss@sold.example', adminPassword: 'password123' }
  });
  assert.equal(made.status, 201);
  assert.equal(made.body.data.organization.plan, 'basic');
  const bossLogin = await api('POST', '/auth/login', { body: { email: 'boss@sold.example', password: 'password123' } });
  assert.equal(bossLogin.status, 200);
});

test('suspended organizations are locked out; reactivation restores access', async () => {
  const org = await signUp('Suspend Me', 's@suspend.example');
  const platform = (await api('POST', '/auth/login', { body: SUPER })).body.data.token;

  const off = await api('PUT', `/platform/organizations/${org.organization._id}`, { token: platform, body: { status: 'suspended' } });
  assert.equal(off.status, 200);
  assert.equal((await api('GET', '/vehicles', { token: org.token })).status, 403);
  assert.equal((await api('POST', '/auth/login', { body: { email: 's@suspend.example', password: 'password123' } })).status, 403);

  await api('PUT', `/platform/organizations/${org.organization._id}`, { token: platform, body: { status: 'active' } });
  assert.equal((await api('GET', '/vehicles', { token: org.token })).status, 200);
});

test('plan limits are enforced and expired trials become read-only', async () => {
  const org = await signUp('Limits Inc', 'l@limits.example');
  const platform = (await api('POST', '/auth/login', { body: SUPER })).body.data.token;

  // Trial plan allows 10 vehicles
  for (let i = 0; i < 10; i += 1) {
    const res = await api('POST', '/vehicles', { token: org.token, body: vehicle(`LIM ${i}`) });
    assert.equal(res.status, 201, `vehicle ${i}`);
  }
  const over = await api('POST', '/vehicles', { token: org.token, body: vehicle('LIM 11') });
  assert.equal(over.status, 403);

  // Upgrading the plan lifts the limit
  await api('PUT', `/platform/organizations/${org.organization._id}`, { token: platform, body: { plan: 'basic' } });
  assert.equal((await api('POST', '/vehicles', { token: org.token, body: vehicle('LIM 12') })).status, 201);

  // Expired trial: reads still work, writes are blocked
  const trial = await signUp('Expired Trial', 'e@trial.example');
  await api('PUT', `/platform/organizations/${trial.organization._id}`, {
    token: platform,
    body: { trialEndsAt: '2020-01-01T00:00:00.000Z' }
  });
  assert.equal((await api('GET', '/vehicles', { token: trial.token })).status, 200);
  assert.equal((await api('POST', '/vehicles', { token: trial.token, body: vehicle('EXP 1') })).status, 402);
});

test('organization profile and public branding endpoint', async () => {
  const org = await signUp('Brand Co', 'b@brand.example');

  const me = await api('GET', '/organization', { token: org.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.usage.users, 1);
  assert.equal(me.body.data.limits.maxVehicles, 10);

  const bad = await api('PUT', '/organization', { token: org.token, body: { branding: { primaryColor: 'red' } } });
  assert.equal(bad.status, 400);
  const badLogo = await api('PUT', '/organization', { token: org.token, body: { branding: { logoUrl: 'javascript:alert(1)' } } });
  assert.equal(badLogo.status, 400);

  const ok = await api('PUT', '/organization', {
    token: org.token,
    body: { name: 'Brand Company', branding: { primaryColor: '#ff6600', logoUrl: 'https://example.com/logo.png' } }
  });
  assert.equal(ok.status, 200);

  const pub = await api('GET', '/public/organizations/brand');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.data.name, 'Brand Company');
  assert.equal(pub.body.data.branding.primaryColor, '#ff6600');
  assert.equal(pub.body.data.email, undefined);
  assert.equal((await api('GET', '/public/organizations/does-not-exist')).status, 404);

  // Only admins can edit the organization
  const mgr = await api('POST', '/auth/users', {
    token: org.token,
    body: { name: 'M', email: 'm@brand.example', password: 'password123', role: 'fleet_manager' }
  });
  assert.equal(mgr.status, 201);
  const mgrLogin = await api('POST', '/auth/login', { body: { email: 'm@brand.example', password: 'password123' } });
  assert.equal((await api('PUT', '/organization', { token: mgrLogin.body.data.token, body: { name: 'Hijack' } })).status, 403);
});
