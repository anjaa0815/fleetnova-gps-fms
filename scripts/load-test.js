#!/usr/bin/env node
// Load test: many simulated trackers send positions while API clients read, against a RUNNING server.
//
//   node scripts/load-test.js --admin-email platform@x.com --admin-password '...' \
//        [--base http://127.0.0.1:3000] [--devices 200] [--rate 1] [--duration 30] [--protocol teltonika|osmand]
//        [--tcp-port 5027] [--batch 1] [--readers 5] [--ramp 5]
//
//   devices   simulated trackers              rate      positions per tracker per second
//   batch     records per Teltonika packet    readers   concurrent API clients (live map, history, GPS report)
//   ramp      seconds over which trackers connect
//
// Start the server with RATE_LIMIT_DISABLED=true (and REQUIRE_EMAIL_VERIFICATION=false). The test creates its own
// organization (enterprise plan, through the platform admin) and leaves its data behind: use a throw-away database.
import net from 'net';
import { encodeAvlPacket, encodeLogin } from '../server/gps/protocols/teltonika.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, [])
);
const base = String(args.base || 'http://127.0.0.1:3000').replace(/\/$/, '');
const host = new URL(base).hostname;
const devices = Number(args.devices || 200);
const rate = Number(args.rate || 1);
const duration = Number(args.duration || 30);
const protocol = String(args.protocol || 'teltonika');
const tcpPort = Number(args['tcp-port'] || 5027);
const batch = Math.max(1, Number(args.batch || 1));
const readers = Number(args.readers ?? 5);
const rampSec = Number(args.ramp || 5);
if (!args['admin-email'] || !args['admin-password'] || !['teltonika', 'osmand'].includes(protocol)) {
  console.error('Usage: node scripts/load-test.js --admin-email E --admin-password P [--base URL] [--devices N] [--rate R] [--duration S] [--protocol teltonika|osmand] [--tcp-port P] [--batch B] [--readers C] [--ramp S]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (method, route, { token, body } = {}) => {
  const res = await fetch(`${base}/api${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body: json, text };
};

// ---- metrics -------------------------------------------------------------------------------
class Metric {
  constructor() { this.samples = []; this.errors = 0; }
  add(ms) { this.samples.push(ms); }
  err() { this.errors += 1; }
  summary() {
    const s = [...this.samples].sort((a, b) => a - b);
    const pick = (q) => (s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10 : null);
    return { count: s.length, errors: this.errors, p50: pick(0.5), p95: pick(0.95), p99: pick(0.99), max: s.length ? Math.round(s[s.length - 1]) : null };
  }
}
const ingest = new Metric();
const reads = { live: new Metric(), history: new Metric(), report: new Metric() };

// ---- setup ---------------------------------------------------------------------------------
async function setup() {
  const admin = await api('POST', '/auth/login', { body: { email: args['admin-email'], password: args['admin-password'] } });
  if (admin.status !== 200) throw new Error(`Platform admin login failed (${admin.status})`);
  const stamp = Date.now().toString(36);
  const email = `load-${stamp}@loadtest.example`;
  const reg = await api('POST', '/auth/register', { body: { organizationName: `Load ${stamp}`, name: 'Load', email, password: 'load-test-pass-1' } });
  if (reg.status !== 201) throw new Error(`Register failed (${reg.status}): ${reg.text.slice(0, 200)}`);
  const { token, organization } = reg.body.data;
  const plan = await api('PUT', `/platform/organizations/${organization._id}`, { token: admin.body.data.token, body: { plan: 'enterprise' } });
  if (plan.status !== 200) throw new Error(`Plan change failed (${plan.status})`);

  const fleet = [];
  const prefix = String(Math.floor(Math.random() * 9e5) + 1e5); // 6 digits
  const create = async (i) => {
    const vehicle = await api('POST', '/vehicles', {
      token,
      body: { registrationNumber: `LT ${stamp.toUpperCase()}${i}`, vehicleType: 'Truck', brand: 'Load', model: 'T', fuelType: 'Diesel', registrationExpiry: '2030-01-01', insuranceExpiry: '2030-01-01', fuelCapacity: 100, manufacturingYear: 2020 }
    });
    if (vehicle.status !== 201) throw new Error(`Vehicle create failed (${vehicle.status}): ${vehicle.text.slice(0, 200)}`);
    const imei = protocol === 'teltonika' ? `${prefix}${String(i).padStart(9, '0')}` : `load${prefix}x${i}`;
    const device = await api('POST', '/devices', { token, body: { name: `LT-${i}`, imei, protocol, vehicle: vehicle.body.data._id } });
    if (device.status !== 201) throw new Error(`Device create failed (${device.status}): ${device.text.slice(0, 200)}`);
    fleet.push({ i, imei, secret: device.body.data.secret, deviceId: device.body.data._id, vehicleId: vehicle.body.data._id, acked: 0, lat: 47.9 + (i % 100) * 0.001, lng: 106.9 + (i % 100) * 0.001 });
  };
  for (let i = 0; i < devices; i += 20) await Promise.all(Array.from({ length: Math.min(20, devices - i) }, (_, k) => create(i + k)));
  return { token, fleet };
}

// ---- trackers ------------------------------------------------------------------------------
// Every record of a tracker gets its own device time, one second after the previous one, starting ten minutes in
// the past (the server drops repeated device timestamps). rate x batch x duration must stay below 600 records.
const nextRecord = (d) => {
  d.lat += 0.00005; d.lng += 0.00003;
  d.clock = (d.clock ?? Date.now() - 600e3) + 1000;
  return { timestamp: new Date(d.clock), lat: d.lat, lng: d.lng, altitude: 1300, heading: 45, satellites: 9, speed: 40 + (d.i % 30), io: { 239: 1 } };
};

function runTeltonika(d, stopAt, jitter) {
  return new Promise((resolve) => {
    const socket = net.connect(tcpPort, host);
    let pending = null; // { sentAt, records }
    let buffer = Buffer.alloc(0);
    let stage = 'login';
    const finish = () => { clearInterval(timer); socket.destroy(); resolve(); };
    socket.on('error', () => { ingest.err(); finish(); });
    socket.on('close', () => finish());
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 'login' && buffer.length >= 1) {
        if (buffer[0] !== 1) { ingest.err(); return finish(); }
        buffer = buffer.subarray(1); stage = 'data';
      }
      while (stage === 'data' && buffer.length >= 4 && pending) {
        const count = buffer.readUInt32BE(0);
        buffer = buffer.subarray(4);
        ingest.add(performance.now() - pending.sentAt);
        if (count === pending.records) d.acked += count; else ingest.err();
        pending = null;
      }
    });
    socket.on('connect', () => socket.write(encodeLogin(d.imei)));
    const period = 1000 / rate;
    const timer = setInterval(() => {
      if (stage !== 'data' || pending) return; // never more than one unacknowledged packet per tracker
      if (Date.now() >= stopAt) return finish();
      const records = Array.from({ length: batch }, () => nextRecord(d));
      pending = { sentAt: performance.now(), records: batch };
      socket.write(encodeAvlPacket(records));
    }, period);
    void jitter;
  });
}

async function runOsmand(d, stopAt) {
  const period = 1000 / rate;
  while (Date.now() < stopAt) {
    const t0 = performance.now();
    const r = nextRecord(d);
    try {
      const res = await fetch(`${base}/api/gps/osmand?id=${d.imei}&key=${d.secret}&lat=${r.lat}&lon=${r.lng}&speed=20&timestamp=${r.timestamp.getTime()}`);
      await res.text();
      if (res.status === 200) { ingest.add(performance.now() - t0); d.acked += 1; } else ingest.err();
    } catch { ingest.err(); }
    await sleep(Math.max(0, period - (performance.now() - t0)));
  }
}

// ---- readers -------------------------------------------------------------------------------
async function runReader(token, fleet, stopAt, n) {
  while (Date.now() < stopAt) {
    const pick = fleet[Math.floor(Math.random() * fleet.length)];
    const now = Date.now();
    const calls = [
      ['live', '/tracking/live'],
      ['history', `/tracking/history?deviceId=${pick.deviceId}&from=${encodeURIComponent(new Date(now - 3600e3).toISOString())}&to=${encodeURIComponent(new Date(now + 60e3).toISOString())}`],
      ['report', `/reports/gps?from=${encodeURIComponent(new Date(now - 3600e3).toISOString())}&to=${encodeURIComponent(new Date(now + 60e3).toISOString())}`]
    ];
    for (const [name, route] of calls) {
      const t0 = performance.now();
      try {
        const res = await api('GET', route, { token });
        if (res.status === 200) reads[name].add(performance.now() - t0); else reads[name].err();
      } catch { reads[name].err(); }
      if (Date.now() >= stopAt) break;
      await sleep(200 + n * 20);
    }
  }
}

// ---- run -----------------------------------------------------------------------------------
async function main() {
  console.log(`Load test: ${devices} ${protocol} trackers x ${rate}/s x batch ${batch}, ${readers} readers, ${duration}s -> ${base}`);
  const { token, fleet } = await setup();
  console.log(`Created ${fleet.length} vehicles and trackers.`);

  const startedAt = Date.now();
  const stopAt = startedAt + (rampSec + duration) * 1000;
  const run = fleet.map(async (d, k) => {
    await sleep((k / fleet.length) * rampSec * 1000);
    return protocol === 'teltonika' ? runTeltonika(d, stopAt) : runOsmand(d, stopAt);
  });
  const readerRuns = Array.from({ length: readers }, (_, n) => runReader(token, fleet, stopAt, n));

  const progress = setInterval(() => {
    const s = ingest.summary();
    console.log(`  t=${Math.round((Date.now() - startedAt) / 1000)}s acked packets ${s.count} (p95 ${s.p95} ms) errors ${s.errors}`);
  }, 5000);
  await Promise.all([...run, ...readerRuns]);
  clearInterval(progress);
  const elapsed = (Date.now() - startedAt) / 1000;

  // let the server finish queued writes, then compare stored points with acknowledged records
  await sleep(1500);
  const sample = fleet.filter((_, k) => k % Math.max(1, Math.floor(fleet.length / 8)) === 0).slice(0, 8);
  let mismatches = 0;
  for (const d of sample) {
    const res = await api('GET', `/tracking/history?deviceId=${d.deviceId}&from=${encodeURIComponent(new Date(startedAt - 700e3).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60e3).toISOString())}`, { token });
    const stored = res.body?.data?.totalPoints;
    if (stored !== d.acked) { mismatches += 1; console.log(`  MISMATCH ${d.imei}: acknowledged ${d.acked}, stored ${stored}`); }
  }

  const records = fleet.reduce((sum, d) => sum + d.acked, 0);
  const result = {
    config: { protocol, devices, rate, batch, readers, durationSec: duration },
    elapsedSec: Math.round(elapsed),
    recordsAcknowledged: records,
    recordsPerSecond: Math.round(records / elapsed),
    ingestLatencyMs: ingest.summary(),
    readLatencyMs: Object.fromEntries(Object.entries(reads).map(([k, m]) => [k, m.summary()])),
    sampledDevices: sample.length,
    storedMismatches: mismatches
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(mismatches || ingest.errors ? 2 : 0);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
