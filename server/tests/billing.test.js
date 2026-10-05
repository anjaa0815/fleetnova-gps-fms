import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';
import { addMonths } from '../services/billing.js';

const HTTP_PORT = 5400 + Math.floor(Math.random() * 90);
const MOCK_PORT = 5600 + Math.floor(Math.random() * 90);
const SMTP_PORT = 5800 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const API = `${BASE}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-billing-test-${process.pid}.json`);
const SUPER = { email: 'platform@billing.example', password: 'platform-pass-1' };
const DAY = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server;
let mock;
let smtp;
const emails = [];

// ---- mock QPay -----------------------------------------------------------------------------------------
const qpay = { auths: 0, invoices: [], checks: 0, paid: new Map(), rejectBearerOnce: false, authHeaders: [] };

function startMockQpay() {
  mock = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === '/v2/auth/token') {
        qpay.authHeaders.push(req.headers.authorization);
        if (req.headers.authorization !== `Basic ${Buffer.from('merchant:secret').toString('base64')}`) return send(401, { error: 'AUTHENTICATION_FAILED' });
        qpay.auths += 1;
        return send(200, { token_type: 'Bearer', access_token: `tok-${qpay.auths}`, expires_in: Math.floor(Date.now() / 1000) + 3600 });
      }
      if (!String(req.headers.authorization || '').startsWith('Bearer tok-')) return send(401, { error: 'NO_CREDENDIALS' });
      if (qpay.rejectBearerOnce) { qpay.rejectBearerOnce = false; return send(401, { error: 'TOKEN_EXPIRED' }); }
      if (req.url === '/v2/invoice') {
        const id = `QI-${qpay.invoices.length + 1}`;
        qpay.invoices.push({ id, body });
        return send(200, {
          invoice_id: id,
          qr_text: `0002010102${id}`,
          qr_image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
          qPay_shortUrl: `https://qpay.mn/s/${id}`,
          urls: [
            { name: 'Khan Bank', description: 'Хаан банк', logo: 'https://example.com/khan.png', link: `khanbank://q?qPay_QRcode=${id}` },
            { name: 'Evil', description: 'x', logo: 'javascript:alert(1)', link: 'javascript://alert(1)' }
          ]
        });
      }
      if (req.url === '/v2/payment/check') {
        qpay.checks += 1;
        const amount = qpay.paid.get(body.object_id);
        if (!amount) return send(200, { count: 0, paid_amount: 0, rows: [] });
        return send(200, { count: 1, paid_amount: amount, rows: [{ payment_id: `PAY-${body.object_id}`, payment_status: 'PAID', payment_amount: amount }] });
      }
      return send(404, { error: 'NOT_FOUND' });
    });
  });
  return new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve));
}

function startSmtp() {
  return new Promise((resolve) => {
    smtp = net.createServer((socket) => {
      let inData = false; let buffer = ''; let rcpt = [];
      socket.write('220 mock ESMTP\r\n');
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        for (;;) {
          if (inData) {
            const end = buffer.indexOf('\r\n.\r\n');
            if (end === -1) return;
            emails.push({ to: rcpt, data: buffer.slice(0, end) });
            buffer = buffer.slice(end + 5); inData = false; rcpt = [];
            socket.write('250 queued\r\n');
          } else {
            const nl = buffer.indexOf('\r\n');
            if (nl === -1) return;
            const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 2);
            const cmd = line.slice(0, 4).toUpperCase();
            if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250-mock\r\n250 8BITMIME\r\n');
            else if (cmd === 'RCPT') { rcpt.push(line.replace(/^RCPT TO:\s*<?|>?\s*$/gi, '')); socket.write('250 ok\r\n'); }
            else if (cmd === 'DATA') { inData = true; socket.write('354 go\r\n'); }
            else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
            else socket.write('250 ok\r\n');
          }
        }
      });
      socket.on('error', () => {});
    });
    smtp.listen(SMTP_PORT, '127.0.0.1', resolve);
  });
}
// Cyrillic text is sent base64 encoded, Latin text quoted-printable
const mailText = (mail) => {
  const split = mail.data.indexOf('\r\n\r\n');
  const headers = mail.data.slice(0, split);
  const body = mail.data.slice(split + 4);
  if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  return body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
};

// ---- helpers -------------------------------------------------------------------------------------------
async function request(base, method, route, { token, body } = {}) {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* plain */ }
  return { status: res.status, body: parsed };
}
const api = (method, route, opts) => request(API, method, route, opts);

async function waitForServer(base) {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('Server did not start');
}

function startServer({ port, env, dataFile }) {
  return spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1', GPS_TCP_PORT: '0', GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: dataFile, ...dbEnv(), ...env
    },
    stdio: 'ignore'
  });
}

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  await startMockQpay();
  await startSmtp();
  server = startServer({
    port: HTTP_PORT,
    dataFile: DATA_FILE,
    env: {
      NODE_ENV: 'production', ADMIN_EMAIL: SUPER.email, ADMIN_PASSWORD: SUPER.password,
      QPAY_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/v2`, QPAY_USERNAME: 'merchant', QPAY_PASSWORD: 'secret', QPAY_INVOICE_CODE: 'TEST_INVOICE',
      APP_BASE_URL: 'https://fleet.example.com', PLAN_PRICE_BASIC: '50000', PLAN_PRICE_PRO: '200000',
      BILLING_CHECK_INTERVAL_MS: '0', BILLING_POLL_MS: '1000', BILLING_FIRST_RUN_MS: '500',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT)
    }
  });
  await waitForServer(BASE);
});

after(() => {
  server?.kill();
  mock?.close();
  smtp?.close();
  fs.rmSync(DATA_FILE, { force: true });
});

let counter = 0;
async function newOrg(label) {
  counter += 1;
  const email = `admin${counter}@${label}.billing.example`;
  const reg = await api('POST', '/auth/register', { body: { organizationName: `Bill ${label} ${counter}`, name: 'Admin', email, password: 'password123' } });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  return { token: reg.body.data.token, orgId: reg.body.data.organization._id, email };
}
const platformToken = async () => (await api('POST', '/auth/login', { body: SUPER })).body.data.token;
const invoice = async (org, plan, months) => {
  const res = await api('POST', '/billing/invoices', { token: org.token, body: { plan, months } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};
const mockInvoice = (invoiceNo) => qpay.invoices.find((i) => i.body.sender_invoice_no === invoiceNo);
const callbackPath = (inv) => new URL(mockInvoice(inv.senderInvoiceNo).body.callback_url).pathname;
const payAtQpay = (inv, amount = inv.amount) => qpay.paid.set(mockInvoice(inv.senderInvoiceNo).id, amount);
const myOrg = async (org) => (await api('GET', '/organization', { token: org.token })).body.data;
const near = (iso, expected, toleranceMs = 60000) => Math.abs(new Date(iso).getTime() - expected.getTime()) < toleranceMs;

test('calendar months: month ends are clamped, not rolled over', () => {
  const iso = (d) => d.toISOString().slice(0, 10);
  assert.equal(iso(addMonths(new Date('2026-01-31T10:00:00Z'), 1)), '2026-02-28');
  assert.equal(iso(addMonths(new Date('2028-01-31T10:00:00Z'), 1)), '2028-02-29');
  assert.equal(iso(addMonths(new Date('2026-11-15T10:00:00Z'), 3)), '2027-02-15');
  assert.equal(iso(addMonths(new Date('2026-03-31T10:00:00Z'), 12)), '2027-03-31');
});

test('billing overview: administrators only, with plans, prices and the current state', async () => {
  const org = await newOrg('overview');
  const res = await api('GET', '/billing', { token: org.token });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.mode, 'qpay');
  assert.deepEqual(res.body.data.plans.map((p) => [p.id, p.monthlyPrice]), [['basic', 50000], ['pro', 200000]]);
  assert.deepEqual(res.body.data.months, [1, 3, 6, 12]);
  assert.equal(res.body.data.current.plan, 'trial');
  assert.equal(res.body.data.current.state, 'trial');

  // a manager and the platform owner cannot open it
  const manager = await api('POST', '/auth/users', { token: org.token, body: { name: 'M', email: `m@${org.email.split('@')[1]}`, password: 'password123', role: 'fleet_manager' } });
  assert.equal(manager.status, 201, JSON.stringify(manager.body));
  const mt = (await api('POST', '/auth/login', { body: { email: manager.body.data.email, password: 'password123' } })).body.data.token;
  assert.equal((await api('GET', '/billing', { token: mt })).status, 403);
  assert.equal((await api('POST', '/billing/invoices', { token: mt, body: { plan: 'basic', months: 1 } })).status, 403);
  assert.equal((await api('GET', '/billing', { token: await platformToken() })).status, 403);
  assert.equal((await api('GET', '/billing')).status, 401);
});

test('invoice creation: validation, amount, QPay request, sanitized links, token reuse', async () => {
  const org = await newOrg('create');
  for (const body of [{ plan: 'trial', months: 1 }, { plan: 'enterprise', months: 1 }, { plan: 'gold', months: 1 }, { plan: 'basic', months: 2 }, { plan: 'basic' }, { plan: 'basic', months: -1 }]) {
    assert.equal((await api('POST', '/billing/invoices', { token: org.token, body })).status, 400, JSON.stringify(body));
  }
  const authsBefore = qpay.auths;
  const inv = await invoice(org, 'basic', 3);
  assert.equal(inv.amount, 150000); // 3 x 50 000
  assert.equal(inv.status, 'pending');
  assert.ok(inv.qrImage.startsWith('iVBOR'));
  assert.equal(inv.shortUrl.startsWith('https://qpay.mn/'), true);
  assert.deepEqual(inv.urls.map((u) => u.name), ['Khan Bank']); // the script-like link is dropped
  assert.equal(inv.callbackToken, undefined);

  const sent = mockInvoice(inv.senderInvoiceNo).body;
  assert.equal(sent.invoice_code, 'TEST_INVOICE');
  assert.equal(sent.amount, 150000);
  assert.equal(sent.invoice_receiver_code, org.orgId);
  assert.match(sent.callback_url, new RegExp(`^https://fleet\\.example\\.com/api/billing/qpay/callback/${inv._id}/[0-9a-f]{48}$`));
  assert.equal(qpay.authHeaders.at(-1), `Basic ${Buffer.from('merchant:secret').toString('base64')}`);

  // reloading the page shows the same open invoice instead of creating another one
  const again = await invoice(org, 'basic', 3);
  assert.equal(again._id, inv._id);
  const other = await invoice(org, 'pro', 1);
  assert.equal(other.amount, 200000);
  assert.notEqual(other._id, inv._id);

  // the access token is reused for later calls, and a token QPay rejects early is replaced once
  assert.equal(qpay.auths, authsBefore + 1);
  qpay.rejectBearerOnce = true;
  await invoice(org, 'pro', 6);
  assert.equal(qpay.auths, authsBefore + 2);
});

test('paying: polling settles the invoice, the plan starts, a receipt is e-mailed, tenants stay apart', async () => {
  const org = await newOrg('pay');
  const other = await newOrg('payother');
  const inv = await invoice(org, 'basic', 3);

  let current = (await api('GET', `/billing/invoices/${inv._id}`, { token: org.token })).body.data;
  assert.equal(current.status, 'pending');
  assert.equal((await myOrg(org)).plan, 'trial');

  payAtQpay(inv);
  current = (await api('GET', `/billing/invoices/${inv._id}`, { token: org.token })).body.data;
  assert.equal(current.status, 'paid');
  assert.equal(current.applied, true);
  assert.ok(current.paidAt);

  const mine = await myOrg(org);
  assert.equal(mine.plan, 'basic');
  assert.equal(mine.trialEndsAt, null);
  assert.ok(near(mine.planExpiresAt, addMonths(new Date(), 3)), mine.planExpiresAt);
  const overview = (await api('GET', '/billing', { token: org.token })).body.data;
  assert.equal(overview.current.state, 'active');
  assert.equal(overview.invoices[0].status, 'paid');

  // polling again changes nothing
  const expiry = mine.planExpiresAt;
  await api('GET', `/billing/invoices/${inv._id}`, { token: org.token });
  assert.equal((await myOrg(org)).planExpiresAt, expiry);

  // receipt mail
  const start = Date.now();
  while (!emails.some((m) => mailText(m).includes(inv.senderInvoiceNo)) && Date.now() - start < 5000) await sleep(100);
  const receipt = emails.find((m) => mailText(m).includes(inv.senderInvoiceNo));
  assert.ok(receipt, 'no receipt e-mail');
  assert.ok(receipt.to.includes(org.email));
  assert.equal(emails.filter((m) => mailText(m).includes(inv.senderInvoiceNo)).length, 1);

  // another organization can neither see nor cancel it
  assert.equal((await api('GET', `/billing/invoices/${inv._id}`, { token: other.token })).status, 404);
  assert.equal((await api('POST', `/billing/invoices/${inv._id}/cancel`, { token: other.token })).status, 404);
  assert.equal((await api('GET', '/billing/invoices/not-an-id', { token: other.token })).status, 404);
  assert.equal((await api('GET', '/billing', { token: other.token })).body.data.invoices.length, 0);
});

test('the QPay callback: needs the token, never trusts the request, settles only what QPay confirms, once', async () => {
  const org = await newOrg('callback');
  const inv = await invoice(org, 'basic', 1);
  const path = callbackPath(inv);
  const token = path.split('/').pop();

  assert.equal((await fetch(`${BASE}${path.replace(token, '0'.repeat(48))}`)).status, 404);
  assert.equal((await fetch(`${BASE}${path.replace(inv._id, 'f'.repeat(24))}`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/billing/qpay/callback/zzz/${token}`)).status, 404);

  // a callback that claims a payment QPay does not know about changes nothing
  const forged = await fetch(`${BASE}${path}?qpay_payment_id=FAKE-1&payment_status=PAID`);
  assert.equal(forged.status, 200);
  assert.equal((await api('GET', '/billing', { token: org.token })).body.data.invoices[0].status, 'pending');
  assert.equal((await myOrg(org)).plan, 'trial');

  // QPay confirms: a burst of callbacks and polls extends the plan exactly once
  payAtQpay(inv);
  const burst = await Promise.all([
    ...Array.from({ length: 5 }, () => fetch(`${BASE}${path}`).then((r) => r.status)),
    ...Array.from({ length: 5 }, () => api('GET', `/billing/invoices/${inv._id}`, { token: org.token }).then((r) => r.status))
  ]);
  assert.deepEqual([...new Set(burst)], [200]);
  const mine = await myOrg(org);
  assert.equal(mine.plan, 'basic');
  assert.ok(near(mine.planExpiresAt, addMonths(new Date(), 1)), `expected one month, got ${mine.planExpiresAt}`);
  await fetch(`${BASE}${path}`);
  assert.equal((await myOrg(org)).planExpiresAt, mine.planExpiresAt);
});

test('an underpaid invoice is not applied; a cancelled invoice stays cancelled', async () => {
  const org = await newOrg('under');
  const inv = await invoice(org, 'pro', 1);
  payAtQpay(inv, inv.amount - 1);
  const polled = (await api('GET', `/billing/invoices/${inv._id}`, { token: org.token })).body.data;
  assert.equal(polled.status, 'pending');
  assert.equal((await myOrg(org)).plan, 'trial');

  const second = await invoice(org, 'basic', 1);
  const cancelled = await api('POST', `/billing/invoices/${second._id}/cancel`, { token: org.token });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.status, 'cancelled');
  payAtQpay(second);
  assert.equal((await api('GET', `/billing/invoices/${second._id}`, { token: org.token })).body.data.status, 'cancelled');
  assert.equal((await myOrg(org)).plan, 'trial');
  // a paid invoice cannot be cancelled
  const third = await invoice(org, 'basic', 3);
  payAtQpay(third);
  await api('GET', `/billing/invoices/${third._id}`, { token: org.token });
  assert.equal((await api('POST', `/billing/invoices/${third._id}/cancel`, { token: org.token })).status, 409);
});

test('renewing continues the running period; another plan starts now', async () => {
  const org = await newOrg('renew');
  const first = await invoice(org, 'basic', 1);
  payAtQpay(first);
  await api('GET', `/billing/invoices/${first._id}`, { token: org.token });
  const firstEnd = new Date((await myOrg(org)).planExpiresAt);
  assert.ok(near(firstEnd, addMonths(new Date(), 1)));

  const renewal = await invoice(org, 'basic', 3);
  payAtQpay(renewal);
  await api('GET', `/billing/invoices/${renewal._id}`, { token: org.token });
  const renewedEnd = new Date((await myOrg(org)).planExpiresAt);
  assert.ok(near(renewedEnd, addMonths(firstEnd, 3), 1000), `renewal should continue from ${firstEnd.toISOString()}, got ${renewedEnd.toISOString()}`);

  const upgrade = await invoice(org, 'pro', 1);
  payAtQpay(upgrade);
  await api('GET', `/billing/invoices/${upgrade._id}`, { token: org.token });
  const upgraded = await myOrg(org);
  assert.equal(upgraded.plan, 'pro');
  assert.ok(near(upgraded.planExpiresAt, addMonths(new Date(), 1)), 'a different plan starts now');
});

test('an expired subscription turns read-only after the grace period, but paying always works', async () => {
  const org = await newOrg('expiry');
  const platform = await platformToken();
  const vehicle = (n) => ({ registrationNumber: `EXP ${n}`, vehicleType: 'Truck', brand: 'B', model: 'M', fuelType: 'Diesel', registrationExpiry: '2030-01-01', insuranceExpiry: '2030-01-01', fuelCapacity: 100, manufacturingYear: 2020 });
  const set = (days) => api('PUT', `/platform/organizations/${org.orgId}`, { token: platform, body: { plan: 'basic', planExpiresAt: new Date(Date.now() + days * DAY).toISOString() } });

  assert.equal((await set(5)).status, 200);
  assert.equal((await api('POST', '/vehicles', { token: org.token, body: vehicle(1) })).status, 201);
  assert.equal((await api('GET', '/billing', { token: org.token })).body.data.current.state, 'expiring');

  assert.equal((await set(-1)).status, 200); // ended yesterday: inside the 3 day grace period
  assert.equal((await api('POST', '/vehicles', { token: org.token, body: vehicle(2) })).status, 201);
  assert.equal((await api('GET', '/billing', { token: org.token })).body.data.current.state, 'grace');

  assert.equal((await set(-10)).status, 200); // grace is over
  const blocked = await api('POST', '/vehicles', { token: org.token, body: vehicle(3) });
  assert.equal(blocked.status, 402);
  assert.match(blocked.body.message, /subscription has expired/);
  assert.equal((await api('GET', '/vehicles', { token: org.token })).status, 200); // reading still works
  assert.equal((await api('GET', '/billing', { token: org.token })).body.data.current.state, 'expired');

  // paying works while read-only, and unlocks the account
  const inv = await invoice(org, 'basic', 1);
  payAtQpay(inv);
  assert.equal((await api('GET', `/billing/invoices/${inv._id}`, { token: org.token })).body.data.status, 'paid');
  assert.equal((await api('POST', '/vehicles', { token: org.token, body: vehicle(4) })).status, 201);

  // a plan assigned by the platform owner without a date never expires
  await api('PUT', `/platform/organizations/${org.orgId}`, { token: platform, body: { plan: 'pro' } });
  assert.equal((await myOrg(org)).planExpiresAt, null);
  assert.equal((await api('PUT', `/platform/organizations/${org.orgId}`, { token: platform, body: { planExpiresAt: 'not a date' } })).status, 400);
});

test('an expired trial can pay too', async () => {
  const org = await newOrg('trialpay');
  const platform = await platformToken();
  await api('PUT', `/platform/organizations/${org.orgId}`, { token: platform, body: { trialEndsAt: new Date(Date.now() - DAY).toISOString() } });
  assert.equal((await api('POST', '/vehicles', { token: org.token, body: { registrationNumber: 'X 1' } })).status, 402);
  const inv = await invoice(org, 'pro', 1);
  payAtQpay(inv);
  await api('GET', `/billing/invoices/${inv._id}`, { token: org.token });
  const mine = await myOrg(org);
  assert.equal(mine.plan, 'pro');
  assert.equal(mine.trialEndsAt, null);
});

test('the background worker settles a payment nobody was polling for', async () => {
  const org = await newOrg('worker');
  const inv = await invoice(org, 'basic', 1);
  payAtQpay(inv); // no callback, no polling page: only the worker (every second here) can notice
  const start = Date.now();
  let mine;
  do {
    await sleep(300);
    mine = await myOrg(org);
  } while (mine.plan !== 'basic' && Date.now() - start < 8000);
  assert.equal(mine.plan, 'basic');
  assert.ok(near(mine.planExpiresAt, addMonths(new Date(), 1)));
});

test('the platform owner sees every invoice with the organization name', async () => {
  const org = await newOrg('platform');
  await invoice(org, 'basic', 1);
  const platform = await platformToken();
  const list = await api('GET', '/platform/invoices', { token: platform });
  assert.equal(list.status, 200);
  const mine = list.body.data.find((i) => i.organization.startsWith('Bill platform'));
  assert.ok(mine);
  assert.equal(mine.qrImage, undefined);
  assert.equal((await api('GET', '/platform/invoices', { token: org.token })).status, 403);
});

// ---- modes without QPay credentials ----------------------------------------------------------------------
test('without QPay credentials: simulated outside production, disabled in production', async () => {
  const devPort = HTTP_PORT + 200;
  const prodPort = HTTP_PORT + 201;
  const devFile = `${DATA_FILE}.dev`;
  const prodFile = `${DATA_FILE}.prod`;
  fs.rmSync(devFile, { force: true });
  fs.rmSync(prodFile, { force: true });
  const common = { QPAY_USERNAME: '', QPAY_PASSWORD: '', QPAY_INVOICE_CODE: '', PLAN_PRICE_BASIC: '50000' };
  const exposedPort = HTTP_PORT + 202;
  const exposedFile = `${DATA_FILE}.exposed`;
  fs.rmSync(exposedFile, { force: true });
  // a server that forgot NODE_ENV=production but listens on all interfaces must not offer the free "mark as paid"
  const exposed = startServer({ port: exposedPort, dataFile: exposedFile, env: { NODE_ENV: '', HOST: '0.0.0.0', ...common } });
  const dev = startServer({ port: devPort, dataFile: devFile, env: { NODE_ENV: 'development', ...common } });
  const prod = startServer({ port: prodPort, dataFile: prodFile, env: { NODE_ENV: 'production', ADMIN_EMAIL: SUPER.email, ADMIN_PASSWORD: SUPER.password, ...common } });
  try {
    await waitForServer(`http://127.0.0.1:${exposedPort}`);
    const exposedApi = (m, r, o) => request(`http://127.0.0.1:${exposedPort}/api`, m, r, o);
    const exposedLogin = await exposedApi('POST', '/auth/login', { body: { email: 'admin@fleetnova.com', password: 'admin123' } });
    const exposedToken = exposedLogin.body.data.token;
    assert.equal((await exposedApi('GET', '/billing', { token: exposedToken })).body.data.mode, 'disabled');
    assert.equal((await exposedApi('POST', '/billing/invoices', { token: exposedToken, body: { plan: 'basic', months: 1 } })).status, 503);
    exposed.kill();
    await waitForServer(`http://127.0.0.1:${devPort}`);
    await waitForServer(`http://127.0.0.1:${prodPort}`);
    const devApi = (m, r, o) => request(`http://127.0.0.1:${devPort}/api`, m, r, o);
    const prodApi = (m, r, o) => request(`http://127.0.0.1:${prodPort}/api`, m, r, o);

    const login = await devApi('POST', '/auth/login', { body: { email: 'admin@fleetnova.com', password: 'admin123' } });
    const token = login.body.data.token;
    assert.equal((await devApi('GET', '/billing', { token })).body.data.mode, 'simulated');
    const created = await devApi('POST', '/billing/invoices', { token, body: { plan: 'basic', months: 1 } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.provider, 'simulated');
    const paid = await devApi('POST', `/billing/invoices/${created.body.data._id}/simulate-pay`, { token });
    assert.equal(paid.body.data.status, 'paid');
    assert.equal((await devApi('GET', '/organization', { token })).body.data.plan, 'basic');

    const reg = await prodApi('POST', '/auth/register', { body: { organizationName: 'Prod No Qpay', name: 'A', email: 'a@prodnoqpay.example', password: 'password123' } });
    const ptoken = reg.body.data.token;
    assert.equal((await prodApi('GET', '/billing', { token: ptoken })).body.data.mode, 'disabled');
    assert.equal((await prodApi('POST', '/billing/invoices', { token: ptoken, body: { plan: 'basic', months: 1 } })).status, 503);
    // the pay-without-paying shortcut must not exist in production
    assert.equal((await prodApi('POST', `/billing/invoices/${'a'.repeat(24)}/simulate-pay`, { token: ptoken })).status, 404);
  } finally {
    exposed.kill();
    dev.kill();
    prod.kill();
    fs.rmSync(devFile, { force: true });
    fs.rmSync(prodFile, { force: true });
    fs.rmSync(exposedFile, { force: true });
  }
});
