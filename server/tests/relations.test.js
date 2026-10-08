import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

// Records point at each other (trip -> vehicle, fuel -> vehicle ...). These tests walk those links through the
// API, on whichever storage the run uses (JSON store, or MongoDB with TEST_MONGODB_URI): details pages, list
// filters and the "driver already has a trip" rule.
// port band of this file is separate from every other test file (the runner runs files in parallel)
const PORT = 8500 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-relations-${process.pid}.json`);

let server;
let token;

async function api(method, route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv()
    },
    stdio: 'ignore'
  });
  await waitForServer();
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationName: 'Relations Co', name: 'Admin', email: 'admin@relations.example', password: 'password123' })
  });
  token = (await reg.json()).data.token;
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

const day = (n) => new Date(Date.now() + n * 86400000).toISOString();

async function create(route, body, label) {
  const res = await api('POST', route, body);
  assert.equal(res.status, 201, `${label}: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

const newVehicle = (reg) => create('/vehicles', { registrationNumber: reg, vehicleType: 'Truck', brand: 'Brand', model: 'M1', fuelType: 'Diesel' }, `vehicle ${reg}`);
const newDriver = (n) => create('/drivers', { name: `Driver ${n}`, email: `driver${n}@relations.example`, phone: `99${n}`, licenseNumber: `LIC-${n}`, licenseExpiry: '2030-01-01' }, `driver ${n}`);
const newTrip = (vehicle, driver, to) => create('/trips', { vehicleId: vehicle._id, driverId: driver._id, source: 'A', destination: to, startDate: day(1), expectedEndDate: day(2), distance: 100 }, `trip to ${to}`);
const newFuel = (vehicle) => create('/fuel', { vehicleId: vehicle._id, fuelType: 'Diesel', quantity: 10, pricePerLiter: 3000, odometerReading: 1000, fuelStation: 'Station' }, 'fuel');
const newMaintenance = (vehicle) => create('/maintenance', { vehicleId: vehicle._id, maintenanceType: 'Oil Change', description: 'Oil', serviceDate: day(0), cost: 50000, serviceCenter: 'Garage' }, 'maintenance');
const newExpense = (vehicle) => create('/expenses', { vehicleId: vehicle._id, category: 'Toll', amount: 7000, description: 'Toll road', date: day(0), paymentMethod: 'Cash' }, 'expense');

test('details pages show the record\'s own fields and everything linked to it', async () => {
  const v1 = await newVehicle('REL 1');
  const v2 = await newVehicle('REL 2');
  const d1 = await newDriver(1);
  const d2 = await newDriver(2);
  await newTrip(v1, d1, 'Darkhan');
  await newTrip(v2, d2, 'Erdenet');
  await newFuel(v1);
  await newFuel(v1);
  await newFuel(v2);
  await newMaintenance(v1);
  await newExpense(v1);
  await newExpense(v2);

  const detail = await api('GET', `/vehicles/${v1._id}`);
  assert.equal(detail.status, 200);
  const v = detail.body.data;
  assert.equal(v.registrationNumber, 'REL 1', 'plain fields at the top level');
  assert.equal(v.model, 'M1');
  assert.equal(v._id, v1._id);
  assert.ok(!('$__' in v) && !('_doc' in v), 'no database internals in the answer');
  assert.deepEqual(v.trips.map((t) => t.destination), ['Darkhan']);
  assert.equal(v.fuels.length, 2);
  assert.equal(v.maintenance.length, 1);
  // fuel and maintenance records also book their cost as an expense: 2 fuel + 1 maintenance + the toll
  assert.equal(v.expenses.length, 4);
  assert.ok(v.expenses.some((e) => e.description === 'Toll road'));
  assert.equal(v.analytics.totalTrips, 1);
  assert.equal(v.analytics.totalFuelUsed, 20);
  assert.equal(v.analytics.totalMaintenanceCost, 50000);
  assert.ok(v.analytics.totalExpenses >= 7000);

  const driver = (await api('GET', `/drivers/${d1._id}`)).body.data;
  assert.equal(driver.name, 'Driver 1');
  assert.ok(!('$__' in driver) && !('_doc' in driver));
  assert.deepEqual(driver.trips.map((t) => t.destination), ['Darkhan']);
});

test('list filters by vehicle and driver return only the linked records', async () => {
  const v1 = await newVehicle('FLT 1');
  const v2 = await newVehicle('FLT 2');
  const d1 = await newDriver(11);
  const d2 = await newDriver(12);
  await newTrip(v1, d1, 'North');
  await newTrip(v2, d2, 'South');
  await newFuel(v1);
  await newFuel(v2);
  await newFuel(v2);
  await newMaintenance(v2);
  await newExpense(v1);
  await newExpense(v2);
  await newExpense(v2);

  const dest = async (route) => (await api('GET', route)).body.data.map((r) => r.destination || r.registrationNumber || r._id);
  assert.deepEqual(await dest(`/trips?vehicle=${v1._id}`), ['North']);
  assert.deepEqual(await dest(`/trips?driver=${d2._id}`), ['South']);
  assert.equal((await api('GET', `/fuel?vehicle=${v2._id}`)).body.data.length, 2);
  assert.equal((await api('GET', `/fuel?vehicle=${v1._id}`)).body.data.length, 1);
  assert.equal((await api('GET', `/maintenance?vehicle=${v2._id}`)).body.data.length, 1);
  assert.equal((await api('GET', `/maintenance?vehicle=${v1._id}`)).body.data.length, 0);
  // (fuel and maintenance also book an expense: v1 = 1 fuel + 1 toll, v2 = 2 fuel + 1 maintenance + 2 tolls)
  assert.equal((await api('GET', `/expenses?vehicle=${v2._id}`)).body.data.length, 5);
  assert.equal((await api('GET', `/expenses?vehicle=${v1._id}`)).body.data.length, 2);
});

test('a driver with a scheduled trip cannot be given a second one; starting and completing move the statuses', async () => {
  const v1 = await newVehicle('DRV 1');
  const v2 = await newVehicle('DRV 2');
  const d = await newDriver(21);
  const trip = await newTrip(v1, d, 'West');

  const second = await api('POST', '/trips', { vehicleId: v2._id, driverId: d._id, source: 'A', destination: 'East', startDate: day(1), expectedEndDate: day(2), distance: 50 });
  assert.equal(second.status, 400, JSON.stringify(second.body));
  assert.match(second.body.message, /already assigned/);

  assert.equal((await api('PUT', `/trips/${trip._id}/start`)).status, 200);
  assert.equal((await api('GET', `/drivers/${d._id}`)).body.data.status, 'On Trip');
  assert.equal((await api('GET', `/vehicles/${v1._id}`)).body.data.status, 'On Trip');
  assert.equal((await api('PUT', `/trips/${trip._id}/complete`, { fuelUsed: 5, tripExpense: 1000 })).status, 200);
  assert.equal((await api('GET', `/drivers/${d._id}`)).body.data.status, 'Available');
  assert.equal((await api('GET', `/vehicles/${v1._id}`)).body.data.status, 'Available');
  // the driver is free again
  assert.equal((await api('POST', '/trips', { vehicleId: v2._id, driverId: d._id, source: 'A', destination: 'East', startDate: day(1), expectedEndDate: day(2), distance: 50 })).status, 201);
});

test('an expiry reminder is created once per vehicle, not on every visit', async () => {
  const v = await create('/vehicles', { registrationNumber: 'EXP 1', vehicleType: 'Truck', brand: 'Brand', model: 'M1', fuelType: 'Diesel', insuranceExpiry: day(10) }, 'vehicle with insurance expiry');
  let reminders = [];
  for (let visit = 0; visit < 3; visit += 1) {
    const res = await api('GET', '/notifications');
    assert.equal(res.status, 200);
    reminders = res.body.data.filter((n) => n.type === 'insurance_expiry' && String(n.relatedEntityId) === String(v._id));
  }
  assert.equal(reminders.length, 1, JSON.stringify(reminders));
});

test('the dashboard lists open maintenance with its own fields', async () => {
  const v = await newVehicle('DASH 1');
  await newMaintenance(v);
  const res = await api('GET', '/dashboard');
  assert.equal(res.status, 200);
  const open = res.body.data.upcomingMaintenance;
  assert.ok(open.length >= 1);
  for (const m of open) {
    assert.ok(typeof m.status === 'string' && m.status !== '', 'status is a plain field (the page reads it)');
    assert.ok(!('$__' in m) && !('_doc' in m));
    assert.equal(typeof m.isOverdue, 'boolean');
  }
});
