import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Gt06Parser, PROTOCOL, crcItu, encodeAck, encodeHeartbeat, encodeLocation, encodeLogin, encodePacket } from '../gps/protocols/gt06.js';
import { encodeLogin as encodeTeltonikaLogin } from '../gps/protocols/teltonika.js';

const HTTP_PORT = 3400 + Math.floor(Math.random() * 90);
const TCP_PORT = 6500 + Math.floor(Math.random() * 90);
const GT06_PORT = 6600 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-gt06-test-${process.pid}.json`);

// ---------------------------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------------------------
const rec = { timestamp: new Date('2026-10-04T10:20:30Z'), lat: 47.9188, lng: 106.9176, speed: 55, heading: 271, satellites: 9 };
const parse = (...buffers) => { const p = new Gt06Parser(); return buffers.flatMap((b) => p.push(b)); };

test('CRC-ITU matches the published check value and the documented login packet', () => {
  assert.equal(crcItu(Buffer.from('123456789')), 0x906e);
  // login packet from the Concox protocol documentation (terminal id 0123456789012345, serial 1)
  const doc = Buffer.from('78780d01012345678901234500018cdd0d0a', 'hex');
  assert.deepEqual(parse(doc), [{ type: 'login', imei: '123456789012345', serial: 1 }]);
  // ...and the documented server reply
  assert.equal(encodeAck(PROTOCOL.LOGIN, 1).toString('hex'), '787805010001d9dc0d0a');
  assert.equal(encodeLogin('123456789012345', 1).subarray(0, 12).toString('hex'), '787811010123456789012345');
});

test('location packets (0x12 / 0x22 / 0x16 / 0x26) decode to the same position', () => {
  for (const [protocol, ack] of [[0x12, false], [0x22, false], [0x16, true], [0x26, true]]) {
    const [event] = parse(encodeLocation(rec, { protocol, serial: 7 }));
    assert.equal(event.type, 'location');
    assert.equal(event.protocol, protocol);
    assert.equal(event.serial, 7);
    assert.equal(event.ack, ack);
    assert.equal(event.record.timestamp.toISOString(), '2026-10-04T10:20:30.000Z');
    assert.ok(Math.abs(event.record.lat - 47.9188) < 1e-5);
    assert.ok(Math.abs(event.record.lng - 106.9176) < 1e-5);
    assert.equal(event.record.speed, 55);
    assert.equal(event.record.heading, 271);
    assert.equal(event.record.satellites, 9);
  }
});

test('hemispheres, missing GPS fix, ignition from heartbeat and from the 0x22 ACC byte', () => {
  const [south] = parse(encodeLocation({ ...rec, lat: -33.5, lng: -70.6 }));
  assert.ok(Math.abs(south.record.lat + 33.5) < 1e-5 && Math.abs(south.record.lng + 70.6) < 1e-5);

  const [noFix] = parse(encodeLocation(rec, { fixed: false }));
  assert.equal(noFix.record, null);

  const p = new Gt06Parser();
  assert.deepEqual(p.push(encodeLocation(rec))[0].record.io, {}); // ignition unknown yet
  p.push(encodeHeartbeat({ ignition: true }));
  assert.equal(p.push(encodeLocation(rec))[0].record.io[239], 1);
  p.push(encodeHeartbeat({ ignition: false }));
  assert.equal(p.push(encodeLocation(rec))[0].record.io[239], 0);
  assert.equal(p.push(encodeLocation({ ...rec, ignition: true }, { protocol: 0x22 }))[0].record.io[239], 1);
  assert.equal(p.push(encodeLocation({ ...rec, ignition: false }, { protocol: 0x22 }))[0].record.io[239], 0);
});

test('stream handling: fragments, batches, garbage, bad CRC, extended frames, hostile input', () => {
  const login = encodeLogin('123456789012345', 1);
  const loc = encodeLocation(rec, { serial: 2 });

  // one byte at a time
  const slow = new Gt06Parser();
  const events = [];
  for (const byte of Buffer.concat([login, loc])) events.push(...slow.push(Buffer.from([byte])));
  assert.deepEqual(events.map((e) => e.type), ['login', 'location']);

  // several frames in one chunk, preceded by noise
  const batch = parse(Buffer.concat([Buffer.from([0x00, 0xff, 0x13]), login, loc, loc]));
  assert.deepEqual(batch.map((e) => e.type), ['login', 'location', 'location']);

  // corrupted CRC is reported, the next frame still decodes
  const bad = Buffer.from(loc);
  bad[bad.length - 5] ^= 0xff;
  assert.deepEqual(parse(bad, loc).map((e) => e.type), ['bad-crc', 'location']);

  // extended frames (0x7979) are framed correctly; unknown protocols are ignored, not fatal
  const ext = encodePacket(0x94, Buffer.from([0x00, 0x01, 0x02]), 9, { extended: true });
  assert.deepEqual(parse(ext, loc).map((e) => e.type), ['unknown', 'location']);

  // not GT06 at all
  assert.throws(() => parse(Buffer.alloc(4000, 0x41)), /Not a GT06 stream/);
  assert.throws(() => parse(encodePacket(0x01, Buffer.from('0a00000000000000', 'hex'), 1)), /Invalid GT06 terminal id/);
  const badDate = encodeLocation({ ...rec, timestamp: new Date('2026-10-04T10:20:30Z') });
  badDate[4 + 1] = 13; // month 13 (CRC is checked first, so patch it consistently)
  const fixedCrc = Buffer.from(badDate);
  fixedCrc.writeUInt16BE(crcItu(fixedCrc.subarray(2, fixedCrc.length - 4)), fixedCrc.length - 4);
  assert.throws(() => parse(fixedCrc), /Invalid GT06 date/);
});

// ---------------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------------
let server;

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

async function waitFor(check, label, ms = 6000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Minimal GT06 tracker: sends frames and collects what the server answers
function tracker(port = GT06_PORT) {
  const socket = net.connect(port, '127.0.0.1');
  const chunks = [];
  let closed = false;
  socket.on('data', (d) => chunks.push(d));
  socket.on('close', () => { closed = true; });
  socket.on('error', () => {});
  const received = () => Buffer.concat(chunks);
  return {
    isClosed: () => closed,
    received,
    send: (buffer) => socket.write(buffer),
    // waits for `bytes` bytes of reply and consumes them
    reply: async (bytes) => {
      await waitFor(() => received().length >= bytes || closed, 'reply');
      const have = received();
      chunks.length = 0;
      if (have.length > bytes) chunks.push(have.subarray(bytes));
      return have.subarray(0, bytes);
    },
    close: () => socket.destroy()
  };
}

let imeiCounter = 0;
const nextImei = () => `86812030${String(1000000 + imeiCounter++)}`;
const vehicle = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'T', model: 'T1', fuelType: 'Diesel' });
const signUp = async (org, email) => {
  const res = await api('POST', '/auth/register', { body: { organizationName: org, name: 'Admin', email, password: 'password123' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};
let clock = 0;
const at = (offsetMs = 0) => new Date(Date.now() - 3 * 60 * 1000 + (clock += 1000) + offsetMs);

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: String(TCP_PORT), GT06_TCP_PORT: String(GT06_PORT), GPS_TCP_HOST: '127.0.0.1',
      JWT_SECRET: 'test-secret', FLEETNOVA_DATA_FILE: DATA_FILE
    },
    stdio: 'ignore'
  });
  await waitFor(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, 'server', 15000);
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

test('GT06 devices: registration rules and connection info', async () => {
  const org = await signUp('Gt06 Reg', 'a@gt06reg.example');
  assert.equal((await api('POST', '/devices', { token: org.token, body: { name: 'x', imei: '123', protocol: 'gt06' } })).status, 400);
  const ok = await api('POST', '/devices', { token: org.token, body: { name: 'Concox', imei: nextImei(), protocol: 'gt06' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.protocol, 'gt06');
  assert.equal(ok.body.data.secret, undefined);
  const info = await api('GET', '/devices/connection-info', { token: org.token });
  assert.deepEqual(info.body.data.gt06, { enabled: true, port: GT06_PORT });
});

test('GT06 tracker: login, heartbeat, locations, live position and history', async () => {
  const org = await signUp('Gt06 Flow', 'a@gt06flow.example');
  const v = await api('POST', '/vehicles', { token: org.token, body: vehicle('GT6 1') });
  const imei = nextImei();
  const dev = await api('POST', '/devices', { token: org.token, body: { name: 'Concox', imei, protocol: 'gt06', vehicle: v.body.data._id } });
  assert.equal(dev.status, 201);

  const t = tracker();
  t.send(encodeLogin(imei, 1));
  assert.equal((await t.reply(10)).toString('hex'), encodeAck(PROTOCOL.LOGIN, 1).toString('hex'));

  t.send(encodeHeartbeat({ ignition: true }, 2));
  assert.equal((await t.reply(10)).toString('hex'), encodeAck(PROTOCOL.HEARTBEAT, 2).toString('hex'));

  // three locations in one TCP write, moving north (no reply expected for 0x12)
  const points = [0, 1, 2].map((i) => ({ timestamp: at(), lat: 47.9 + i * 0.01, lng: 106.9, speed: 40, heading: 0, satellites: 9 }));
  t.send(Buffer.concat(points.map((p, i) => encodeLocation(p, { serial: 10 + i }))));
  await waitFor(async () => (await api('GET', '/tracking/live', { token: org.token })).body.data[0]?.lat === 47.92, 'live position');

  const live = (await api('GET', '/tracking/live', { token: org.token })).body.data[0];
  assert.equal(live.vehicle.registrationNumber, 'GT6 1');
  assert.equal(live.ignition, true); // from the heartbeat
  assert.equal(live.online, true);
  assert.equal(live.speed, 40);

  const history = await api('GET', `/tracking/history?vehicleId=${v.body.data._id}`, { token: org.token });
  assert.equal(history.body.data.totalPoints, 3);
  assert.ok(history.body.data.distanceKm > 2 && history.body.data.distanceKm < 2.5);

  // alarm packets (0x16) must be acknowledged with the same protocol number and serial
  t.send(encodeLocation({ timestamp: at(), lat: 47.93, lng: 106.9, speed: 40, heading: 0, satellites: 9 }, { protocol: PROTOCOL.ALARM, serial: 77 }));
  assert.equal((await t.reply(10)).toString('hex'), encodeAck(PROTOCOL.ALARM, 77).toString('hex'));

  // a corrupted frame is ignored, the connection keeps working
  const corrupt = encodeLocation({ timestamp: at(), lat: 47.5, lng: 106.5, speed: 10, heading: 0, satellites: 9 }, { serial: 90 });
  corrupt[corrupt.length - 5] ^= 0xff;
  t.send(corrupt);
  // 4G location (0x22) with the ACC byte switches ignition off
  t.send(encodeLocation({ timestamp: at(), lat: 47.94, lng: 106.9, speed: 0, heading: 0, satellites: 9, ignition: false }, { protocol: PROTOCOL.LOCATION_4G, serial: 91 }));
  await waitFor(async () => (await api('GET', '/tracking/live', { token: org.token })).body.data[0]?.lat === 47.94, 'last location');
  const after2 = (await api('GET', '/tracking/live', { token: org.token })).body.data[0];
  assert.equal(after2.ignition, false);
  const all = await api('GET', `/tracking/history?vehicleId=${v.body.data._id}`, { token: org.token });
  assert.equal(all.body.data.totalPoints, 5); // 3 + alarm + 4G, not the corrupted one

  // a location without a GPS fix is not stored
  t.send(encodeLocation({ timestamp: at(), lat: 0, lng: 0, speed: 0, heading: 0, satellites: 0 }, { fixed: false, serial: 92 }));
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await api('GET', `/tracking/history?vehicleId=${v.body.data._id}`, { token: org.token })).body.data.totalPoints, 5);
  t.close();
});

test('unknown trackers, wrong protocol, data before login and heartbeats-only devices', async () => {
  const org = await signUp('Gt06 Auth', 'a@gt06auth.example');

  // unknown IMEI: disconnected without any reply
  const stranger = tracker();
  stranger.send(encodeLogin(nextImei(), 1));
  await waitFor(() => stranger.isClosed(), 'disconnect');
  assert.equal(stranger.received().length, 0);

  // a Teltonika device cannot use the GT06 port, a GT06 device cannot use the Teltonika port
  const tel = nextImei();
  await api('POST', '/devices', { token: org.token, body: { name: 'Tel', imei: tel, protocol: 'teltonika' } });
  const wrongPort = tracker();
  wrongPort.send(encodeLogin(tel, 1));
  await waitFor(() => wrongPort.isClosed(), 'disconnect');

  const gt = nextImei();
  const created = await api('POST', '/devices', { token: org.token, body: { name: 'Gt', imei: gt, protocol: 'gt06' } });
  const onTeltonika = tracker(TCP_PORT);
  onTeltonika.send(encodeTeltonikaLogin(gt));
  assert.equal((await onTeltonika.reply(1))[0], 0);
  onTeltonika.close();

  // data before login closes the connection
  const eager = tracker();
  eager.send(encodeLocation({ timestamp: at(), lat: 47.9, lng: 106.9, speed: 10, heading: 0, satellites: 9 }));
  await waitFor(() => eager.isClosed(), 'disconnect');

  // heartbeats alone keep the device online
  const beat = tracker();
  beat.send(encodeLogin(gt, 1));
  await beat.reply(10);
  beat.send(encodeHeartbeat({ ignition: false }, 2));
  await beat.reply(10);
  const device = await waitFor(async () => {
    const list = (await api('GET', '/devices', { token: org.token })).body.data;
    const d = list.find((x) => x._id === created.body.data._id);
    return d.online ? d : null;
  }, 'online device');
  assert.equal(device.lastPosition, null);
  beat.close();
});

test('speeding alerts work for GT06 trackers too (shared alert engine)', async () => {
  const org = await signUp('Gt06 Alerts', 'a@gt06alerts.example');
  const v = await api('POST', '/vehicles', { token: org.token, body: vehicle('GT6 2') });
  const imei = nextImei();
  await api('POST', '/devices', { token: org.token, body: { name: 'Concox', imei, protocol: 'gt06', vehicle: v.body.data._id } });
  await api('PUT', '/organization', { token: org.token, body: { settings: { speedLimitKmh: 90 } } });

  const t = tracker();
  t.send(encodeLogin(imei, 1));
  await t.reply(10);
  const now = Date.now();
  const fast = (s, lat) => encodeLocation({ timestamp: new Date(now - 30000 + s * 15000), lat, lng: 106.9, speed: 120, heading: 0, satellites: 9 }, { serial: s });
  t.send(Buffer.concat([fast(1, 47.9), fast(2, 47.901)]));
  const alerts = await waitFor(async () => {
    const list = (await api('GET', '/notifications', { token: org.token })).body.data.filter((n) => n.type === 'speeding');
    return list.length ? list : null;
  }, 'speeding alert');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].params.speed, 120);
  t.close();
});
