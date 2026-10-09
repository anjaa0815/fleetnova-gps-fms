import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { dbEnv } from './dbEnv.js';

const HTTP_PORT = 3200 + Math.floor(Math.random() * 90);
const SMTP_PORT = 6800 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}/api`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-reset-test-${process.pid}.json`);
const SUPER = { email: 'platform@reset.example', password: 'platform-pass-1' };

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

const decode = (text) => text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
const mailsTo = (address, subjectPart) =>
  emails.filter((e) => e.to.includes(address) && (!subjectPart || new RegExp(`^Subject: .*${subjectPart}`, 'm').test(e.data)));
const resetMails = (address) => mailsTo(address, 'Reset your password');
const resetToken = (mail) => decode(mail.data).match(/\?reset=([0-9a-f]{64})/)?.[1];
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

async function api(method, route, { token, body } = {}) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, body: await res.json() };
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
      PASSWORD_RESET_TTL_MS: '4000', PASSWORD_RESET_COOLDOWN_MS: '600',
      RATE_LIMIT_REGISTER_MAX: '1000', RATE_LIMIT_RESET_MAX: '14', RATE_LIMIT_API_MAX: '100000'
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

const login = (email, password) => api('POST', '/auth/login', { body: { email, password } });
const forgot = (email, extra = {}) => api('POST', '/auth/forgot-password', { body: { email, lang: 'en', ...extra } });
const reset = (token, password) => api('POST', '/auth/reset-password', { body: { token, password } });

// sign up and confirm the email address; returns { email, password, token }
let counter = 0;
async function account(label, { verify = true } = {}) {
  counter += 1;
  const email = `${label}${counter}@reset.example`;
  const password = 'original-pass-1';
  const res = await api('POST', '/auth/register', { body: { organizationName: `${label} ${counter} Co`, name: 'Owner', email, password, lang: 'en' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  if (!verify) return { email, password };
  const mail = await waitFor(() => mailsTo(email, 'Confirm your email')[0], 'verification email');
  const token = decode(mail.data).match(/\?verify=([0-9a-f]{64})/)[1];
  assert.equal((await api('POST', '/auth/verify-email', { body: { token } })).status, 200);
  const session = await login(email, password);
  return { email, password, token: session.body.data.token, id: session.body.data._id };
}

test('forgot-password: same answer for everyone, email only for active accounts, cool-down, newest link wins', async () => {
  const owner = await account('forgot');
  const invited = await api('POST', '/auth/users', { token: owner.token, body: { name: 'Blocked', email: 'blocked@reset.example', password: 'password123', role: 'driver' } });
  assert.equal(invited.status, 201);
  assert.equal((await api('PUT', `/auth/users/${invited.body.data._id}/status`, { token: owner.token, body: { status: 'inactive' } })).status, 200);

  const answers = [];
  for (const email of ['nobody@reset.example', 'blocked@reset.example', owner.email]) answers.push((await forgot(email)).body);
  assert.ok(answers.every((a) => JSON.stringify(a) === JSON.stringify(answers[0]))); // no way to tell them apart
  assert.equal((await forgot(12345)).status, 200); // junk input is just as boring

  const first = resetToken(await waitFor(() => resetMails(owner.email)[0], 'reset email'));
  const mail = resetMails(owner.email)[0];
  assert.match(mail.data, /^Subject: \[CLIXGPS\] Reset your password/m);
  assert.match(decode(mail.data), /https:\/\/fleet\.example\.com\/\?reset=[0-9a-f]{64}/);
  assert.match(decode(mail.data), /Hello Owner,/);
  assert.match(decode(mail.data), /valid for 1 minutes/);

  await forgot(owner.email); // inside the cool-down
  await sleep(300);
  assert.equal(resetMails(owner.email).length, 1);
  assert.equal(resetMails('nobody@reset.example').length, 0);
  assert.equal(resetMails('blocked@reset.example').length, 0);

  await sleep(500); // cool-down over
  await forgot(owner.email);
  const second = resetToken(await waitFor(() => resetMails(owner.email)[1], 'second reset email'));
  assert.notEqual(second, first);
  assert.equal((await reset(first, 'brand-new-pass-1')).status, 400); // replaced by the newer link
  assert.equal((await reset(second, 'brand-new-pass-1')).status, 200);
});

test('reset-password: password rules, single use, old password stops working, notification email', async () => {
  const user = await account('reset');
  await forgot(user.email);
  const token = resetToken(await waitFor(() => resetMails(user.email)[0], 'reset email'));

  const weak = await reset(token, 'short');
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, 'WEAK_PASSWORD');
  assert.equal((await reset(token, 'x'.repeat(80))).status, 400); // bcrypt would silently cut it at 72 bytes
  assert.equal((await reset(token, 'я'.repeat(40))).status, 400); // 80 bytes in UTF-8
  const bad = await reset('0'.repeat(64), 'brand-new-pass-1');
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'INVALID_TOKEN');
  assert.equal((await reset('short', 'brand-new-pass-1')).status, 400);
  assert.equal((await api('POST', '/auth/reset-password', { body: { password: 'brand-new-pass-1' } })).status, 400);

  // the token survived all the failed attempts
  assert.equal((await reset(token, 'brand-new-pass-1')).status, 200);
  assert.equal((await login(user.email, user.password)).status, 401);
  assert.equal((await login(user.email, 'brand-new-pass-1')).status, 200);
  assert.equal((await reset(token, 'another-pass-123')).status, 400); // single use

  const notice = await waitFor(() => mailsTo(user.email, 'Your password was changed')[0], 'password changed notice');
  assert.match(decode(notice.data), /was just changed/);
});

test('a reset (or a password change) signs out every older session', async () => {
  const user = await account('sessions');
  assert.equal((await api('GET', '/auth/me', { token: user.token })).status, 200);

  await forgot(user.email);
  const token = resetToken(await waitFor(() => resetMails(user.email)[0], 'reset email'));
  assert.equal((await reset(token, 'brand-new-pass-1')).status, 200);
  assert.equal((await api('GET', '/auth/me', { token: user.token })).status, 401); // old session is dead

  const fresh = (await login(user.email, 'brand-new-pass-1')).body.data.token;
  assert.equal((await api('GET', '/auth/me', { token: fresh })).status, 200);

  // changing the password from the profile ends the OTHER sessions but keeps this one alive
  const other = (await login(user.email, 'brand-new-pass-1')).body.data.token;
  assert.equal((await api('PUT', '/auth/profile', { token: fresh, body: { password: 'short' } })).status, 400);
  const changed = await api('PUT', '/auth/profile', { token: fresh, body: { password: 'profile-changed-1' } });
  assert.equal(changed.status, 200);
  assert.ok(changed.body.data.token);
  assert.equal((await api('GET', '/auth/me', { token: other })).status, 401);
  assert.equal((await api('GET', '/auth/me', { token: fresh })).status, 401);
  assert.equal((await api('GET', '/auth/me', { token: changed.body.data.token })).status, 200);
  assert.equal((await login(user.email, 'profile-changed-1')).status, 200);
  await waitFor(() => mailsTo(user.email, 'Your password was changed').length >= 2, 'second notice');
});

test('reset links expire', async () => {
  const user = await account('expiry');
  await forgot(user.email);
  const token = resetToken(await waitFor(() => resetMails(user.email)[0], 'reset email'));
  await sleep(4300); // the test server uses a 4 second lifetime
  const res = await reset(token, 'brand-new-pass-1');
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'INVALID_TOKEN');
  assert.equal((await login(user.email, user.password)).status, 200); // password unchanged
});

test('resetting through the emailed link also confirms an unconfirmed address', async () => {
  const user = await account('unconfirmed', { verify: false });
  assert.equal((await login(user.email, user.password)).body.code, 'EMAIL_NOT_VERIFIED');

  await forgot(user.email);
  const token = resetToken(await waitFor(() => resetMails(user.email)[0], 'reset email'));
  assert.equal((await reset(token, 'brand-new-pass-1')).status, 200);
  const session = await login(user.email, 'brand-new-pass-1');
  assert.equal(session.status, 200);
  assert.equal(session.body.data.emailVerified, true);

  // the old confirmation link is gone
  const verifyMail = mailsTo(user.email, 'Confirm your email')[0];
  const verifyToken = decode(verifyMail.data).match(/\?verify=([0-9a-f]{64})/)[1];
  assert.equal((await api('POST', '/auth/verify-email', { body: { token: verifyToken } })).status, 400);
});

test('the platform owner can reset a password too', async () => {
  await forgot(SUPER.email);
  const token = resetToken(await waitFor(() => resetMails(SUPER.email)[0], 'reset email'));
  assert.equal((await reset(token, 'platform-new-pass-1')).status, 200);
  assert.equal((await login(SUPER.email, SUPER.password)).status, 401);
  assert.equal((await login(SUPER.email, 'platform-new-pass-1')).body.data.role, 'super_admin');
});

test('password reset endpoints are rate limited', async () => {
  let limited = null;
  for (let i = 0; i < 30 && !limited; i += 1) {
    const res = await reset(String(i).padStart(64, '0'), 'brand-new-pass-1');
    if (res.status === 429) limited = res;
  }
  assert.ok(limited, 'reset-password was never rate limited');
  assert.equal(limited.body.code, 'RATE_LIMITED');
  assert.ok(limited.body.retryAfter >= 1);
});
