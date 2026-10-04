const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
};

// "Монгол Карго ХХК" -> "mongol-kargo"
// Legal-form words that add nothing to a sub-domain (ХХК, LLC, ...)
const LEGAL_FORMS = new Set(['ххк', 'хк', 'ооо', 'llc', 'ltd', 'inc', 'co', 'corp']);

export function slugify(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !LEGAL_FORMS.has(w.replace(/[.,]/g, '')));
  const latin = (words.length ? words : [String(text || '').toLowerCase()])
    .join(' ')
    .split('')
    .map((ch) => (ch in CYRILLIC ? CYRILLIC[ch] : ch))
    .join('');
  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// Hostnames that can never be tenant sub-domains.
export const RESERVED_SLUGS = new Set([
  'www', 'api', 'app', 'admin', 'platform', 'static', 'assets', 'mail', 'support', 'login', 'register', 'localhost'
]);
