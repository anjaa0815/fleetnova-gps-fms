// Address search and reverse lookup on OpenStreetMap's Nominatim (the same OpenStreetMap that draws the map tiles).
// Its public server is for light use (about one request a second): search only when asked, never while typing.
const BASE = 'https://nominatim.openstreetmap.org';

async function call(path, params, lang) {
  const url = `${BASE}/${path}?${new URLSearchParams({ format: 'jsonv2', 'accept-language': lang === 'mn' ? 'mn,en' : 'en', ...params })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Address search is not available now');
  return res.json();
}

// The first few parts of an address are enough as a place name ("Sukhbaatar Square, Sukhbaatar District, Ulaanbaatar")
export const shortName = (displayName) => String(displayName || '').split(',').map((p) => p.trim()).filter(Boolean).slice(0, 3).join(', ');

export async function searchAddress(query, lang) {
  const rows = await call('search', { q: query, limit: '6' }, lang);
  return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: shortName(r.display_name) })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

export async function reverseAddress(lat, lng, lang) {
  const row = await call('reverse', { lat: String(lat), lon: String(lng), zoom: '16' }, lang);
  return shortName(row.display_name);
}
