import nodemailer from 'nodemailer';

// Delivery providers are configured through environment variables only.
//
//   Email:  SMTP_HOST [SMTP_PORT=587] [SMTP_SECURE=false] [SMTP_USER] [SMTP_PASS] [EMAIL_FROM]
//   SMS:    SMS_PROVIDER=twilio  + TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
//           SMS_PROVIDER=http    + SMS_HTTP_URL [SMS_HTTP_TOKEN] [SMS_FROM]   (JSON POST: {to, text, from})
//   Without a provider the "log" provider prints messages to the console: fine for development, but
//   deliveries are marked as simulated and are NOT sent.

const TIMEOUT_MS = 10 * 1000;

export class DeliveryError extends Error {
  constructor(message, { permanent = false } = {}) {
    super(message);
    this.permanent = permanent;
  }
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new DeliveryError(error.name === 'AbortError' ? 'Request timed out' : `Network error: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// 4xx (except 408/429) means the provider rejected the message itself: retrying cannot help
const failFromResponse = async (response) => {
  const body = (await response.text().catch(() => '')).slice(0, 200);
  const permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
  throw new DeliveryError(`HTTP ${response.status}: ${body}`, { permanent });
};

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

let transporter = null;

function getEmailProvider() {
  if (process.env.SMTP_HOST) {
    return {
      name: 'smtp',
      simulated: false,
      send: async ({ to, subject, text }) => {
        if (!transporter) {
          transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
            connectionTimeout: TIMEOUT_MS,
            greetingTimeout: TIMEOUT_MS,
            socketTimeout: TIMEOUT_MS
          });
        }
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'FLEETNOVA <no-reply@localhost>',
            to,
            subject,
            text
          });
        } catch (error) {
          // 5xx SMTP replies to RCPT/DATA are permanent (bad address, rejected content)
          throw new DeliveryError(error.message, { permanent: error.responseCode >= 500 && error.responseCode < 600 });
        }
      }
    };
  }
  return {
    name: 'log',
    simulated: true,
    send: async ({ to, subject, text }) => {
      console.log(`[Email:simulated] to=${to} subject="${subject}"\n${text}\n`);
    }
  };
}

// ---------------------------------------------------------------------------
// SMS
// ---------------------------------------------------------------------------

function getSmsProvider() {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase();

  if (provider === 'twilio') {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
    if (!sid || !token || !from) {
      return { name: 'twilio', configured: false, simulated: false, send: async () => { throw new DeliveryError('Twilio is not fully configured', { permanent: true }); } };
    }
    return {
      name: 'twilio',
      simulated: false,
      send: async ({ to, text }) => {
        const response = await fetchWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ To: to, From: from, Body: text })
        });
        if (!response.ok) await failFromResponse(response);
      }
    };
  }

  if (provider === 'http' && process.env.SMS_HTTP_URL) {
    return {
      name: 'http',
      simulated: false,
      send: async ({ to, text }) => {
        const response = await fetchWithTimeout(process.env.SMS_HTTP_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.SMS_HTTP_TOKEN ? { Authorization: `Bearer ${process.env.SMS_HTTP_TOKEN}` } : {})
          },
          body: JSON.stringify({ to, text, from: process.env.SMS_FROM || 'FLEETNOVA' })
        });
        if (!response.ok) await failFromResponse(response);
      }
    };
  }

  return {
    name: 'log',
    simulated: true,
    send: async ({ to, text }) => {
      console.log(`[SMS:simulated] to=${to} text="${text}"`);
    }
  };
}

export function getProvider(channel) {
  return channel === 'email' ? getEmailProvider() : getSmsProvider();
}

// For the UI: which providers are active (never exposes credentials)
export function providerStatus() {
  const email = getEmailProvider();
  const sms = getSmsProvider();
  return {
    email: { provider: email.name, simulated: email.simulated },
    sms: { provider: sms.name, simulated: sms.simulated, configured: sms.configured !== false }
  };
}
