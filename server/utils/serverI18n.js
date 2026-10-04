import mn from '../../src/i18n/mn.js';

// Same dictionary as the web UI (English source strings are the keys); used for emails and SMS
export function translate(lang, text, params) {
  let out = lang === 'mn' ? mn[text] ?? text : text;
  if (params) {
    out = out.replace(/\{(\w+)\}/g, (match, key) => (params[key] !== undefined && params[key] !== null ? String(params[key]) : match));
  }
  return out;
}
