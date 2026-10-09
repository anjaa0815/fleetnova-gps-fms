import crypto from 'crypto';
import { DataEngine } from '../models/dataEngine.js';
import { runWithTenant, runAsSystem } from '../middleware/tenantContext.js';
import { BILLABLE_PLANS, BILLING_MONTHS, planPriceMnt, getPlan } from '../config/plans.js';
import { createQpayInvoice, checkQpayPayment, qpayConfigured } from './qpay.js';
import { ServiceError } from './organizationService.js';
import { invalidateOrganization } from '../gps/lookupCache.js';
import { getProvider } from '../notify/providers.js';
import { translate } from '../utils/serverI18n.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const INVOICE_TTL_MS = 2 * DAY_MS;
const CHECK_INTERVAL_MS = process.env.BILLING_CHECK_INTERVAL_MS !== undefined ? Number(process.env.BILLING_CHECK_INTERVAL_MS) : 3000; // a polling browser must not turn into a QPay request per second
const KEEP_APPLIED_IDS = 20;

// qpay: real payments.
// simulated: nothing is charged ("mark as paid" for demos). Only on a development machine: never in production, and
// only when the server listens on the loopback address (the default of `npm run dev`) unless BILLING_SIMULATE=true
// says otherwise. A server that merely forgot NODE_ENV=production must not hand out paid plans for free.
// disabled: everything else without QPay credentials.
const loopbackHost = () => !process.env.HOST || ['localhost', '127.0.0.1', '::1'].includes(process.env.HOST);
export const billingMode = () => {
  if (qpayConfigured()) return 'qpay';
  if (process.env.NODE_ENV === 'production') return 'disabled';
  return loopbackHost() || process.env.BILLING_SIMULATE === 'true' ? 'simulated' : 'disabled';
};

export const invoiceAmount = (plan, months) => {
  const monthly = planPriceMnt(plan);
  return monthly ? monthly * months : null;
};

// Calendar months in UTC (31 Jan + 1 month = 28 / 29 Feb)
export function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

const random = (bytes) => crypto.randomBytes(bytes).toString('hex');

// Must run inside the organization's tenant context
export async function createInvoice({ org, user, plan, months, baseUrl }) {
  if (!BILLABLE_PLANS.includes(plan)) throw new ServiceError('This plan cannot be bought online');
  if (!BILLING_MONTHS.includes(months)) throw new ServiceError('Invalid period');
  const mode = billingMode();
  if (mode === 'disabled') throw new ServiceError('Online payment is not available', 503);
  const amount = invoiceAmount(plan, months);
  if (!amount) throw new ServiceError('This plan cannot be bought online');

  // The same open request is shown again (page reloads must not pile up invoices)
  const open = await DataEngine.find('invoices', { status: 'pending', plan, months, amount }, { sort: { createdAt: -1 }, limit: 1 });
  if (open[0] && new Date(open[0].expiresAt).getTime() > Date.now() + 60 * 1000 && open[0].provider === (mode === 'qpay' ? 'qpay' : 'simulated')) return open[0];
  const pendingCount = await DataEngine.countDocuments('invoices', { status: 'pending' });
  if (pendingCount >= 10) throw new ServiceError('Too many unpaid payment requests. Please cancel some first.', 429);

  const senderInvoiceNo = `FN-${Date.now().toString(36).toUpperCase()}-${random(3).toUpperCase()}`;
  const description = translate(user.language === 'en' ? 'en' : 'mn', 'CLIXGPS {plan} plan, {months} month(s)', { plan: getPlan(plan).label, months });
  const invoice = await DataEngine.create('invoices', {
    createdBy: user._id,
    plan,
    months,
    amount,
    description,
    status: 'pending',
    applied: false,
    senderInvoiceNo,
    callbackToken: random(24),
    provider: mode === 'qpay' ? 'qpay' : 'simulated',
    expiresAt: new Date(Date.now() + INVOICE_TTL_MS).toISOString()
  });

  if (mode === 'simulated') {
    return DataEngine.findByIdAndUpdate('invoices', invoice._id, { qrText: `SIMULATED-${senderInvoiceNo}` });
  }

  const root = String(process.env.APP_BASE_URL || baseUrl).replace(/\/+$/, '');
  try {
    const qpay = await createQpayInvoice({
      senderInvoiceNo,
      receiverCode: String(org._id),
      description,
      amount,
      callbackUrl: `${root}/api/billing/qpay/callback/${invoice._id}/${invoice.callbackToken}`
    });
    return await DataEngine.findByIdAndUpdate('invoices', invoice._id, qpay);
  } catch (error) {
    console.error(`[Billing] Could not create the QPay invoice: ${error.message}`);
    await DataEngine.findByIdAndUpdate('invoices', invoice._id, { status: 'cancelled' });
    throw new ServiceError('Could not create the payment request. Please try again.', 502);
  }
}

// Turns a paid invoice into subscription time. Exactly once, even when two requests or a crash interleave:
// the organization remembers which invoices it has applied and is updated with a compare-and-set.
export async function applyPaidInvoice(invoice) {
  const orgId = String(invoice.orgId);
  const invoiceId = String(invoice._id);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const org = await DataEngine.findById('organizations', orgId, { select: '+appliedInvoiceIds +subscriptionVersion' });
    if (!org) throw new Error(`Organization ${orgId} of invoice ${invoiceId} not found`);
    const applied = (org.appliedInvoiceIds || []).map(String);

    if (!applied.includes(invoiceId)) {
      const now = new Date();
      const current = org.planExpiresAt ? new Date(org.planExpiresAt) : null;
      // renewing the same plan continues the running period; any other change starts now
      const base = org.plan === invoice.plan && current && current > now ? current : now;
      const periodEnd = addMonths(base, invoice.months);
      // compare-and-set on a version counter (an organization saved before the counter existed has none)
      const version = org.subscriptionVersion;
      const unchanged = version == null ? { subscriptionVersion: { $in: [null, undefined] } } : { subscriptionVersion: version };
      // eslint-disable-next-line no-await-in-loop
      const updated = await DataEngine.updateIf('organizations', orgId, unchanged, {
        plan: invoice.plan,
        planExpiresAt: periodEnd.toISOString(),
        trialEndsAt: null,
        appliedInvoiceIds: [...applied, invoiceId].slice(-KEEP_APPLIED_IDS),
        subscriptionVersion: (version || 0) + 1
      });
      if (!updated) continue; // the organization changed meanwhile: read it again
      invalidateOrganization(orgId);
    }
    break;
  }

  const done = await DataEngine.updateIf('invoices', invoice._id, { applied: { $ne: true } }, { applied: true });
  if (done) await sendReceipt(done).catch((error) => console.error(`[Billing] Receipt not sent: ${error.message}`));
  return DataEngine.findById('invoices', invoice._id);
}

async function sendReceipt(invoice) {
  const user = invoice.createdBy ? await DataEngine.findById('users', invoice.createdBy) : null;
  const org = await DataEngine.findById('organizations', invoice.orgId);
  const to = user?.email || org?.contactEmail;
  if (!to) return;
  const lang = user?.language === 'en' ? 'en' : 'mn';
  const t = (text, params) => translate(lang, text, params);
  const until = org?.planExpiresAt ? new Date(org.planExpiresAt).toLocaleDateString('en-CA', { timeZone: process.env.ALERT_TIME_ZONE || 'Asia/Ulaanbaatar' }) : '';
  await getProvider('email').send({
    to,
    subject: t('[CLIXGPS] Payment received'),
    text: [
      t('We received your payment of {amount} MNT for the {plan} plan ({months} month(s)).', { amount: invoice.amount.toLocaleString('en-US'), plan: getPlan(invoice.plan).label, months: invoice.months }),
      until ? t('Your plan is active until {date}.', { date: until }) : null,
      `${t('Invoice')}: ${invoice.senderInvoiceNo}`,
      '',
      t('Thank you!')
    ].filter((line) => line !== null).join('\n')
  });
}

// Marks a pending invoice paid (once) and applies it. Returns the current invoice.
async function settle(invoice, { paymentId, paidAmount }) {
  const claimed = await DataEngine.updateIf('invoices', invoice._id, { status: 'pending' }, {
    status: 'paid',
    paymentId,
    paidAmount,
    paidAt: new Date().toISOString()
  });
  if (!claimed) return DataEngine.findById('invoices', invoice._id); // settled / expired / cancelled in the meantime
  return applyPaidInvoice(claimed);
}

// Brings a pending invoice up to date: expires it, or asks QPay and settles it when it is paid in full.
// Must run inside the organization's tenant context. A QPay outage leaves the invoice unchanged.
export async function refreshInvoice(invoice, { force = false } = {}) {
  if (invoice.status === 'paid' && invoice.applied !== true) return applyPaidInvoice(invoice);
  if (invoice.status !== 'pending') return invoice;

  if (new Date(invoice.expiresAt).getTime() < Date.now()) {
    const expired = await DataEngine.updateIf('invoices', invoice._id, { status: 'pending' }, { status: 'expired' });
    return expired || DataEngine.findById('invoices', invoice._id);
  }
  if (invoice.provider !== 'qpay' || !invoice.qpayInvoiceId) return invoice;
  if (!force && invoice.lastCheckedAt && Date.now() - new Date(invoice.lastCheckedAt).getTime() < CHECK_INTERVAL_MS) return invoice;

  await DataEngine.findByIdAndUpdate('invoices', invoice._id, { lastCheckedAt: new Date().toISOString() });
  let result;
  try {
    result = await checkQpayPayment(invoice.qpayInvoiceId);
  } catch (error) {
    console.error(`[Billing] Could not check invoice ${invoice.senderInvoiceNo}: ${error.message}`);
    return invoice;
  }
  if (result.paid && result.paidAmount >= invoice.amount) return settle(invoice, result);
  if (result.paid) console.error(`[Billing] Invoice ${invoice.senderInvoiceNo} is paid with ${result.paidAmount} but ${invoice.amount} is due: not applied`);
  return DataEngine.findById('invoices', invoice._id);
}

export async function simulatePayment(invoice) {
  if (billingMode() !== 'simulated' || invoice.provider !== 'simulated') throw new ServiceError('Not available', 403);
  if (invoice.status !== 'pending') return invoice;
  return settle(invoice, { paymentId: `SIM-${random(4)}`, paidAmount: invoice.amount });
}

// Safety net behind the callback and the polling page: re-applies paid invoices an interruption left half done,
// asks QPay about invoices whose callback never arrived, and expires old ones.
export async function reconcileInvoices() {
  const work = await runAsSystem(async () => [
    ...(await DataEngine.find('invoices', { status: 'paid', applied: { $ne: true } }, { limit: 50 })),
    ...(await DataEngine.find('invoices', { status: 'pending' }, { sort: { createdAt: 1 }, limit: 50 }))
  ]);
  let touched = 0;
  for (const invoice of work) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await runWithTenant({ orgId: String(invoice.orgId) }, () => refreshInvoice(invoice, { force: true }));
      touched += 1;
    } catch (error) {
      console.error(`[Billing] Reconcile failed for ${invoice.senderInvoiceNo}: ${error.message}`);
    }
  }
  return touched;
}

export function startBillingWorker() {
  const interval = Number(process.env.BILLING_POLL_MS) || 5 * 60 * 1000;
  const firstRun = process.env.BILLING_FIRST_RUN_MS !== undefined ? Number(process.env.BILLING_FIRST_RUN_MS) : 30 * 1000;
  const run = () => reconcileInvoices().catch((error) => console.error(`[Billing] Worker error: ${error.message}`));
  const first = setTimeout(run, firstRun);
  const timer = setInterval(run, interval);
  first.unref?.();
  timer.unref?.();
  return timer;
}
