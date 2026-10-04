import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { encodeAvlPacket, encodeLogin } from '../gps/protocols/teltonika.js';
import { normalizePhone } from '../notify/phone.js';

const HTTP_PORT = 3600 + Math.floor(Math.random() * 90);
const TCP_PORT = 5900 + Math.floor(Math.random() * 90);
const SMS_PORT = 6100 + Math.floor(Math.random() * 90);
const SMTP_PORT = 6200 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-delivery-test-${process.pid}.json`);
const UNIT_DATA_FILE = path.join(os.tmpdir(), `fleetnova-delivery-unit-${process.pid}.json`);

let server;
let smsServer;
let smtpServer;
const sms = []; // received SMS requests
const emails = []; // received emails { to: [..], data }
let smsBehavior = () => 200; // (attempt number for this message) => status code

// ---- mock SMS gateway (HTTP) ----
const smsAttempts = new Map();
function startSmsGateway() {
  return new Promise((resolve) => {
    smsServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const body = JSON.parse(raw);
        const attempt = (smsAttempts.get(body.text) || 0) + 1;
        smsAttempts.set(body.text, attempt);
        const status = smsBehavior(attempt, body);
        if (status < 300) sms.push({ ...body, auth: req.headers.authorization });
        res.writeHead(status).end(status < 300 ? 'ok' : 'nope');
      });
    });
    smsServer.listen(SMS_PORT, '127.0.0.1', resolve);
  });
}

// ---- mock SMTP server ----
function startSmtp() {
  return new Promise((resolve) => {
    smtpServer = net.createServer((socket) => {
      let inData = false;
      let buffer = '';
      let rcpt = [];
      socket.write('220 mock ESMTP\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        for (;;) {
          if (inData) {
            const end = buffer.indexOf('\r\n.\r\n');
            if (end === -1) return;
            emails.push({ to: rcpt, data: buffer.slice(0, end) });
            buffer = buffer.slice(end + 5);
            inData = false;
            rcpt = [];
            socket.write('250 queued\r\n');
          } else {
            const nl = buffer.indexOf('\r\n');
            if (nl === -1) return;
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 2);
            const cmd = line.slice(0, 4).toUpperCase();
            if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250-mock\r\n250 8BITMIME\r\n');
            else if (cmd === 'MAIL') socket.write('250 ok\r\n');
            else if (cmd === 'RCPT') {
              if (line.includes('reject')) socket.write('550 no such user\r\n');
              else { rcpt.push(line.replace(/^RCPT TO:\s*<?|>?\s*$/gi, '')); socket.write('250 ok\r\n'); }
            } else if (cmd === 'DATA') { inData = true; socket.write('354 go\r\n'); }
            else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); } else socket.write('250 ok\r\n');
          }
        }
      });
      socket.on('error', () => {});
    });
    smtpServer.listen(SMTP_PORT, '127.0.0.1', resolve);
  });
}

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
}

async function waitFor(check, label, ms = 8000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
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

let clock = 0;
const fix = (lat, lng, speed) => ({
  timestamp: new Date(Date.now() - 60 * 1000 + (clock += 1000)),
  lat, lng, altitude: 1300, heading: 0, satellites: 9, speed, io: {}
});
let imeiCounter = 0;
const nextImei = () => `35630704266${String(1000 + imeiCounter++)}`;
let userCounter = 0;

const signUp = async (org, email, phone = '') => {
  const res = await api('POST', '/auth/register', { body: { organizationName: org, name: `${org} admin`, email, password: 'password123', phone } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

// org + vehicle + tracker; admin has a phone number
async function setup(name, { language = 'en' } = {}) {
  const slug = name.toLowerCase().replace(/\W/g, '');
  const org = await signUp(name, `admin@${slug}.example`, '+97699112233');
  const v = await api('POST', '/vehicles', { token: org.token, body: { registrationNumber: `${slug.slice(0, 3).toUpperCase()} 1`, vehicleType: 'Truck', brand: 'T', model: 'T1', fuelType: 'Diesel' } });
  const imei = nextImei();
  await api('POST', '/devices', { token: org.token, body: { name: 'T', imei, vehicle: v.body.data._id } });
  const t = tracker();
  assert.equal(await t.login(imei), 1);
  await api('PUT', '/organization', { token: org.token, body: { settings: { speedLimitKmh: 90, delivery: { email: true, sms: true, types: ['speeding'], language } } } });
  return { org, t, slug };
}

const addUser = async (org, slug, { role = 'fleet_manager', phone = '' } = {}) => {
  userCounter += 1;
  const res = await api('POST', '/auth/users', { token: org.token, body: { name: `User ${userCounter}`, email: `u${userCounter}@${slug}.example`, password: 'password123', role, phone } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

const setChannels = (org, userId, channels) => api('PUT', `/auth/users/${userId}/alert-channels`, { token: org.token, body: channels });
const log = async (org) => (await api('GET', '/delivery/log?limit=100', { token: org.token })).body.data;

// Two consecutive over-limit reports = one speeding alert
const speed = (t) => t.send([fix(47.9, 106.9, 120), fix(47.91, 106.9, 125)]);

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  await startSmsGateway();
  await startSmtp();
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: String(TCP_PORT), GPS_TCP_HOST: '127.0.0.1', JWT_SECRET: 'test-secret', FLEETNOVA_DATA_FILE: DATA_FILE,
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), EMAIL_FROM: 'FLEETNOVA <alerts@test.example>',
      SMS_PROVIDER: 'http', SMS_HTTP_URL: `http://127.0.0.1:${SMS_PORT}/send`, SMS_HTTP_TOKEN: 'gateway-token',
      DELIVERY_POLL_MS: '200', DELIVERY_RETRY_DELAYS_MS: '100,100,100'
    },
    stdio: 'ignore'
  });
  await waitFor(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, 'server', 15000);
});

after(async () => {
  server?.kill();
  smsServer?.close();
  smtpServer?.close();
  fs.rmSync(DATA_FILE, { force: true });
  fs.rmSync(UNIT_DATA_FILE, { force: true });
});

test('phone numbers are normalized to E.164', () => {
  assert.equal(normalizePhone('9911 2233'), '+97699112233');
  assert.equal(normalizePhone('+976 9911-2233'), '+97699112233');
  assert.equal(normalizePhone('0097699112233'), '+97699112233');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), null);
});

test('delivery settings are validated and admin-only', async () => {
  const org = await signUp('Settings Co', 'a@settingsco.example');
  const bad = (delivery) => api('PUT', '/organization', { token: org.token, body: { settings: { delivery } } });
  assert.equal((await bad({ types: ['everything'] })).status, 400);
  assert.equal((await bad({ language: 'fr' })).status, 400);
  const ok = await bad({ email: true, types: ['speeding', 'geofence_exit'], language: 'en' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data.settings.delivery, { email: true, sms: false, types: ['speeding', 'geofence_exit'], language: 'en' });
  // the speed limit survives a delivery update and vice versa
  await api('PUT', '/organization', { token: org.token, body: { settings: { speedLimitKmh: 70 } } });
  const me = await api('GET', '/organization', { token: org.token });
  assert.equal(me.body.data.settings.speedLimitKmh, 70);
  assert.equal(me.body.data.settings.delivery.email, true);

  const mgr = await addUser(org, 'settingsco');
  const mgrLogin = await api('POST', '/auth/login', { body: { email: mgr.email, password: 'password123' } });
  assert.equal((await api('GET', '/delivery/config', { token: mgrLogin.body.data.token })).status, 403);
  assert.equal((await api('GET', '/delivery/config', { token: org.token })).status, 200);
});

test('a speeding alert is emailed and texted to the users who opted in (and only them)', async () => {
  const { org, t, slug } = await setup('Alert Flow');
  const admin = (await api('GET', '/auth/users', { token: org.token })).body.data[0];
  const manager = await addUser(org, slug, { phone: '99001122' });
  const driver = await addUser(org, slug, { role: 'driver' }); // never opts in
  assert.equal((await setChannels(org, admin._id, { email: true, sms: true })).status, 200);
  assert.equal((await setChannels(org, manager._id, { email: true })).status, 200);

  // another organization with its own opted-in user must not receive anything
  const other = await setup('Other Flow');
  const otherAdmin = (await api('GET', '/auth/users', { token: other.org.token })).body.data[0];
  await setChannels(other.org, otherAdmin._id, { email: true, sms: true });

  const emailsBefore = emails.length;
  const smsBefore = sms.length;
  assert.equal(await speed(t), 2);

  await waitFor(() => emails.length >= emailsBefore + 2 && sms.length >= smsBefore + 1, 'deliveries');
  await new Promise((r) => setTimeout(r, 400)); // make sure nothing extra arrives

  const newEmails = emails.slice(emailsBefore);
  const newSms = sms.slice(smsBefore);
  assert.equal(newEmails.length, 2);
  assert.equal(newSms.length, 1);
  assert.deepEqual(newEmails.flatMap((e) => e.to).sort(), [admin.email, manager.email].sort());
  assert.ok(newEmails.every((e) => /^Subject: \[FLEETNOVA\] Speed limit exceeded: /m.test(e.data)));
  assert.match(newEmails[0].data, /travelling at 125 km\/h \(limit 90 km\/h\)/);
  assert.match(newEmails[0].data, /openstreetmap\.org/);
  assert.match(newEmails[0].data, /Alert Flow/);

  assert.equal(newSms[0].to, '+97699112233');
  assert.equal(newSms[0].auth, 'Bearer gateway-token');
  assert.match(newSms[0].text, /travelling at 125 km\/h \(limit 90 km\/h\)/);
  assert.ok(newSms[0].text.length <= 300);

  const entries = await log(org);
  assert.equal(entries.length, 3);
  assert.ok(entries.every((e) => e.status === 'sent' && e.attempts === 1));
  assert.ok(entries.every((e) => !e.to.includes(admin.email) && !e.to.includes('99112233'))); // masked
  assert.equal((await log(other.org)).length, 0);
  assert.equal(driver.alertChannels.email, false);

  const config = await api('GET', '/delivery/config', { token: org.token });
  assert.equal(config.body.data.usage.email, 2);
  assert.equal(config.body.data.usage.sms, 1);
  assert.equal(config.body.data.limits.smsPerDay, 20); // trial plan
  t.close();
  other.t.close();
});

test('alerts are delivered in the organization language', async () => {
  const { org, t } = await setup('Mongolian Co', { language: 'mn' });
  const admin = (await api('GET', '/auth/users', { token: org.token })).body.data[0];
  await setChannels(org, admin._id, { sms: true });
  const before = sms.length;
  assert.equal(await speed(t), 2);
  await waitFor(() => sms.length > before, 'sms');
  assert.match(sms[sms.length - 1].text, /125 км\/ц хурдтай явж байна \(хязгаар 90 км\/ц\)/);
  t.close();
});

test('alert types that are not enabled are not delivered', async () => {
  const { org, t } = await setup('Type Filter');
  const admin = (await api('GET', '/auth/users', { token: org.token })).body.data[0];
  await setChannels(org, admin._id, { email: true, sms: true });
  await api('PUT', '/organization', { token: org.token, body: { settings: { delivery: { types: ['geofence_exit'] } } } });
  const before = { e: emails.length, s: sms.length };
  assert.equal(await speed(t), 2); // speeding is no longer a delivered type
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(emails.length, before.e);
  assert.equal(sms.length, before.s);
  assert.equal((await log(org)).length, 0);
  // the in-app alert still exists
  const inApp = (await api('GET', '/notifications', { token: org.token })).body.data.filter((n) => n.type === 'speeding');
  assert.equal(inApp.length, 1);
  t.close();
});

test('failed deliveries are retried; permanent errors are not', async () => {
  const { org, t } = await setup('Retry Co');
  const admin = (await api('GET', '/auth/users', { token: org.token })).body.data[0];
  await setChannels(org, admin._id, { sms: true });

  // gateway fails twice with 503, then accepts
  smsBehavior = (attempt) => (attempt < 3 ? 503 : 200);
  assert.equal(await speed(t), 2);
  const sent = await waitFor(async () => (await log(org)).find((e) => e.status === 'sent'), 'retried delivery');
  assert.equal(sent.attempts, 3);
  assert.equal(sent.lastError, '');

  // 400 from the gateway = rejected for good: no retries
  const second = await setup('Reject Co');
  const admin2 = (await api('GET', '/auth/users', { token: second.org.token })).body.data[0];
  await setChannels(second.org, admin2._id, { sms: true });
  smsBehavior = () => 400;
  assert.equal(await speed(second.t), 2);
  const failed = await waitFor(async () => (await log(second.org)).find((e) => e.status === 'failed'), 'failed delivery');
  assert.equal(failed.attempts, 1);
  assert.match(failed.lastError, /HTTP 400/);

  smsBehavior = () => 200;
  t.close();
  second.t.close();
});

test('users without a usable phone number are skipped, not retried forever', async () => {
  const { org, t, slug } = await setup('No Phone');
  const noPhone = await addUser(org, slug, { phone: '12' });
  await setChannels(org, noPhone._id, { sms: true });
  assert.equal(await speed(t), 2);
  const skipped = await waitFor(async () => (await log(org)).find((e) => e.status === 'skipped'), 'skipped delivery');
  assert.match(skipped.lastError, /No valid phone number/);
  t.close();
});

test('test messages: verify providers from Settings', async () => {
  const org = await signUp('Test Msg Co', 'a@testmsg.example', '9911 0000');
  const smsBefore = sms.length;
  const emailsBefore = emails.length;

  assert.equal((await api('POST', '/delivery/test', { token: org.token, body: { channel: 'fax' } })).status, 400);

  const viaSms = await api('POST', '/delivery/test', { token: org.token, body: { channel: 'sms' } });
  assert.equal(viaSms.status, 200, JSON.stringify(viaSms.body));
  assert.equal(viaSms.body.data.simulated, false);
  assert.equal(sms.length, smsBefore + 1);
  assert.equal(sms[sms.length - 1].to, '+97699110000');
  // rate limited per channel
  assert.equal((await api('POST', '/delivery/test', { token: org.token, body: { channel: 'sms' } })).status, 429);

  const viaEmail = await api('POST', '/delivery/test', { token: org.token, body: { channel: 'email' } });
  assert.equal(viaEmail.status, 200);
  await waitFor(() => emails.length > emailsBefore, 'test email');
  assert.deepEqual(emails[emails.length - 1].to, ['a@testmsg.example']);

  // a gateway error is reported to the admin
  smsBehavior = () => 500;
  await new Promise((r) => setTimeout(r, 10100));
  const failed = await api('POST', '/delivery/test', { token: org.token, body: { channel: 'sms' } });
  assert.equal(failed.status, 502);
  smsBehavior = () => 200;
});

test('alert channels: validated and isolated per organization', async () => {
  const a = await signUp('Chan A', 'a@chan.example');
  const b = await signUp('Chan B', 'b@chan.example');
  const adminA = (await api('GET', '/auth/users', { token: a.token })).body.data[0];
  assert.equal((await setChannels(a, adminA._id, { email: 'yes' })).status, 400);
  assert.equal((await api('PUT', `/auth/users/${adminA._id}/alert-channels`, { token: b.token, body: { email: true } })).status, 404);
  const ok = await setChannels(a, adminA._id, { email: true });
  assert.deepEqual(ok.body.data.alertChannels, { email: true, sms: false });

  // users can also manage their own channels from their profile
  const self = await api('PUT', '/auth/profile', { token: a.token, body: { alertChannels: { sms: true } } });
  assert.equal(self.status, 200);
  assert.deepEqual(self.body.data.alertChannels, { email: true, sms: true });
});

test('daily plan limits turn deliveries into "skipped"', async () => {
  // unit-level: the dispatcher against a throw-away local store
  process.env.FLEETNOVA_DATA_FILE = UNIT_DATA_FILE;
  const { DataEngine } = await import('../models/dataEngine.js');
  const { runWithTenant } = await import('../middleware/tenantContext.js');
  const { enqueueDeliveries } = await import('../notify/dispatcher.js');
  const { flushLocalStore } = await import('../config/db.js');

  const org = await DataEngine.create('organizations', {
    name: 'Cap Co', slug: 'cap-co', status: 'active', plan: 'trial',
    settings: { speedLimitKmh: 90, delivery: { email: false, sms: true, types: ['speeding'], language: 'en' } }
  });
  const orgId = String(org._id);
  await runWithTenant({ orgId }, async () => {
    for (let i = 0; i < 25; i += 1) {
      await DataEngine.create('users', {
        name: `U${i}`, email: `u${i}@cap.example`, password: 'x', role: 'driver', phone: `9911${String(1000 + i)}`, status: 'active',
        alertChannels: { email: false, sms: true }
      });
    }
    const notification = { _id: 'n1', type: 'speeding', titleKey: 'Speed limit exceeded', messageKey: '{vehicle} is travelling at {speed} km/h (limit {limit} km/h).', params: { vehicle: 'X', speed: 100, limit: 90 }, createdAt: new Date().toISOString() };
    const created = await enqueueDeliveries({ org, notification });
    assert.equal(created.length, 25);
    assert.equal(created.filter((d) => d.status === 'queued').length, 20); // trial plan: 20 SMS / 24h
    assert.equal(created.filter((d) => d.status === 'skipped').length, 5);
    assert.ok(created.filter((d) => d.status === 'skipped').every((d) => /limit/i.test(d.lastError)));

    // a second alert in the same window: everything is over the limit
    const again = await enqueueDeliveries({ org, notification: { ...notification, _id: 'n2' } });
    assert.ok(again.every((d) => d.status === 'skipped'));
  });
  flushLocalStore();
});
