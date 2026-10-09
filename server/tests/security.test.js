import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { rateLimit, trustProxySetting } from '../middleware/rateLimit.js';
import { dbEnv } from './dbEnv.js';

// ---------------------------------------------------------------------------------------------
// Rate limiter (unit)
// ---------------------------------------------------------------------------------------------
const mockRes = () => ({
  headers: {}, statusCode: 200, body: null, handlers: [],
  setHeader(k, v) { this.headers[k] = v; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  on(event, fn) { if (event === 'finish') this.handlers.push(fn); },
  finish(code) { this.statusCode = code; this.handlers.forEach((fn) => fn()); }
});
const hit = (limiter, req = { ip: '1.1.1.1' }) => {
  const res = mockRes();
  let passed = false;
  limiter(req, res, () => { passed = true; });
  return { res, passed };
};

test('rate limiter: blocks after the limit with standard headers and recovers after the window', async () => {
  process.env.RATE_LIMIT_UNIT_A_WINDOW_SEC = '0.4';
  const limiter = rateLimit({ name: 'unit_a', windowMs: 60000, max: 3 });
  for (let i = 1; i <= 3; i += 1) {
    const { res, passed } = hit(limiter);
    assert.equal(passed, true);
    assert.equal(res.headers['RateLimit-Limit'], '3');
    assert.equal(res.headers['RateLimit-Remaining'], String(3 - i));
  }
  const blocked = hit(limiter);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.equal(blocked.res.body.code, 'RATE_LIMITED');
  assert.equal(blocked.res.body.success, false);
  assert.ok(Number(blocked.res.headers['Retry-After']) >= 1);
  assert.equal(blocked.res.body.retryAfter, Number(blocked.res.headers['Retry-After']));

  assert.equal(hit(limiter, { ip: '2.2.2.2' }).passed, true); // other clients are unaffected
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(hit(limiter).passed, true); // new window
});

test('rate limiter: skipSuccess counts only failures; keys are case-insensitive; null keys are not limited', () => {
  const limiter = rateLimit({ name: 'unit_b', windowMs: 60000, max: 2, skipSuccess: true, key: (req) => req.account });
  const attempt = (status, account = 'Alice@Example.com') => {
    const { res, passed } = hit(limiter, { account });
    if (passed) res.finish(status);
    return { res, passed };
  };
  for (let i = 0; i < 5; i += 1) assert.equal(attempt(200).passed, true); // successes never add up
  assert.equal(attempt(401).passed, true);
  assert.equal(attempt(401, 'alice@example.com').passed, true); // same account, different case
  assert.equal(attempt(401).passed, false); // third failure inside the window
  assert.equal(attempt(200).passed, false); // a correct password does not bypass the lockout
  assert.equal(attempt(401, 'bob@example.com').passed, true);
  assert.equal(hit(limiter, { account: null }).passed, true);
});

test('rate limiter: can be disabled and tuned through the environment; proxy setting parsing', () => {
  process.env.RATE_LIMIT_UNIT_C_MAX = '1';
  const tuned = rateLimit({ name: 'unit_c', windowMs: 60000, max: 100 });
  assert.equal(hit(tuned).passed, true);
  assert.equal(hit(tuned).passed, false);

  process.env.RATE_LIMIT_DISABLED = 'true';
  for (let i = 0; i < 5; i += 1) assert.equal(hit(tuned).passed, true);
  delete process.env.RATE_LIMIT_DISABLED;

  assert.equal(trustProxySetting(undefined), false);
  assert.equal(trustProxySetting('2'), 2);
  assert.equal(trustProxySetting('true'), 1);
  assert.equal(trustProxySetting('false'), false);
  assert.equal(trustProxySetting('loopback'), 'loopback');
});

// ---------------------------------------------------------------------------------------------
// Email verification and limits (integration, with a mock SMTP server)
// ---------------------------------------------------------------------------------------------
const HTTP_PORT = 3300 + Math.floor(Math.random() * 90);
const SMTP_PORT = 6700 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-security-test-${process.pid}.json`);
const SUPER = { email: 'platform@security.example', password: 'platform-pass-1' };

let server;
let smtpServer;
const emails = [];

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
            else if (cmd === 'RCPT') { rcpt.push(line.replace(/^RCPT TO:\s*<?|>?\s*$/gi, '')); socket.write('250 ok\r\n'); }
            else if (cmd === 'DATA') { inData = true; socket.write('354 go\r\n'); }
            else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
            else socket.write('250 ok\r\n');
          }
        }
      });
      socket.on('error', () => {});
    });
    smtpServer.listen(SMTP_PORT, '127.0.0.1', resolve);
  });
}

const decodeQuotedPrintable = (text) =>
  text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const emailsTo = (address) => emails.filter((e) => e.to.includes(address));
const tokenFrom = (message) => decodeQuotedPrintable(message.data).match(/\?verify=([0-9a-f]{64})/)?.[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check, label, ms = 6000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${label}`);
    await sleep(80);
  }
}

async function api(method, route, { token, body, raw } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return raw ? res : { status: res.status, body: await res.json(), headers: res.headers };
}

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  await startSmtp();
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: '0', GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
      ADMIN_EMAIL: SUPER.email, ADMIN_PASSWORD: SUPER.password,
      SMTP_HOST: '127.0.0.1', SMTP_PORT: String(SMTP_PORT), EMAIL_FROM: 'CLIXGPS <no-reply@test.example>',
      APP_BASE_URL: 'https://fleet.example.com',
      EMAIL_VERIFICATION_TTL_MS: '3000', EMAIL_RESEND_COOLDOWN_MS: '500',
      RATE_LIMIT_LOGIN_MAX: '3', RATE_LIMIT_REGISTER_MAX: '14', RATE_LIMIT_API_MAX: '100000'
    },
    stdio: 'ignore'
  });
  await waitFor(async () => { try { return (await fetch(`${BASE}/health`)).ok; } catch { return false; } }, 'server', 15000);
});

after(() => {
  server?.kill();
  smtpServer?.close();
  fs.rmSync(DATA_FILE, { force: true });
});

const register = (org, email, extra = {}) =>
  api('POST', '/auth/register', { body: { organizationName: org, name: 'Admin', email, password: 'password123', lang: 'en', ...extra } });
const login = (email, password = 'password123') => api('POST', '/auth/login', { body: { email, password } });

test('sign-up requires confirming the email address before the first login', async () => {
  const res = await register('Verify Co', 'a@verify.example');
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.verificationRequired, true);
  assert.equal(res.body.data.token, undefined); // no session until confirmed
  assert.equal(res.body.data.emailVerified, false);

  const mail = await waitFor(() => emailsTo('a@verify.example')[0], 'verification email');
  assert.match(mail.data, /^Subject: \[CLIXGPS\] Confirm your email address/m);
  const decoded = decodeQuotedPrintable(mail.data);
  assert.match(decoded, /https:\/\/fleet\.example\.com\/\?verify=[0-9a-f]{64}/);
  assert.match(decoded, /Hello Admin,/);
  const token = tokenFrom(mail);

  // before confirming: correct password is refused with a specific code, a wrong password is just wrong
  const blocked = await login('a@verify.example');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
  assert.equal((await login('a@verify.example', 'wrong-password')).status, 401);

  assert.equal((await api('POST', '/auth/verify-email', { body: { token: 'f'.repeat(64) } })).status, 400);
  assert.equal((await api('POST', '/auth/verify-email', { body: { token: 'short' } })).status, 400);
  assert.equal((await api('POST', '/auth/verify-email', { body: {} })).status, 400);

  const ok = await api('POST', '/auth/verify-email', { body: { token } });
  assert.equal(ok.status, 200);
  const session = await login('a@verify.example');
  assert.equal(session.status, 200);
  assert.equal(session.body.data.emailVerified, true);
  assert.ok(session.body.data.token);

  // the link works only once
  assert.equal((await api('POST', '/auth/verify-email', { body: { token } })).status, 400);
});

test('confirmation links expire and a new link can be requested', async () => {
  await register('Expire Co', 'a@expire.example');
  const first = tokenFrom(await waitFor(() => emailsTo('a@expire.example')[0], 'first email'));
  await sleep(3300); // the test server uses a 3 second lifetime
  const expired = await api('POST', '/auth/verify-email', { body: { token: first } });
  assert.equal(expired.status, 400);
  assert.equal(expired.body.code, 'INVALID_TOKEN');

  const resend = await api('POST', '/auth/resend-verification', { body: { email: 'a@expire.example' } });
  assert.equal(resend.status, 200);
  const second = tokenFrom(await waitFor(() => emailsTo('a@expire.example')[1], 'second email'));
  assert.notEqual(second, first);
  assert.equal((await api('POST', '/auth/verify-email', { body: { token: second } })).status, 200);
});

test('resending: same answer for everyone, cool-down, and a new link invalidates the old one', async () => {
  await register('Resend Co', 'a@resend.example');
  const first = tokenFrom(await waitFor(() => emailsTo('a@resend.example')[0], 'first email'));
  const verified = await register('Done Co', 'a@done.example');
  assert.equal(verified.status, 201);
  const doneToken = tokenFrom(await waitFor(() => emailsTo('a@done.example')[0], 'email'));
  await api('POST', '/auth/verify-email', { body: { token: doneToken } });

  const answers = [];
  for (const email of ['nobody@resend.example', 'a@done.example', 'a@resend.example']) {
    answers.push((await api('POST', '/auth/resend-verification', { body: { email } })).body);
  }
  assert.ok(answers.every((a) => JSON.stringify(a) === JSON.stringify(answers[0]))); // no way to tell them apart

  await sleep(500);
  assert.equal(emailsTo('nobody@resend.example').length, 0);
  assert.equal(emailsTo('a@done.example').length, 1); // already confirmed: nothing sent
  // inside the cool-down window (the address was just sent a first email) no second one is sent
  assert.equal(emailsTo('a@resend.example').length, 1);

  await sleep(600); // cool-down over
  await api('POST', '/auth/resend-verification', { body: { email: 'a@resend.example' } });
  const second = tokenFrom(await waitFor(() => emailsTo('a@resend.example')[1], 'second email'));
  assert.notEqual(second, first);
  assert.equal((await api('POST', '/auth/verify-email', { body: { token: first } })).status, 400); // old link is dead
  assert.equal((await api('POST', '/auth/verify-email', { body: { token: second } })).status, 200);
});

test('invited users and platform-created organizations do not need to confirm an address', async () => {
  const owner = await register('Invite Co', 'a@invite.example');
  const token = tokenFrom(await waitFor(() => emailsTo('a@invite.example')[0], 'email'));
  await api('POST', '/auth/verify-email', { body: { token } });
  const session = (await login('a@invite.example')).body.data.token;
  assert.equal(owner.status, 201);

  const invited = await api('POST', '/auth/users', { token: session, body: { name: 'Mgr', email: 'm@invite.example', password: 'password123', role: 'fleet_manager' } });
  assert.equal(invited.status, 201);
  assert.equal(invited.body.data.emailVerified, true);
  assert.equal((await login('m@invite.example')).status, 200);

  const platform = (await login(SUPER.email, SUPER.password)).body.data.token;
  const made = await api('POST', '/platform/organizations', {
    token: platform,
    body: { organizationName: 'Sold Co', plan: 'basic', adminName: 'Boss', adminEmail: 'boss@sold.example', adminPassword: 'password123' }
  });
  assert.equal(made.status, 201);
  assert.equal((await login('boss@sold.example')).status, 200);
  assert.equal(emailsTo('boss@sold.example').length, 0);
});

test('login brute-force protection counts failures only and locks the account+address pair', async () => {
  // a confirmed account
  await register('Brute Co', 'a@brute.example');
  await api('POST', '/auth/verify-email', { body: { token: tokenFrom(await waitFor(() => emailsTo('a@brute.example')[0], 'email')) } });

  // successful logins never add up
  for (let i = 0; i < 6; i += 1) assert.equal((await login('a@brute.example')).status, 200);

  for (let i = 0; i < 3; i += 1) assert.equal((await login('a@brute.example', 'nope-nope')).status, 401);
  const locked = await login('a@brute.example', 'nope-nope');
  assert.equal(locked.status, 429);
  assert.equal(locked.body.code, 'RATE_LIMITED');
  assert.ok(locked.body.retryAfter >= 1);
  assert.ok(Number(locked.headers.get('retry-after')) >= 1);
  assert.equal(locked.headers.get('ratelimit-limit'), '3');
  // the right password does not get through during the lockout...
  assert.equal((await login('a@brute.example')).status, 429);
  // ...while other accounts are not affected
  assert.equal((await login('a@verify.example')).status, 200);
});

test('password reset, resend and sign-up are rate limited', async () => {
  // forgot-password: 5 per hour per address+IP
  for (let i = 0; i < 5; i += 1) assert.equal((await api('POST', '/auth/forgot-password', { body: { email: 'x@limits.example' } })).status, 200);
  assert.equal((await api('POST', '/auth/forgot-password', { body: { email: 'x@limits.example' } })).status, 429);
  assert.equal((await api('POST', '/auth/forgot-password', { body: { email: 'y@limits.example' } })).status, 200);

  // resend: 3 per hour per address
  for (let i = 0; i < 3; i += 1) assert.equal((await api('POST', '/auth/resend-verification', { body: { email: 'z@limits.example' } })).status, 200);
  const blocked = await api('POST', '/auth/resend-verification', { body: { email: 'z@limits.example' } });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'RATE_LIMITED');

  // sign-up: the limit applies to every attempt, valid or not, so it cannot be used to mass-create organizations
  let limited = null;
  for (let i = 0; i < 20 && !limited; i += 1) {
    const res = await register(`Flood ${i}`, `flood${i}@limits.example`, { password: 'x' }); // invalid on purpose
    if (res.status === 429) limited = res;
  }
  assert.ok(limited, 'sign-up was never rate limited');
  assert.match(limited.body.message, /Too many sign-ups/);
  // the public organization endpoint has its own, higher limit and the rest of the API keeps working
  assert.equal((await api('GET', '/public/organizations/verify')).status, 200);
  assert.equal((await api('GET', '/health')).status, 200);
});
