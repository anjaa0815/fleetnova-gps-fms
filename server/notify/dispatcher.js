import { DataEngine } from '../models/dataEngine.js';
import { getPlan } from '../config/plans.js';
import { deliverySettings } from '../services/organizationService.js';
import { translate } from '../utils/serverI18n.js';
import { normalizePhone } from './phone.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SUBJECT = 150;
const MAX_SMS = 300;

const oneLine = (text) => String(text).replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f]/g, '').trim();

export const startOfWindow = () => new Date(Date.now() - DAY_MS);

// Rolling 24h usage (sent + queued) per channel, for the organization of the current tenant context
export async function deliveryUsage() {
  const since = startOfWindow();
  const count = (channel) =>
    DataEngine.countDocuments('deliveries', { channel, status: { $in: ['queued', 'sent'] }, createdAt: { $gte: since } });
  const [email, sms] = await Promise.all([count('email'), count('sms')]);
  return { email, sms };
}

const planCap = (org, channel) => {
  const plan = getPlan(org.plan);
  return channel === 'email' ? plan.maxEmailsPerDay : plan.maxSmsPerDay;
};

export function buildMessages(org, notification, lang) {
  const t = (text, params) => translate(lang, text, params);
  const title = notification.titleKey ? t(notification.titleKey, notification.params) : notification.title;
  const message = notification.messageKey ? t(notification.messageKey, notification.params) : notification.message;
  const when = new Date(notification.createdAt || Date.now()).toLocaleString('en-GB', {
    timeZone: process.env.ALERT_TIME_ZONE || 'Asia/Ulaanbaatar',
    hour12: false
  });
  const { lat, lng } = notification.params || {};

  const lines = [title, '', message, '', `${t('Time')}: ${when}`];
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    lines.push(`${t('Location')}: https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`);
  }
  lines.push(`${t('Organization')}: ${org.name}`);
  if (process.env.APP_BASE_URL) lines.push(`FLEETNOVA: ${process.env.APP_BASE_URL}`);
  lines.push('', t('You receive this alert because email alerts are enabled for your account in FLEETNOVA.'));

  return {
    subject: oneLine(`[FLEETNOVA] ${title}: ${notification.params?.vehicle || ''}`).slice(0, MAX_SUBJECT),
    emailText: lines.join('\n'),
    smsText: oneLine(`${message} (${when.slice(-8, -3)})`).slice(0, MAX_SMS)
  };
}

// Creates the queued email / SMS deliveries for one alert. Must run inside the organization's tenant
// context. Nothing is sent here: the delivery worker sends and retries.
export async function enqueueDeliveries({ org, notification }) {
  const settings = deliverySettings(org);
  if (!settings.types.includes(notification.type)) return [];
  const channels = ['email', 'sms'].filter((c) => settings[c]);
  if (channels.length === 0) return [];

  const users = await DataEngine.find('users', { status: 'active' });
  const messages = buildMessages(org, notification, settings.language);
  const usage = await deliveryUsage();
  const created = [];

  for (const channel of channels) {
    const cap = planCap(org, channel);
    for (const user of users) {
      if (!user.alertChannels?.[channel]) continue;

      const to = channel === 'email' ? user.email : normalizePhone(user.phone);
      const base = {
        notification: notification._id,
        type: notification.type,
        channel,
        userId: user._id,
        to: to || '',
        subject: channel === 'email' ? messages.subject : '',
        text: channel === 'email' ? messages.emailText : messages.smsText,
        attempts: 0,
        simulated: false
      };

      let doc;
      if (!to) {
        doc = { ...base, to: user.phone || '-', status: 'skipped', lastError: 'No valid phone number' };
      } else if (cap >= 0 && usage[channel] >= cap) {
        doc = { ...base, status: 'skipped', lastError: 'Daily limit of your plan reached' };
      } else {
        usage[channel] += 1;
        doc = { ...base, status: 'queued', nextAttemptAt: new Date().toISOString() };
      }
      // eslint-disable-next-line no-await-in-loop
      created.push(await DataEngine.create('deliveries', doc));
    }
  }
  return created;
}
