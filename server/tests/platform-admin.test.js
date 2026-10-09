import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

// port band of this file is separate from every other test file (the runner runs files in parallel)
const PORT = 8700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-platform-admin-${process.pid}.json`);
// the demo platform owner (a server that is not in production seeds it)
const SUPER = { email: 'superadmin@fleetnova.com', password: 'super123' };

let server;

async function api(method, route, { token, body, actAs } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(actAs ? { 'X-Act-As-Org': actAs } : {}) },
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
      // not production: online payment is simulated there, which the invoice part of the first test needs
      NODE_ENV: 'development',
      GPS_TCP_PORT: '0',
      GT06_TCP_PORT: '0',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      JWT_SECRET: 'test-secret', RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false',
      FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
    },
    stdio: 'ignore'
  });
  await waitForServer();
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

const login = (email, password) => api('POST', '/auth/login', { body: { email, password } });
const superToken = async () => (await login(SUPER.email, SUPER.password)).body.data.token;

async function newOrg(name) {
  const token = await superToken();
  const email = `admin@${name.toLowerCase().replace(/\W/g, '')}.example`;
  const res = await api('POST', '/platform/organizations', { token, body: { organizationName: name, plan: 'trial', adminName: 'Admin', adminEmail: email, adminPassword: 'password123' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const admin = (await login(email, 'password123')).body.data;
  return { org: res.body.data.organization, token: admin.token, email, sup: token };
}

async function fill(token, tag, imei) {
  const vehicle = await api('POST', '/vehicles', { token, body: { registrationNumber: `${tag} 1`, vehicleType: 'Truck', brand: 'B', model: 'M', fuelType: 'Diesel' } });
  assert.equal(vehicle.status, 201, JSON.stringify(vehicle.body));
  const driver = await api('POST', '/drivers', { token, body: { name: `D ${tag}`, email: `d@${tag.toLowerCase()}.example`, phone: '1', licenseNumber: `L-${tag}`, licenseExpiry: '2030-01-01' } });
  assert.equal(driver.status, 201, JSON.stringify(driver.body));
  const device = await api('POST', '/devices', { token, body: { name: `T ${tag}`, imei, protocol: 'teltonika', vehicle: vehicle.body.data._id } });
  assert.equal(device.status, 201, JSON.stringify(device.body));
  assert.equal((await api('POST', '/fuel', { token, body: { vehicleId: vehicle.body.data._id, fuelType: 'Diesel', quantity: 10, pricePerLiter: 3000, odometerReading: 1, fuelStation: 'S' } })).status, 201);
  return { vehicle: vehicle.body.data, device: device.body.data };
}

test('deleting an organization: confirmations, what goes and what stays', async () => {
  const doomed = await newOrg('Doomed Co');
  const keeper = await newOrg('Keeper Co');
  await fill(doomed.token, 'DOOM', '111111111111111');
  const kept = await fill(keeper.token, 'KEEP', '222222222222222');
  const base = `/platform/organizations/${doomed.org._id}`;
  const sup = doomed.sup;

  // the rules
  assert.equal((await api('DELETE', base, { token: doomed.token, body: { confirmName: 'Doomed Co' } })).status, 403, 'only the platform owner');
  assert.equal((await api('DELETE', base, { body: { confirmName: 'Doomed Co' } })).status, 401);
  assert.equal((await api('DELETE', '/platform/organizations/not-an-id', { token: sup, body: {} })).status, 404);
  const active = await api('DELETE', base, { token: sup, body: { confirmName: 'Doomed Co' } });
  assert.equal(active.status, 400, 'it must be suspended first');
  assert.match(active.body.message, /Suspend/);
  assert.equal((await api('PUT', base, { token: sup, body: { status: 'suspended' } })).status, 200);
  assert.equal((await api('DELETE', base, { token: sup, body: {} })).status, 400, 'the name must be typed');
  assert.equal((await api('DELETE', base, { token: sup, body: { confirmName: 'doomed co' } })).status, 400, 'exactly');

  // an open payment request blocks it; once paid it does not
  assert.equal((await api('PUT', base, { token: sup, body: { status: 'active' } })).status, 200);
  const invoice = await api('POST', '/billing/invoices', { token: doomed.token, body: { plan: 'basic', months: 1 } });
  assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
  assert.equal((await api('PUT', base, { token: sup, body: { status: 'suspended' } })).status, 200);
  const blocked = await api('DELETE', base, { token: sup, body: { confirmName: 'Doomed Co' } });
  assert.equal(blocked.status, 400);
  assert.match(blocked.body.message, /unpaid/);
  assert.equal((await api('PUT', base, { token: sup, body: { status: 'active' } })).status, 200);
  assert.equal((await api('POST', `/billing/invoices/${invoice.body.data._id}/simulate-pay`, { token: doomed.token })).status, 200);
  assert.equal((await api('PUT', base, { token: sup, body: { status: 'suspended' } })).status, 200);

  const done = await api('DELETE', base, { token: sup, body: { confirmName: 'Doomed Co' } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.deepEqual(
    Object.fromEntries(['vehicles', 'drivers', 'devices', 'users'].map((k) => [k, done.body.data.removed[k]])),
    { vehicles: 1, drivers: 1, devices: 1, users: 1 }
  );
  assert.ok(done.body.data.removed.fuels >= 1);

  // gone: the organization, its people, its login address
  assert.equal((await api('GET', '/platform/organizations', { token: sup })).body.data.some((o) => o._id === doomed.org._id), false);
  assert.equal((await login(doomed.email, 'password123')).status, 401);
  assert.equal((await api('GET', `/public/organizations/${doomed.org.slug}`)).status, 404);
  assert.equal((await api('GET', '/vehicles', { token: doomed.token })).status, 401, 'its sessions end');
  assert.equal((await api('DELETE', base, { token: sup, body: { confirmName: 'Doomed Co' } })).status, 404, 'a second time');

  // its tracker id is free again, and the other organization is untouched
  const again = await api('POST', '/devices', { token: keeper.token, body: { name: 'Reused', imei: '111111111111111', protocol: 'teltonika' } });
  assert.equal(again.status, 201, JSON.stringify(again.body));
  const vehicles = (await api('GET', '/vehicles', { token: keeper.token })).body.data;
  assert.deepEqual(vehicles.map((v) => v.registrationNumber), ['KEEP 1']);
  assert.equal((await api('GET', '/devices', { token: keeper.token })).body.data.length, 2);
  assert.ok(kept.device);

  // what stays: the paid invoice (with the organization's name) and the log of the deletion
  const invoices = (await api('GET', '/platform/invoices', { token: sup })).body.data;
  const mine = invoices.find((i) => i._id === invoice.body.data._id);
  assert.ok(mine, 'the invoice stays');
  assert.equal(mine.organization, 'Doomed Co');
  assert.equal(mine.status, 'paid');
  const log = (await api('GET', `/platform/audit?orgId=${doomed.org._id}`, { token: sup })).body.data;
  assert.ok(log.some((r) => r.method === 'DELETE' && r.orgName === 'Doomed Co' && r.actorEmail === SUPER.email), JSON.stringify(log));
});

test('platform admins: add, list, reset a password, switch off', async () => {
  const sup = await superToken();
  const org = await newOrg('Plain Co');

  assert.equal((await api('GET', '/platform/admins', { token: org.token })).status, 403, 'an organization admin is not a platform admin');
  assert.equal((await api('GET', '/platform/admins')).status, 401);
  assert.equal((await api('POST', '/platform/admins', { token: org.token, body: { name: 'X', email: 'x@x.example', password: 'password123' } })).status, 403);

  const created = await api('POST', '/platform/admins', { token: sup, body: { name: 'Second Admin', email: 'Second@Platform.Example', password: 'second-pass-1' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.role, 'super_admin');
  assert.equal(created.body.data.email, 'second@platform.example');
  assert.ok(!created.body.data.orgId, 'belongs to no organization');
  assert.ok(!JSON.stringify(created.body).includes('second-pass-1'));

  assert.equal((await api('POST', '/platform/admins', { token: sup, body: { name: 'Dup', email: 'second@platform.example', password: 'second-pass-1' } })).status, 400, 'duplicate email');
  assert.equal((await api('POST', '/platform/admins', { token: sup, body: { name: 'Dup', email: SUPER.email, password: 'second-pass-1' } })).status, 400, 'an existing user of any organization too');
  assert.equal((await api('POST', '/platform/admins', { token: sup, body: { name: 'Weak', email: 'weak@platform.example', password: 'short' } })).status, 400);
  assert.equal((await api('POST', '/platform/admins', { token: sup, body: { email: 'noname@platform.example', password: 'second-pass-1' } })).status, 400);

  const list = await api('GET', '/platform/admins', { token: sup });
  const emails = list.body.data.map((u) => u.email);
  assert.ok(emails.includes(SUPER.email) && emails.includes('second@platform.example'));
  assert.ok(list.body.data.every((u) => u.role === 'super_admin'), 'only platform admins');
  assert.ok(!emails.includes(org.email), 'no organization user');
  assert.ok(!JSON.stringify(list.body).includes('password'));

  // the new platform admin can do the platform owner's work
  const second = (await login('second@platform.example', 'second-pass-1')).body.data;
  assert.equal(second.role, 'super_admin');
  assert.equal((await api('GET', '/platform/organizations', { token: second.token })).status, 200);
  assert.equal((await api('GET', '/vehicles', { token: second.token })).status, 403, 'and still sees no fleet data without entering an organization');
  assert.equal((await api('GET', '/vehicles', { token: second.token, actAs: org.org._id })).status, 200);

  // reset the password: the old session ends
  const id = created.body.data._id;
  assert.equal((await api('PUT', `/platform/admins/${id}`, { token: sup, body: { password: 'short' } })).status, 400);
  assert.equal((await api('PUT', `/platform/admins/${id}`, { token: sup, body: {} })).status, 400);
  assert.equal((await api('PUT', `/platform/admins/${id}`, { token: sup, body: { password: 'brand-new-pass-1' } })).status, 200);
  assert.equal((await api('GET', '/platform/organizations', { token: second.token })).status, 401);
  assert.equal((await login('second@platform.example', 'second-pass-1')).status, 401);
  assert.equal((await login('second@platform.example', 'brand-new-pass-1')).status, 200);

  // switch off and on; never your own account, never a user who is not a platform admin
  assert.equal((await api('PUT', `/platform/admins/${id}`, { token: sup, body: { status: 'inactive' } })).status, 200);
  assert.equal((await login('second@platform.example', 'brand-new-pass-1')).status, 403);
  assert.equal((await api('PUT', `/platform/admins/${id}`, { token: sup, body: { status: 'bogus' } })).status, 400);
  assert.equal((await api('PUT', `/platform/admins/${id}`, { token: sup, body: { status: 'active' } })).status, 200);
  const selfId = list.body.data.find((u) => u.email === SUPER.email)._id;
  assert.equal((await api('PUT', `/platform/admins/${selfId}`, { token: sup, body: { status: 'inactive' } })).status, 400, 'not your own account');
  const orgUser = (await api('GET', `/platform/organizations/${org.org._id}/users`, { token: sup })).body.data[0];
  assert.equal((await api('PUT', `/platform/admins/${orgUser._id}`, { token: sup, body: { status: 'inactive' } })).status, 404, 'an organization user is not a platform admin');
  assert.equal((await login(org.email, 'password123')).status, 200, 'and was not touched');
});

test('platform invoice list: totals, filters, limit and who may see it', async () => {
  const sup = await superToken();
  const a = await newOrg('Pays Co');
  const b = await newOrg('Waits Co');

  // Pays Co buys a plan (paid), then asks for another period (open); Waits Co has one open request
  const first = (await api('POST', '/billing/invoices', { token: a.token, body: { plan: 'basic', months: 1 } })).body.data;
  assert.equal((await api('POST', `/billing/invoices/${first._id}/simulate-pay`, { token: a.token })).status, 200);
  const second = (await api('POST', '/billing/invoices', { token: a.token, body: { plan: 'basic', months: 3 } })).body.data;
  const third = (await api('POST', '/billing/invoices', { token: b.token, body: { plan: 'pro', months: 1 } })).body.data;

  const all = await api('GET', '/platform/invoices', { token: sup });
  assert.equal(all.status, 200);
  const mine = (id) => all.body.data.find((i) => i._id === id);
  assert.equal(mine(first._id).organization, 'Pays Co');
  assert.equal(mine(first._id).status, 'paid');
  assert.equal(mine(second._id).status, 'pending');
  assert.equal(mine(third._id).organization, 'Waits Co');
  assert.equal(mine(third._id).orgId, b.org._id);
  assert.ok(all.body.summary.paidCount >= 1 && all.body.summary.paidTotal >= first.amount && all.body.summary.paidThisMonth >= first.amount);
  assert.ok(all.body.summary.pendingCount >= 2);
  assert.ok(all.body.data.every((x, i, rows) => i === 0 || new Date(rows[i - 1].createdAt) >= new Date(x.createdAt)), 'newest first');
  assert.ok(!JSON.stringify(all.body).includes('callbackToken'));

  // filters change the rows, never the totals
  const paid = await api('GET', '/platform/invoices?status=paid', { token: sup });
  assert.ok(paid.body.data.length >= 1 && paid.body.data.every((i) => i.status === 'paid'));
  assert.deepEqual(paid.body.summary, all.body.summary);
  const ofWaits = await api('GET', `/platform/invoices?orgId=${b.org._id}`, { token: sup });
  assert.deepEqual(ofWaits.body.data.map((i) => i._id), [third._id]);
  const one = await api('GET', '/platform/invoices?limit=1', { token: sup });
  assert.equal(one.body.data.length, 1);
  assert.equal((await api('GET', '/platform/invoices?limit=0', { token: sup })).status, 200);

  // only platform admins
  assert.equal((await api('GET', '/platform/invoices', { token: a.token })).status, 403);
  assert.equal((await api('GET', '/platform/invoices')).status, 401);
});
