// Resolves which organization's branded login page is being visited:
//   https://acme.example.com/     -> "acme"  (sub-domain)
//   https://example.com/?org=acme -> "acme"  (query parameter, works everywhere)
const IGNORED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'platform', 'localhost']);

export function getOrgSlugFromLocation(location = window.location) {
  const fromQuery = new URLSearchParams(location.search).get('org');
  if (fromQuery && /^[a-z0-9-]{1,60}$/i.test(fromQuery)) return fromQuery.toLowerCase();

  const parts = location.hostname.split('.');
  if (parts.length >= 3 && !IGNORED_SUBDOMAINS.has(parts[0]) && /^[a-z0-9-]+$/i.test(parts[0])) {
    return parts[0].toLowerCase();
  }
  return null;
}
