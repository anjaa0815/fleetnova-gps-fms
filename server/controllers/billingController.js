import crypto from 'crypto';
import { DataEngine } from '../models/dataEngine.js';
import { runWithTenant, runAsSystem } from '../middleware/tenantContext.js';
import { BILLABLE_PLANS, BILLING_MONTHS, GRACE_DAYS, PLANS, planPriceMnt, positionRetentionDays } from '../config/plans.js';
import { billingMode, createInvoice, refreshInvoice, simulatePayment } from '../services/billing.js';
import { planLimits } from '../services/organizationService.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const OBJECT_ID = /^[0-9a-f]{24}$/;
const baseUrlFor = (req) => `${req.protocol}://${req.get('host')}`;

// Bank-app links come from QPay: keep only plain links with a scheme, never script-like ones
const SAFE_LINK = /^(?!\s*(javascript|data|vbscript):)[a-z][a-z0-9+.-]*:\/\//i;
const cleanUrls = (urls) =>
  (Array.isArray(urls) ? urls : [])
    .filter((u) => u && typeof u.link === 'string' && SAFE_LINK.test(u.link))
    .slice(0, 40)
    .map((u) => ({ name: String(u.name || '').slice(0, 60), description: String(u.description || '').slice(0, 120), logo: typeof u.logo === 'string' && /^https?:\/\//i.test(u.logo) ? u.logo : '', link: u.link }));

export const serializeInvoice = (inv, { full = false } = {}) => ({
  _id: inv._id,
  plan: inv.plan,
  months: inv.months,
  devices: inv.devices || 0,
  amount: inv.amount,
  description: inv.description,
  status: inv.status,
  applied: Boolean(inv.applied),
  provider: inv.provider,
  senderInvoiceNo: inv.senderInvoiceNo,
  createdAt: inv.createdAt,
  expiresAt: inv.expiresAt,
  paidAt: inv.paidAt || null,
  ...(full ? { qrText: inv.qrText || '', qrImage: inv.qrImage || '', shortUrl: /^https?:\/\//i.test(inv.shortUrl || '') ? inv.shortUrl : '', urls: cleanUrls(inv.urls) } : {})
});

// where the subscription stands, for the UI
export function subscriptionState(org, now = Date.now()) {
  if (org.plan === 'trial') {
    if (!org.trialEndsAt) return 'trial';
    return new Date(org.trialEndsAt).getTime() < now ? 'expired' : 'trial';
  }
  if (!org.planExpiresAt) return 'active';
  const end = new Date(org.planExpiresAt).getTime();
  if (now > end + GRACE_DAYS * DAY_MS) return 'expired';
  if (now > end) return 'grace';
  return end - now <= 7 * DAY_MS ? 'expiring' : 'active';
}

// @route GET /api/billing
export const getBilling = async (req, res, next) => {
  try {
    const invoices = await DataEngine.find('invoices', {}, { sort: { createdAt: -1 }, limit: 20 });
    const registeredDevices = await DataEngine.countDocuments('devices');
    res.status(200).json({
      success: true,
      data: {
        mode: billingMode(),
        graceDays: GRACE_DAYS,
        months: BILLING_MONTHS,
        registeredDevices,
        plans: BILLABLE_PLANS.map((id) => ({
          id,
          label: PLANS[id].label,
          pricePerDevice: planPriceMnt(id),
          limits: { ...planLimits({ plan: id }), positionRetentionDays: positionRetentionDays(id) }
        })),
        current: {
          plan: req.org.plan,
          deviceLimit: req.org.plan === 'gps' ? req.org.deviceLimit ?? 0 : null,
          state: subscriptionState(req.org),
          trialEndsAt: req.org.trialEndsAt || null,
          planExpiresAt: req.org.planExpiresAt || null
        },
        invoices: invoices.map((i) => serializeInvoice(i))
      }
    });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/billing/invoices   { plan, months, devices? }
export const createInvoiceRequest = async (req, res, next) => {
  try {
    const months = Number(req.body.months);
    const user = await runAsSystem(() => DataEngine.findById('users', req.user._id));
    const invoice = await createInvoice({ org: req.org, user: user || req.user, plan: String(req.body.plan || 'gps'), months, devices: req.body.devices, baseUrl: baseUrlFor(req) });
    res.status(201).json({ success: true, data: serializeInvoice(invoice, { full: true }) });
  } catch (error) {
    next(error);
  }
};

async function ownInvoice(req, res) {
  if (!OBJECT_ID.test(String(req.params.id))) {
    res.status(404).json({ success: false, message: 'Invoice not found' });
    return null;
  }
  const invoice = await DataEngine.findById('invoices', req.params.id);
  if (!invoice) res.status(404).json({ success: false, message: 'Invoice not found' });
  return invoice;
}

// The page polls this while the customer pays; a pending invoice is checked with QPay
// @route GET /api/billing/invoices/:id
export const getInvoice = async (req, res, next) => {
  try {
    const invoice = await ownInvoice(req, res);
    if (!invoice) return;
    const fresh = await refreshInvoice(invoice);
    res.status(200).json({ success: true, data: serializeInvoice(fresh, { full: true }) });
  } catch (error) {
    next(error);
  }
};

// @route POST /api/billing/invoices/:id/cancel
export const cancelInvoice = async (req, res, next) => {
  try {
    const invoice = await ownInvoice(req, res);
    if (!invoice) return;
    const cancelled = await DataEngine.updateIf('invoices', invoice._id, { status: 'pending' }, { status: 'cancelled' });
    if (!cancelled) return res.status(409).json({ success: false, message: 'Only an unpaid invoice can be cancelled' });
    res.status(200).json({ success: true, data: serializeInvoice(cancelled) });
  } catch (error) {
    next(error);
  }
};

// Development only (no QPay credentials, not production): pays an invoice without any money
// @route POST /api/billing/invoices/:id/simulate-pay
export const simulatePay = async (req, res, next) => {
  try {
    if (billingMode() !== 'simulated') return res.status(404).json({ success: false, message: 'Not found' });
    const invoice = await ownInvoice(req, res);
    if (!invoice) return;
    const paid = await simulatePayment(invoice);
    res.status(200).json({ success: true, data: serializeInvoice(paid, { full: true }) });
  } catch (error) {
    next(error);
  }
};

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

// QPay calls this when a payment arrives. The address holds an unguessable token, and the payment itself is
// never taken from the request: the invoice is checked with QPay (see refreshInvoice).
// @route GET|POST /api/billing/qpay/callback/:id/:token
export const qpayCallback = async (req, res, next) => {
  try {
    const { id, token } = req.params;
    const invoice = OBJECT_ID.test(id) ? await runAsSystem(() => DataEngine.findById('invoices', id)) : null;
    if (!invoice || !safeEqual(token, invoice.callbackToken)) return res.status(404).type('text').send('Not found');
    await runWithTenant({ orgId: String(invoice.orgId) }, () => refreshInvoice(invoice, { force: true }));
    res.status(200).type('text').send('SUCCESS');
  } catch (error) {
    next(error);
  }
};

// @route GET /api/platform/invoices
export const listAllInvoices = async (req, res, next) => {
  try {
    const { all, orgs } = await runAsSystem(async () => ({
      all: await DataEngine.find('invoices', {}, { sort: { createdAt: -1 } }),
      orgs: await DataEngine.find('organizations')
    }));
    const names = new Map(orgs.map((o) => [String(o._id), o.name]));

    // totals over every invoice, whatever the filter or the limit
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const summary = { paidCount: 0, paidTotal: 0, paidThisMonth: 0, pendingCount: 0, expiredCount: 0, cancelledCount: 0 };
    for (const i of all) {
      if (i.status === 'paid') {
        summary.paidCount += 1;
        summary.paidTotal += Number(i.paidAmount || i.amount) || 0;
        if (i.paidAt && new Date(i.paidAt) >= monthStart) summary.paidThisMonth += Number(i.paidAmount || i.amount) || 0;
      } else if (i.status === 'pending') summary.pendingCount += 1;
      else if (i.status === 'expired') summary.expiredCount += 1;
      else if (i.status === 'cancelled') summary.cancelledCount += 1;
    }

    const { status, orgId } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
    const rows = all
      .filter((i) => (!status || i.status === status) && (!orgId || String(i.orgId) === String(orgId)))
      .slice(0, limit);
    res.status(200).json({
      success: true,
      summary,
      data: rows.map((i) => ({ ...serializeInvoice(i), orgId: i.orgId, organization: names.get(String(i.orgId)) || i.orgName || '' }))
    });
  } catch (error) {
    next(error);
  }
};
