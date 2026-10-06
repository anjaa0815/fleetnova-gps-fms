import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';
import { encodeAvlPacket, encodeLogin as teltonikaLogin, encodeCodec12Response } from '../gps/protocols/teltonika.js';
import { encodeLogin as gt06Login, encodeLocation, encodeCommandResponse, crcItu } from '../gps/protocols/gt06.js';

const HTTP_PORT = 7900 + Math.floor(Math.random() * 90);
const TCP_PORT = 8000 + Math.floor(Math.random() * 90);
const GT06_PORT = 8100 + Math.floor(Math.random() * 90);
const TRACCAR_PORT = 8200 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-commands-test-${process.pid}.json`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let traccar;
const traccarCalls = [];
let traccarDown = false;

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

async function waitFor(check, label, ms = 8000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${label}`);
    await sleep(60);
  }
}

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  // mock Traccar REST API (devices + commands)
  traccar = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (traccarDown) { res.statusCode = 503; return res.end('{}'); }
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/api/devices') return res.end(JSON.stringify([{ id: 77, uniqueId: url.searchParams.get('uniqueId') }]));
      if (req.method === 'POST' && url.pathname === '/api/commands/send') {
        traccarCalls.push(JSON.parse(raw));
        res.statusCode = 200;
        return res.end('{}');
      }
      res.statusCode = 404;
      return res.end('{}');
    });
  });
  await new Promise((r) => traccar.listen(TRACCAR_PORT, '127.0.0.1', r));

  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: String(TCP_PORT), GT06_TCP_PORT: String(GT06_PORT), GPS_TCP_HOST: '127.0.0.1', JWT_SECRET: 'test-secret',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
      COMMAND_POLL_MS: '150', COMMAND_ACK_TIMEOUT_MS: '1500', COMMAND_TTL_MS: '2500', COMMAND_ENGINE_TTL_MS: '30000',
      TRACCAR_URL: `http://127.0.0.1:${TRACCAR_PORT}`, TRACCAR_TOKEN: 't'
    },
    stdio: 'ignore'
  });
  await waitFor(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, 'server', 20000);
});

after(() => {
  server?.kill();
  traccar?.close();
  fs.rmSync(DATA_FILE, { force: true });
});

// ---- a buffered reader for the bytes the server sends to a tracker ---------------------------------------
function connect(port) {
  const socket = net.connect(port, '127.0.0.1');
  let buffer = Buffer.alloc(0);
  let closed = false;
  socket.on('data', (d) => { buffer = Buffer.concat([buffer, d]); });
  socket.on('close', () => { closed = true; });
  socket.on('error', () => {});
  return {
    socket,
    isClosed: () => closed,
    write: (b) => socket.write(b),
    take: (n) => { const out = buffer.subarray(0, n); buffer = buffer.subarray(n); return out; },
    size: () => buffer.length,
    peek: () => buffer,
    close: () => socket.destroy()
  };
}

// Teltonika: login, then positions; commands arrive as Codec 12 packets
async function teltonika(imei) {
  const c = connect(TCP_PORT);
  c.write(teltonikaLogin(imei));
  await waitFor(() => c.size() >= 1, 'login reply');
  assert.equal(c.take(1)[0], 1, 'login accepted');
  return {
    ...c,
    async position(lat, lng, speed) {
      c.write(encodeAvlPacket([{ timestamp: Date.now(), lat, lng, altitude: 1300, heading: 0, satellites: 9, speed, io: { 239: 1 } }]));
      await waitFor(() => c.size() >= 4, 'AVL ack');
      c.take(4);
    },
    // the next command packet from the server, as text
    async command(ms = 4000) {
      await waitFor(() => c.size() >= 8 && c.size() >= 12 + c.peek().readUInt32BE(4), 'a command', ms);
      const length = c.peek().readUInt32BE(4);
      const packet = c.take(12 + length);
      assert.equal(packet[8], 0x0c, 'Codec 12');
      assert.equal(packet[10], 0x05, 'type: command');
      const size = packet.readUInt32BE(11);
      return packet.subarray(15, 15 + size).toString('ascii');
    },
    reply: (text) => c.write(encodeCodec12Response(text)),
    noCommandWithin: async (ms) => { await sleep(ms); return c.size() === 0; }
  };
}

// GT06: login, locations; commands arrive as 0x80 frames
async function gt06(imei) {
  const c = connect(GT06_PORT);
  c.write(gt06Login(imei));
  await waitFor(() => c.size() >= 10, 'login reply');
  c.take(c.size());
  return {
    ...c,
    async position(lat, lng, speed) {
      c.write(encodeLocation({ timestamp: new Date(), lat, lng, speed, heading: 0, satellites: 9 }));
    },
    async command(ms = 4000) {
      await waitFor(() => c.size() >= 3 && c.size() >= 5 + c.peek()[2], 'a command', ms);
      const frame = c.take(5 + c.peek()[2]);
      assert.equal(frame[3], 0x80);
      assert.equal(frame.readUInt16BE(frame.length - 4), crcItu(frame.subarray(2, frame.length - 4)), 'CRC');
      const commandLength = frame[4];
      return { flag: frame.readUInt32BE(5), text: frame.subarray(9, 5 + commandLength).toString('ascii') };
    },
    reply: (text, flag) => c.write(encodeCommandResponse(text, flag))
  };
}

// ---- helpers ------------------------------------------------------------------------------------------
let counter = 0;
const vehicleBody = (reg) => ({ registrationNumber: reg, vehicleType: 'Truck', brand: 'B', model: 'M', fuelType: 'Diesel', registrationExpiry: '2030-01-01', insuranceExpiry: '2030-01-01', fuelCapacity: 100, manufacturingYear: 2020 });

async function setup(label, { protocol = 'teltonika', immobilizer = false } = {}) {
  counter += 1;
  const reg = await api('POST', '/auth/register', { body: { organizationName: `Cmd ${label} ${counter}`, name: 'Admin', email: `admin${counter}@${label}.cmd.example`, password: 'password123' } });
  const token = reg.body.data.token;
  const domain = `${label}.cmd.example`;
  const manager = await api('POST', '/auth/users', { token, body: { name: 'M', email: `m${counter}@${domain}`, password: 'password123', role: 'fleet_manager' } });
  const managerToken = (await api('POST', '/auth/login', { body: { email: manager.body.data.email, password: 'password123' } })).body.data.token;
  const driver = await api('POST', '/auth/users', { token, body: { name: 'D', email: `d${counter}@${domain}`, password: 'password123', role: 'driver' } });
  const driverToken = (await api('POST', '/auth/login', { body: { email: driver.body.data.email, password: 'password123' } })).body.data.token;
  const plate = `CMD ${1000 + counter}`;
  const vehicle = await api('POST', '/vehicles', { token, body: vehicleBody(plate) });
  assert.equal(vehicle.status, 201, JSON.stringify(vehicle.body));
  const imei = protocol === 'gt06' || protocol === 'teltonika' ? `3563070${String(10000000 + counter * 7 + (protocol === 'gt06' ? 1 : 0)).padStart(8, '0')}`.slice(0, 15) : `${label}-${counter}-device`;
  const device = await api('POST', '/devices', { token, body: { name: `Dev ${counter}`, imei, protocol, vehicle: vehicle.body.data._id } });
  assert.equal(device.status, 201, JSON.stringify(device.body));
  const id = device.body.data._id;
  if (immobilizer) assert.equal((await api('PUT', `/devices/${id}`, { token, body: { immobilizer: true } })).status, 200);
  const send = (type, extra = {}, who = token) => api('POST', `/devices/${id}/commands`, { token: who, body: { type, ...extra } });
  const list = async (who = token) => (await api('GET', `/devices/${id}/commands`, { token: who })).body.data;
  const status = async (commandId) => (await list()).find((c) => c._id === commandId)?.status;
  const waitStatus = (commandId, expected, ms) => waitFor(async () => (await status(commandId)) === expected, `${expected}`, ms);
  return { token, managerToken, driverToken, id, imei, plate, vehicleId: vehicle.body.data._id, send, list, status, waitStatus };
}

test('locate: the command reaches a connected tracker and its answer is recorded', async () => {
  const s = await setup('locate');
  const t = await teltonika(s.imei);
  const sent = await s.send('locate');
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(await t.command(), 'getgps');
  await s.waitStatus(sent.body.data._id, 'sent');
  t.reply('GPS:1 Sat:9 Lat:47.9 Lon:106.9');
  await s.waitStatus(sent.body.data._id, 'acknowledged');
  const done = (await s.list())[0];
  assert.equal(done.response, 'GPS:1 Sat:9 Lat:47.9 Lon:106.9');
  assert.equal(done.createdByName, 'Admin');
  assert.ok(done.sentAt && done.ackedAt);

  // an answer nobody asked for is ignored
  t.reply('surprise');
  await sleep(400);
  assert.equal((await s.list()).length, 1);
  t.close();
});

test('a command for an offline tracker waits and is delivered when it connects; it can be cancelled before', async () => {
  const s = await setup('offline');
  const queued = await s.send('reboot');
  assert.equal(queued.status, 201);
  assert.equal(queued.body.data.status, 'queued');
  const cancelled = await s.send('locate');
  const res = await api('POST', `/devices/${s.id}/commands/${cancelled.body.data._id}/cancel`, { token: s.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'cancelled');

  const t = await teltonika(s.imei);
  assert.equal(await t.command(), 'cpureset');
  assert.equal(await t.noCommandWithin(500), true, 'the cancelled command is never sent');
  assert.equal((await api('POST', `/devices/${s.id}/commands/${queued.body.data._id}/cancel`, { token: s.token })).status, 409); // already sent
  t.reply('Device will reboot');
  await s.waitStatus(queued.body.data._id, 'acknowledged');
  t.close();
});

test('commands that were not sent in time expire; commands the tracker never answers become unconfirmed', async () => {
  const s = await setup('timeouts');
  const waiting = await s.send('locate');
  await s.waitStatus(waiting.body.data._id, 'expired', 8000);
  assert.match((await s.list())[0].error, /did not connect/);

  const t = await teltonika(s.imei);
  const silent = await s.send('locate');
  assert.equal(await t.command(), 'getgps');
  await s.waitStatus(silent.body.data._id, 'unconfirmed', 6000);
  // the next command can be sent again
  const next = await s.send('locate');
  assert.equal(await t.command(), 'getgps');
  t.reply('ok');
  await s.waitStatus(next.body.data._id, 'acknowledged');
  t.close();
});

test('engine commands: admin only, switched on per device, confirmed by the registration number', async () => {
  const s = await setup('engine');
  const t = await teltonika(s.imei);
  await t.position(47.9, 106.9, 0);

  // not enabled for the device yet
  const off = await s.send('engine_stop', { confirmRegistration: s.plate });
  assert.equal(off.status, 409);
  assert.match(off.body.message, /not enabled/);
  // only an administrator switches it on
  assert.equal((await api('PUT', `/devices/${s.id}`, { token: s.managerToken, body: { immobilizer: true } })).status, 403);
  assert.equal((await api('PUT', `/devices/${s.id}`, { token: s.token, body: { immobilizer: true } })).body.data.immobilizer, true);

  // managers may send harmless commands but not engine commands; drivers nothing
  assert.equal((await s.send('engine_stop', { confirmRegistration: s.plate }, s.managerToken)).status, 403);
  assert.equal((await s.send('locate', {}, s.driverToken)).status, 403);
  assert.equal((await s.send('locate', {}, s.managerToken)).status, 201);
  assert.equal(await t.command(), 'getgps');
  t.reply('ok');

  // confirmation
  assert.equal((await s.send('engine_stop')).status, 400);
  assert.equal((await s.send('engine_stop', { confirmRegistration: 'WRONG 1' })).status, 400);

  // stop: needs the registration number (case and spacing do not matter)
  const stop = await s.send('engine_stop', { confirmRegistration: `  ${s.plate.toLowerCase()} ` });
  assert.equal(stop.status, 201, JSON.stringify(stop.body));
  assert.equal(await t.command(), 'setdigout 1');
  // a second engine command while one is pending
  assert.equal((await s.send('engine_resume', { confirmRegistration: s.plate })).status, 409);
  t.reply('DOUT1:1 Timeout:0');
  await s.waitStatus(stop.body.data._id, 'acknowledged');

  const resume = await s.send('engine_resume', { confirmRegistration: s.plate });
  assert.equal(resume.status, 201);
  assert.equal(await t.command(), 'setdigout 0');
  t.reply('DOUT1:0');
  await s.waitStatus(resume.body.data._id, 'acknowledged');
  t.close();
});

test('engine_stop is refused unless the vehicle is known to stand still; resuming is always allowed', async () => {
  const s = await setup('safety', { immobilizer: true });
  // no position at all
  const unknown = await s.send('engine_stop', { confirmRegistration: s.plate });
  assert.equal(unknown.status, 409);
  assert.match(unknown.body.message, /too old to know/);

  const t = await teltonika(s.imei);
  await t.position(47.9, 106.9, 62);
  const moving = await s.send('engine_stop', { confirmRegistration: s.plate });
  assert.equal(moving.status, 409);
  assert.match(moving.body.message, /vehicle is moving/);

  // resuming a stopped engine never depends on the speed
  const resume = await s.send('engine_resume', { confirmRegistration: s.plate });
  assert.equal(resume.status, 201);
  assert.equal(await t.command(), 'setdigout 0');
  t.reply('DOUT1:0');
  await s.waitStatus(resume.body.data._id, 'acknowledged');

  await t.position(47.9, 106.9, 0);
  assert.equal((await s.send('engine_stop', { confirmRegistration: s.plate })).status, 201);
  assert.equal(await t.command(), 'setdigout 1');
  t.close();
});

test('an engine_stop that waited is checked again when it is due: a vehicle that started moving is not stopped', async () => {
  const s = await setup('recheck', { immobilizer: true });
  const t = await teltonika(s.imei);
  await t.position(47.9, 106.9, 0);

  // a harmless command is still waiting for its answer, so the engine command has to wait behind it
  const locate = await s.send('locate');
  assert.equal(await t.command(), 'getgps');
  const stop = await s.send('engine_stop', { confirmRegistration: s.plate });
  assert.equal(stop.status, 201);
  assert.equal(stop.body.data.status, 'queued');

  await t.position(47.95, 106.95, 70); // the vehicle drives off
  t.reply('ok');
  await s.waitStatus(locate.body.data._id, 'acknowledged');
  await s.waitStatus(stop.body.data._id, 'failed');
  const failed = (await s.list()).find((c) => c._id === stop.body.data._id);
  assert.match(failed.error, /^Not sent: the vehicle was moving/);
  assert.equal(await t.noCommandWithin(500), true, 'nothing was sent to the tracker');
  t.close();
});

test('GT06 trackers: command frame, answer matched by its flag', async () => {
  const s = await setup('gt06', { protocol: 'gt06', immobilizer: true });
  const t = await gt06(s.imei);
  await t.position(47.9, 106.9, 0);
  await waitFor(async () => ((await api('GET', '/tracking/live', { token: s.token })).body.data || []).length > 0, 'position');

  const locate = await s.send('locate');
  assert.equal(locate.status, 201, JSON.stringify(locate.body));
  const frame = await t.command();
  assert.equal(frame.text, 'WHERE#');
  // an answer with a different flag belongs to something else
  t.reply('Lat:1', (frame.flag + 1) >>> 0);
  await sleep(400);
  assert.equal(await s.status(locate.body.data._id), 'sent');
  t.reply('Lat:47.9,Lon:106.9', frame.flag);
  await s.waitStatus(locate.body.data._id, 'acknowledged');

  const stop = await s.send('engine_stop', { confirmRegistration: s.plate });
  assert.equal(stop.status, 201, JSON.stringify(stop.body));
  const stopFrame = await t.command();
  assert.equal(stopFrame.text, 'RELAY,1#');
  t.reply('RELAY:ON', stopFrame.flag);
  await s.waitStatus(stop.body.data._id, 'acknowledged');
  t.close();
});

test('other protocols: OsmAnd cannot receive commands; Traccar devices go through the Traccar API', async () => {
  const osmand = await setup('osmand', { protocol: 'osmand' });
  const res = await osmand.send('locate');
  assert.equal(res.status, 400);
  assert.match(res.body.message, /cannot receive commands/);

  const tc = await setup('traccar', { protocol: 'traccar', immobilizer: true });
  const locate = await tc.send('locate');
  assert.equal(locate.status, 201, JSON.stringify(locate.body));
  await tc.waitStatus(locate.body.data._id, 'sent');
  assert.deepEqual(traccarCalls.at(-1), { deviceId: 77, type: 'positionSingle', attributes: {} });

  traccarDown = true;
  const failing = await tc.send('reboot');
  await tc.waitStatus(failing.body.data._id, 'failed');
  assert.match((await tc.list())[0].error, /Traccar/);
  traccarDown = false;

  // the engine safety rules apply to Traccar devices too (no position known)
  assert.equal((await tc.send('engine_stop', { confirmRegistration: tc.plate })).status, 409);
});

test('commands are tenant scoped and the list is for administrators and managers only', async () => {
  const a = await setup('iso-a');
  const b = await setup('iso-b');
  const sent = await a.send('locate');
  assert.equal(sent.status, 201);

  // organization B cannot send to, list, or cancel on a device of A
  const res = await api('POST', `/devices/${a.id}/commands`, { token: b.token, body: { type: 'locate' } });
  assert.equal(res.status, 404);
  assert.equal((await api('GET', `/devices/${a.id}/commands`, { token: b.token })).status, 404);
  assert.equal((await api('POST', `/devices/${a.id}/commands/${sent.body.data._id}/cancel`, { token: b.token })).status, 404);
  assert.equal((await api('PUT', `/devices/${a.id}`, { token: b.token, body: { immobilizer: true } })).status, 404);
  assert.equal((await api('GET', `/devices/${a.id}/commands`, { token: a.driverToken })).status, 403);
  assert.equal((await api('GET', '/devices/not-an-id/commands', { token: a.token })).status, 404);
  assert.equal((await b.list()).length, 0);
  assert.equal((await api('POST', `/devices/${a.id}/commands`, { token: a.token, body: { type: 'format_disk' } })).status, 400);
});
