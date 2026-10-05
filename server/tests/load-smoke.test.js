import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { dbEnv } from './dbEnv.js';

const run = promisify(execFile);
const HTTP_PORT = 5100 + Math.floor(Math.random() * 90);
const TCP_PORT = 5600 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-load-test-${process.pid}.json`);
const ADMIN = { email: 'platform@load-smoke.example', password: 'platform-pass-1' };
let server;

before(async () => {
  fs.rmSync(DATA_FILE, { force: true });
  server = spawn(process.execPath, ['server.js'], {
    env: {
      ...process.env, NODE_ENV: 'production', PORT: String(HTTP_PORT), HOST: '127.0.0.1',
      GPS_TCP_PORT: String(TCP_PORT), GT06_TCP_PORT: '0', JWT_SECRET: 'test-secret',
      RATE_LIMIT_DISABLED: 'true', REQUIRE_EMAIL_VERIFICATION: 'false', FLEETNOVA_DATA_FILE: DATA_FILE, ...dbEnv(),
      ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server did not start');
});

after(() => {
  server?.kill();
  fs.rmSync(DATA_FILE, { force: true });
});

// A short run of scripts/load-test.js: concurrent vehicle / device creation (identifier races), trackers over
// TCP and HTTP, API readers; every acknowledged record must be stored and nothing may fail.
for (const protocol of ['teltonika', 'osmand']) {
  test(`load smoke: 30 ${protocol} trackers and a reader, nothing lost or failed`, async () => {
    const { stdout } = await run(process.execPath, [
      'scripts/load-test.js', '--admin-email', ADMIN.email, '--admin-password', ADMIN.password, '--base', BASE,
      '--tcp-port', String(TCP_PORT), '--protocol', protocol, '--devices', '30', '--rate', '2', '--duration', '5', '--ramp', '1', '--readers', '1'
    ], { timeout: 90000 });
    const result = JSON.parse(stdout.slice(stdout.indexOf('{\n  "config"')));
    assert.equal(result.ingestLatencyMs.errors, 0);
    assert.equal(result.storedMismatches, 0);
    assert.ok(result.recordsAcknowledged >= 30 * 2 * 4, `only ${result.recordsAcknowledged} records acknowledged`);
    for (const [name, m] of Object.entries(result.readLatencyMs)) assert.equal(m.errors, 0, `${name} reads failed`);
  });
}
