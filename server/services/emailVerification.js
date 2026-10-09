import crypto from 'crypto';
import { DataEngine } from '../models/dataEngine.js';
import { getProvider } from '../notify/providers.js';
import { translate } from '../utils/serverI18n.js';

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const verificationTtlMs = () => Number(process.env.EMAIL_VERIFICATION_TTL_MS) || 24 * 60 * 60 * 1000;
export const resendCooldownMs = () => (process.env.EMAIL_RESEND_COOLDOWN_MS !== undefined ? Number(process.env.EMAIL_RESEND_COOLDOWN_MS) : 60 * 1000);

// New self-service accounts must confirm their email address when:
//   REQUIRE_EMAIL_VERIFICATION=true, or (unset) an SMTP server is configured so the message can actually be sent.
// With REQUIRE_EMAIL_VERIFICATION=false (or no SMTP in development) sign-ups work immediately as before.
export function emailVerificationRequired() {
  const setting = process.env.REQUIRE_EMAIL_VERIFICATION;
  if (setting === 'true') return true;
  if (setting === 'false') return false;
  return Boolean(process.env.SMTP_HOST);
}

// Creates a single-use token (only its hash is stored) and returns the raw token for the link
export async function issueVerificationToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await DataEngine.findByIdAndUpdate('users', user._id, {
    emailVerificationTokenHash: hash(token),
    emailVerificationExpires: new Date(Date.now() + verificationTtlMs()).toISOString(),
    emailVerificationSentAt: new Date().toISOString()
  });
  return token;
}

// Returns the matching, non-expired user (token not yet used) or null
export async function findUserByToken(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const user = await DataEngine.findOne('users', { emailVerificationTokenHash: hash(token) }, { select: '+emailVerificationExpires' });
  if (!user || !user.emailVerificationExpires) return null;
  if (new Date(user.emailVerificationExpires).getTime() < Date.now()) return null;
  return user;
}

export async function markVerified(user) {
  await DataEngine.findByIdAndUpdate('users', user._id, {
    emailVerified: true,
    emailVerificationTokenHash: null,
    emailVerificationExpires: null
  });
}

export async function sendVerificationEmail({ user, token, baseUrl }) {
  const lang = user.language === 'en' ? 'en' : 'mn';
  const t = (text, params) => translate(lang, text, params);
  const link = `${baseUrl.replace(/\/$/, '')}/?verify=${token}`;
  const hours = Math.max(1, Math.round(verificationTtlMs() / 3600000));
  await getProvider('email').send({
    to: user.email,
    subject: t('[CLIXGPS] Confirm your email address'),
    text: [
      t('Hello {name},', { name: user.name }),
      '',
      t('Confirm your email address to activate your CLIXGPS account:'),
      link,
      '',
      t('The link is valid for {hours} hours and can be used once.', { hours }),
      t('If you did not sign up, you can ignore this message.')
    ].join('\n')
  });
}
