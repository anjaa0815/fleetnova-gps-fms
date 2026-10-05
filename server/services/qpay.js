// QPay (Mongolian QR payment) merchant API client, v2.
//
//   QPAY_BASE_URL       default https://merchant.qpay.mn/v2 (the sandbox is https://merchant-sandbox.qpay.mn/v2)
//   QPAY_USERNAME / QPAY_PASSWORD   merchant credentials (HTTP Basic, exchanged for an access token)
//   QPAY_INVOICE_CODE   the merchant's invoice code
//
// Without credentials QPay is "not configured": outside production the billing flow runs in a simulated mode
// (no money moves), in production online payment is switched off.
const TIMEOUT_MS = 10000;

export const qpayConfigured = () =>
  Boolean(process.env.QPAY_USERNAME && process.env.QPAY_PASSWORD && process.env.QPAY_INVOICE_CODE);

const baseUrl = () => String(process.env.QPAY_BASE_URL || 'https://merchant.qpay.mn/v2').replace(/\/+$/, '');

export class QpayError extends Error {
  constructor(message, { status = 0, permanent = false } = {}) {
    super(message);
    this.status = status;
    this.permanent = permanent;
  }
}

async function request(path, { method = 'POST', headers = {}, body } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    throw new QpayError(`QPay is unreachable: ${error.message}`);
  }
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!response.ok) {
    const detail = json?.message || json?.error || text.slice(0, 120);
    throw new QpayError(`QPay ${method} ${path} -> ${response.status} ${detail}`, { status: response.status, permanent: response.status >= 400 && response.status < 500 && response.status !== 401 });
  }
  return json;
}

// ---- access token (cached until shortly before it expires) ----
let token = null; // { value, expiresAt }

function expiryOf(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now() + 5 * 60 * 1000;
  // QPay returns an absolute time in seconds; accept a "seconds from now" value as well
  return n > 1e9 ? n * 1000 : Date.now() + n * 1000;
}

async function accessToken() {
  if (token && token.expiresAt - 60 * 1000 > Date.now()) return token.value;
  const basic = Buffer.from(`${process.env.QPAY_USERNAME}:${process.env.QPAY_PASSWORD}`).toString('base64');
  const json = await request('/auth/token', { headers: { Authorization: `Basic ${basic}` } });
  if (!json?.access_token) throw new QpayError('QPay did not return an access token');
  token = { value: json.access_token, expiresAt: expiryOf(json.expires_in) };
  return token.value;
}

async function authorized(path, body) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const value = await accessToken();
      // eslint-disable-next-line no-await-in-loop
      return await request(path, { headers: { Authorization: `Bearer ${value}` }, body });
    } catch (error) {
      if (error.status === 401 && attempt === 0) { token = null; continue; } // expired early: sign in again once
      throw error;
    }
  }
  return null;
}

export const resetQpayToken = () => { token = null; };

// Creates an invoice. Returns what the customer needs to pay it.
export async function createQpayInvoice({ senderInvoiceNo, receiverCode, description, amount, callbackUrl }) {
  const json = await authorized('/invoice', {
    invoice_code: process.env.QPAY_INVOICE_CODE,
    sender_invoice_no: senderInvoiceNo,
    invoice_receiver_code: receiverCode,
    invoice_description: description,
    amount,
    callback_url: callbackUrl
  });
  if (!json?.invoice_id) throw new QpayError('QPay did not return an invoice id');
  return {
    qpayInvoiceId: String(json.invoice_id),
    qrText: json.qr_text || '',
    qrImage: json.qr_image || '',
    shortUrl: json.qPay_shortUrl || json.qpay_short_url || '',
    urls: Array.isArray(json.urls) ? json.urls : []
  };
}

// Asks QPay what has been paid on an invoice. The callback is never trusted by itself: this answer is.
// Returns { paid, paidAmount, paymentId }.
export async function checkQpayPayment(qpayInvoiceId) {
  const json = await authorized('/payment/check', {
    object_type: 'INVOICE',
    object_id: qpayInvoiceId,
    offset: { page_number: 1, page_size: 100 }
  });
  const rows = Array.isArray(json?.rows) ? json.rows : [];
  const paidRows = rows.filter((row) => String(row.payment_status || '').toUpperCase() === 'PAID');
  const summed = paidRows.reduce((sum, row) => sum + (Number(row.payment_amount) || 0), 0);
  const paidAmount = Number(json?.paid_amount) || summed;
  return { paid: paidRows.length > 0 && paidAmount > 0, paidAmount, paymentId: paidRows[0] ? String(paidRows[0].payment_id || '') : '' };
}
