import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { encodeAvlPacket, encodeLogin } from '../gps/protocols/teltonika.js';
import { analyzePoints, createAnalyzer } from '../reports/gpsAnalysis.js';
import { dbEnv } from './dbEnv.js';

const HTTP_PORT = 3500 + Math.floor(Math.random() * 90);
const TCP_PORT = 6400 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-reports-test-${process.pid}.json`);
const MIN = 60 * 1000;

let server;

// ---------------------------------------------------------------------------------------------
// Pure analysis
// ---------------------------------------------------------------------------------------------
const T0 = Date.parse('2026-09-20T02:00:00Z'); // 10:00 in Ulaanbaatar
const pt = (minute, lat, speed, ignition = true, lng = 106.9) => ({ timestamp: T0 + minute * MIN, lat, lng, speed, ignition });

// 6 movement segments of 0.01 degrees (1.112 km): trip, red light, trip, 10 minute stop with the engine on, trip
const scenario = () => [
  pt(0, 47.90, 0), pt(1, 47.91, 50), pt(2, 47.92, 50),
  pt(3, 47.92, 0), pt(4, 47.92, 0), // red light: no stop
  pt(5, 47.93, 50), pt(6, 47.94, 50),
  ...Array.from({ length: 11 }, (_, i) => pt(7 + i, 47.94, 0)), // minutes 7..17 stationary
  pt(18, 47.95, 50), pt(19, 47.96, 50)
];

test('streaming analyzer gives the same result as analyzing the whole list, glitches inside a pause included', () => {
  const T0 = Date.UTC(2026, 0, 1);
  const q = (min, lat, speed, ignition) => ({ lat, lng: 106.9, speed, ignition, timestamp: T0 + min * 60000 });
  // moving, a 12 minute pause with the engine on (one glitch reading "ignition off" in the middle), moving again
  const points = [q(0, 47.90, 50, true), q(1, 47.91, 50, true), q(2, 47.91, 0, true), q(4, 47.91, 0, true), q(5, 60.0, 0, false),
    q(7, 47.91, 0, true), q(9, 47.91, 0, true), q(14, 47.91, 0, true), q(15, 47.92, 50, true)];
  const whole = analyzePoints(points);
  assert.equal(whole.stops.length, 1);
  assert.equal(whole.stops[0].durationMin, 12);
  assert.equal(whole.stops[0].idle, true);
  assert.equal(whole.pointCount, 9); // the glitch is a received point, only its position is ignored

  const analyzer = createAnalyzer();
  points.forEach((p) => analyzer.push(p));
  assert.deepEqual(analyzer.finish(), whole);
  assert.deepEqual(createAnalyzer().finish(), analyzePoints([]));
});

test('trips, stops and distance', () => {
  const r = analyzePoints(scenario());
  assert.equal(r.tripCount, 2); // the red light does not split the first trip
  assert.ok(Math.abs(r.distanceKm - 6.7) < 0.05, `distance ${r.distanceKm}`);
  assert.ok(Math.abs(r.trips[0].distanceKm - 4.45) < 0.02);
  assert.ok(Math.abs(r.trips[1].distanceKm - 2.22) < 0.02);
  assert.equal(r.stops.length, 1);
  assert.equal(r.stops[0].durationMin, 10);
  assert.equal(r.stops[0].idle, true);
  assert.equal(r.idleMin, 10);
  assert.equal(r.stopMin, 10);
  assert.equal(r.maxSpeed, 50);
  assert.equal(r.drivingMin, 6);
  assert.equal(r.pointCount, 20);
  assert.equal(r.daily.length, 1);
  assert.equal(r.daily[0].date, '2026-09-20');
  assert.ok(Math.abs(r.daily[0].distanceKm - r.distanceKm) < 0.05);
});

test('a stop with the engine off is not idling', () => {
  const points = scenario().map((p) => (p.speed === 0 && p.timestamp > T0 + 6 * MIN ? { ...p, ignition: false } : p));
  const r = analyzePoints(points);
  assert.equal(r.stops.length, 1);
  assert.equal(r.stops[0].idle, false);
  assert.equal(r.idleMin, 0);
  assert.equal(r.stopMin, 10);
});

test('GPS drift while parked adds no distance', () => {
  const parked = Array.from({ length: 30 }, (_, i) => pt(i, 47.9 + (i % 2) * 0.0003, 0));
  const r = analyzePoints(parked);
  assert.equal(r.distanceKm, 0);
  assert.equal(r.tripCount, 0);
  assert.equal(r.stops.length, 1);
  assert.equal(r.stops[0].durationMin, 29);
});

test('data gaps break trips and are not counted as distance; glitches are ignored', () => {
  const r = analyzePoints([
    pt(0, 47.90, 50), pt(1, 47.91, 50), pt(2, 47.92, 50),
    pt(90, 48.50, 50), // 90 minutes of silence, then far away: nothing is assumed about the gap
    pt(91, 48.51, 50), pt(92, 48.52, 50)
  ]);
  assert.equal(r.tripCount, 2);
  assert.ok(Math.abs(r.distanceKm - 4.45) < 0.05, `distance ${r.distanceKm}`);

  const glitch = analyzePoints([pt(0, 47.90, 50), pt(1, 47.91, 50), pt(2, 60.0, 50), pt(3, 47.92, 50), pt(4, 47.93, 50)]);
  assert.ok(glitch.distanceKm < 5, `glitch distance ${glitch.distanceKm}`);
  assert.equal(glitch.tripCount, 1);
});

test('tiny movements are not trips and a stop that is still going on is reported', () => {
  const tiny = analyzePoints([pt(0, 47.9, 0), pt(1, 47.9002, 5), pt(2, 47.9002, 0)]);
  assert.equal(tiny.tripCount, 0);

  const ongoing = analyzePoints([pt(0, 47.90, 50), pt(1, 47.91, 50), pt(2, 47.91, 0), pt(10, 47.91, 0)]);
  assert.equal(ongoing.tripCount, 1);
  assert.equal(ongoing.stops.length, 1);
  assert.equal(ongoing.stops[0].durationMin, 8);

  const empty = analyzePoints([]);
  assert.equal(empty.distanceKm, 0);
  assert.equal(empty.firstSeen, null);
});

test('distance is split between local days (Ulaanbaatar is UTC+8)', () => {
  // local midnight = 16:00 UTC
  const base = Date.parse('2026-09-20T15:58:00Z');
  const p = (m, lat) => ({ timestamp: base + m * MIN, lat, lng: 106.9, speed: 60, ignition: true });
  const r = analyzePoints([p(0, 47.90), p(1, 47.91), p(2, 47.92), p(3, 47.93), p(4, 47.94)]);
  assert.deepEqual(r.daily.map((d) => d.date), ['2026-09-20', '2026-09-21']);
  assert.ok(r.daily[0].distanceKm > 0 && r.daily[1].distanceKm > 0);
});

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------
async function api(method, route, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (raw) return res;
  return { status: res.status, body: await res.json() };
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not start');
}

function tracker() {
  const socket = net.connect(TCP_PORT, '127.0.0.1');
  const chunks = [];
  let waiter = null;
  socket.on('data', (d) => { chunks.push(d); waiter?.(); });
  socket.on('error', () => {});
  const next = (bytes) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No reply')), 4000);
    waiter = () => {
      const have = Buffer.concat(chunks);
      if (have.length >= bytes) { clearTimeout(timer); chunks.length = 0; resolve(have.subarray(0, bytes)); }
    };
    waiter();
  });
  return {
    login: async (imei) => { socket.write(encodeLogin(imei)); return (await next(1))[0]; },
    send: async (records) => { socket.write(encodeAvlPacket(records)); return (await next(4)).readUInt32BE(0); },
    close: () => socket.destroy()
  };
}

let imeiCounter = 0;
const nextImei = () => `35630704277${String(1000 + imeiCounter++)}`;
const signUp = async (org, email) => {
  const res = await api('POST', '/auth/register', { body: { organizationName: org, name: 'Admin', email, password: 'password123' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: String(TCP_PORT), GT06_TCP_PORT: '0', GPS_TCP_HOST: '127.0.0.1', JWT_SECRET: 'test-secret', RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv()
    },
    stdio: 'ignore'
  });
  await waitForServer();
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

test('GPS report API: totals, trips, stops, fuel, alerts, CSV and access rules', async () => {
  const a = await signUp('Report A', 'a@reports.example');
  const b = await signUp('Report B', 'b@reports.example');
  const vehicle = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'T', model: 'T1', fuelType: 'Diesel' });
  const va = (await api('POST', '/vehicles', { token: a.token, body: vehicle('RPT 1') })).body.data;
  const idle = (await api('POST', '/vehicles', { token: a.token, body: vehicle('=1+1') })).body.data; // never moves; CSV formula guard
  const vb = (await api('POST', '/vehicles', { token: b.token, body: vehicle('RPT 2') })).body.data;
  const imei = nextImei();
  await api('POST', '/devices', { token: a.token, body: { name: 'T', imei, vehicle: va._id } });

  const t = tracker();
  assert.equal(await t.login(imei), 1);

  // the scenario from the unit test, 3 hours ago (as GPS records with an ignition IO)
  const start = Date.now() - 3 * 60 * MIN;
  const record = (p) => ({
    timestamp: new Date(start + (p.timestamp - T0)), lat: p.lat, lng: p.lng, speed: p.speed,
    altitude: 1300, heading: 0, satellites: 9, io: { 239: p.ignition ? 1 : 0 }
  });
  const points = scenario().map(record);
  assert.equal(await t.send(points.slice(0, 10)), 10);
  assert.equal(await t.send(points.slice(10)), 10);

  // plus two live reports above the speed limit (-> one speeding alert)
  await api('PUT', '/organization', { token: a.token, body: { settings: { speedLimitKmh: 90 } } });
  const live = (s, lat) => ({ timestamp: new Date(Date.now() - 90 * 1000 + s * 30000), lat, lng: 106.9, speed: 120, altitude: 0, heading: 0, satellites: 9, io: { 239: 1 } });
  assert.equal(await t.send([live(1, 47.99), live(2, 47.992)]), 2);

  // a fuel purchase in the period
  const fuel = await api('POST', '/fuel', {
    token: a.token,
    body: { vehicleId: va._id, date: new Date(Date.now() - 2 * 60 * MIN).toISOString(), fuelType: 'Diesel', quantity: 50, pricePerLiter: 3000, odometerReading: 1000, fuelStation: 'S' }
  });
  assert.equal(fuel.status, 201, JSON.stringify(fuel.body));

  const range = `from=${encodeURIComponent(new Date(Date.now() - 4 * 60 * MIN).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + MIN).toISOString())}`;

  const fleet = await api('GET', `/reports/gps?${range}`, { token: a.token });
  assert.equal(fleet.status, 200, JSON.stringify(fleet.body));
  const s = fleet.body.data.summary;
  assert.equal(s.vehicles, 2);
  assert.equal(s.activeVehicles, 1);
  assert.equal(s.tripCount, 3);
  assert.ok(Math.abs(s.distanceKm - 6.9) < 0.2, `distance ${s.distanceKm}`);
  assert.equal(s.maxSpeed, 120);
  assert.equal(s.idleMin, 10);
  assert.equal(s.speedingAlerts, 1);
  assert.equal(s.fuelLiters, 50);
  assert.equal(s.fuelCost, 150000);
  assert.ok(s.kmPerLiter > 0.1 && s.kmPerLiter < 0.2);
  assert.equal(fleet.body.data.trips, undefined); // lists only for a single vehicle
  const row = fleet.body.data.vehicles.find((v) => v.registrationNumber === 'RPT 1');
  assert.equal(row.tripCount, 3);
  assert.equal(fleet.body.data.vehicles.find((v) => v.vehicleId === idle._id).pointCount, 0);
  assert.ok(fleet.body.data.daily.length >= 1);

  const detail = await api('GET', `/reports/gps?${range}&vehicleId=${va._id}`, { token: a.token });
  assert.equal(detail.body.data.trips.length, 3);
  assert.equal(detail.body.data.stops.length, 1);
  assert.equal(detail.body.data.stops[0].durationMin, 10);
  assert.ok(new Date(detail.body.data.trips[0].start) > new Date(detail.body.data.trips[2].start)); // newest first

  // CSV exports
  const csvRes = await api('GET', `/reports/gps.csv?${range}&lang=en`, { token: a.token, raw: true });
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers.get('content-type'), /text\/csv/);
  const bytes = Buffer.from(await csvRes.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // UTF-8 BOM so Excel reads Cyrillic correctly
  const csv = bytes.toString('utf8').replace(/^\uFEFF/, '');
  assert.ok(csv.startsWith('Vehicle,Distance km,Trips'));
  assert.ok(csv.includes('RPT 1,'));
  assert.ok(csv.includes("'=1+1,"), 'formula-like cells are neutralized');
  // column titles follow ?lang=, and the user's own language when it is absent (new users are Mongolian)
  const mnCsv = (await (await api('GET', `/reports/gps.csv?${range}&lang=mn`, { token: a.token, raw: true })).text()).replace(/^\uFEFF/, '');
  assert.ok(!mnCsv.startsWith('Vehicle,') && /^[А-Яа-яӨөҮү]/.test(mnCsv), 'titles are translated');
  assert.ok(mnCsv.split('\r\n')[0].includes('"Зай, км"'), 'a title containing a comma is quoted');
  const defaultCsv = (await (await api('GET', `/reports/gps.csv?${range}`, { token: a.token, raw: true })).text()).replace(/^\uFEFF/, '');
  assert.equal(defaultCsv.split('\r\n')[0], mnCsv.split('\r\n')[0]);
  const tripsCsv = await (await api('GET', `/reports/gps.csv?${range}&vehicleId=${va._id}&type=trips&lang=en`, { token: a.token, raw: true })).text();
  assert.equal(tripsCsv.trim().split('\r\n').length, 4); // header + 3 trips
  assert.equal((await api('GET', `/reports/gps.csv?${range}&type=trips`, { token: a.token, raw: true })).status, 400);

  // validation, isolation and roles
  assert.equal((await api('GET', '/reports/gps?from=nope', { token: a.token })).status, 400);
  assert.equal((await api('GET', '/reports/gps?from=2026-01-01&to=2026-06-01', { token: a.token })).status, 400);
  assert.equal((await api('GET', `/reports/gps?${range}&vehicleId=${vb._id}`, { token: a.token })).status, 404);
  const other = await api('GET', `/reports/gps?${range}`, { token: b.token });
  assert.equal(other.body.data.summary.distanceKm, 0);
  assert.equal(other.body.data.summary.vehicles, 1);

  const driver = await api('POST', '/auth/users', { token: a.token, body: { name: 'D', email: 'd@reports.example', password: 'password123', role: 'driver' } });
  const driverLogin = await api('POST', '/auth/login', { body: { email: driver.body.data.email, password: 'password123' } });
  assert.equal((await api('GET', `/reports/gps?${range}`, { token: driverLogin.body.data.token })).status, 403);
  assert.equal((await api('GET', `/reports/gps?${range}`)).status, 401);
  t.close();
});
