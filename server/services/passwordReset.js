import crypto from 'crypto';
import { DataEngine } from '../models/dataEngine.js';
import { getProvider } from '../notify/providers.js';
import { translate } from '../utils/serverI18n.js';

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export const resetTtlMs = () => Number(process.env.PASSWORD_RESET_TTL_MS) || 60 * 60 * 1000;
export const resetCooldownMs = () => (process.env.PASSWORD_RESET_COOLDOWN_MS !== undefined ? Number(process.env.PASSWORD_RESET_COOLDOWN_MS) : 60 * 1000);

// bcrypt only looks at the first 72 bytes of a password: refuse longer ones instead of silently truncating them
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 8;

// Returns an error message for an unacceptable password, otherwise null
export function passwordError(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) return 'Password is too long (at most 72 bytes)';
  return null;
}

// Single-use token; only its hash is stored. A new request replaces (and so invalidates) the previous one.
export async function issueResetToken(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await DataEngine.findByIdAndUpdate('users', user._id, {
    passwordResetTokenHash: hash(token),
    passwordResetExpires: new Date(Date.now() + resetTtlMs()).toISOString(),
    passwordResetSentAt: new Date().toISOString()
  });
  return token;
}

export async function findUserByResetToken(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const user = await DataEngine.findOne('users', { passwordResetTokenHash: hash(token) });
  if (!user || !user.passwordResetExpires) return null;
  if (new Date(user.passwordResetExpires).getTime() < Date.now()) return null;
  return user;
}

export async function sendPasswordResetEmail({ user, token, baseUrl, lang }) {
  const t = (text, params) => translate(lang, text, params);
  const link = `${baseUrl.replace(/\/$/, '')}/?reset=${token}`;
  const minutes = Math.max(1, Math.round(resetTtlMs() / 60000));
  await getProvider('email').send({
    to: user.email,
    subject: t('[FLEETNOVA] Reset your password'),
    text: [
      t('Hello {name},', { name: user.name }),
      '',
      t('We received a request to reset the password of your FLEETNOVA account. Choose a new password here:'),
      link,
      '',
      t('The link is valid for {minutes} minutes and can be used once.', { minutes }),
      t('If you did not ask for this, ignore this message: your password stays as it is.')
    ].join('\n')
  });
}

// Security notice after the password was changed
export async function sendPasswordChangedEmail({ user, lang }) {
  const t = (text, params) => translate(lang, text, params);
  await getProvider('email').send({
    to: user.email,
    subject: t('[FLEETNOVA] Your password was changed'),
    text: [
      t('Hello {name},', { name: user.name }),
      '',
      t('The password of your FLEETNOVA account was just changed and all other sessions were signed out.'),
      t('If this was not you, reset your password again right away and contact your administrator.')
    ].join('\n')
  });
}
