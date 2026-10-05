import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// In-process unit test of the step that turns a PAID invoice into subscription time. It uses the JSON store.
const DATA_FILE = path.join(os.tmpdir(), `fleetnova-billing-apply-${process.pid}.json`);
fs.rmSync(DATA_FILE, { force: true });
process.env.FLEETNOVA_DATA_FILE = DATA_FILE;
process.env.NODE_ENV = 'production';
const { DataEngine } = await import('../models/dataEngine.js');
const { runWithTenant } = await import('../middleware/tenantContext.js');
const { applyPaidInvoice, addMonths } = await import('../services/billing.js');

let n = 0;
async function setup(plan = 'trial') {
  n += 1;
  const org = await DataEngine.create('organizations', { name: `Apply ${n}`, slug: `apply-${n}`, status: 'active', plan, trialEndsAt: null, planExpiresAt: null });
  const mkInvoice = (invPlan, months) =>
    DataEngine.create('invoices', {
      orgId: org._id, plan: invPlan, months, amount: 1000 * months, status: 'paid', applied: false,
      senderInvoiceNo: `T-${n}-${Math.random().toString(36).slice(2)}`, callbackToken: 'x', provider: 'qpay', expiresAt: new Date(Date.now() + 86400000).toISOString()
    });
  const inOrg = (fn) => runWithTenant({ orgId: String(org._id) }, fn);
  const current = () => DataEngine.findById('organizations', org._id);
  return { org, mkInvoice, inOrg, current };
}
const near = (iso, expected, tolerance = 5000) => Math.abs(new Date(iso).getTime() - expected.getTime()) < tolerance;

test('applying the same paid invoice twice (a crash, then the worker) extends the plan only once', async () => {
  const { mkInvoice, inOrg, current } = await setup();
  const invoice = await inOrg(() => mkInvoice('basic', 1));

  const first = await inOrg(() => applyPaidInvoice(invoice));
  assert.equal(first.applied, true);
  const expiry = (await current()).planExpiresAt;
  assert.ok(near(expiry, addMonths(new Date(), 1)));

  // the crash happened after the organization was updated but before the invoice was flagged
  await inOrg(() => DataEngine.findByIdAndUpdate('invoices', invoice._id, { applied: false }));
  const again = await inOrg(() => applyPaidInvoice({ ...invoice, applied: false }));
  assert.equal(again.applied, true);
  assert.equal((await current()).planExpiresAt, expiry, 'the second run must not add another month');
});

test('two invoices of one organization applied at the same moment both count', async () => {
  const { mkInvoice, inOrg, current } = await setup();
  const a = await inOrg(() => mkInvoice('basic', 1));
  const b = await inOrg(() => mkInvoice('basic', 3));
  await Promise.all([inOrg(() => applyPaidInvoice(a)), inOrg(() => applyPaidInvoice(b))]);
  const org = await current();
  assert.equal(org.plan, 'basic');
  assert.ok(near(org.planExpiresAt, addMonths(new Date(), 4)), `one month and three months make four, got ${org.planExpiresAt}`);
});
