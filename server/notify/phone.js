// Normalizes a phone number to E.164. 8-digit numbers are treated as local Mongolian numbers.
const DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || '976';

export function normalizePhone(raw) {
  if (!raw) return null;
  const compact = String(raw).replace(/[\s\-().]/g, '');
  if (/^\+\d{8,15}$/.test(compact)) return compact;
  if (/^00\d{8,15}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^\d{8}$/.test(compact)) return `+${DEFAULT_COUNTRY_CODE}${compact}`;
  return null;
}

export const maskPhone = (phone) => (phone ? `${phone.slice(0, 4)}****${phone.slice(-2)}` : '');

export const maskEmail = (email) => {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return email || '';
  return `${user.slice(0, 2)}***@${domain}`;
};
