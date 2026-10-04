// Turns an API error into text for the user. Rate-limit answers say how long to wait.
export function describeApiError(err, tr, fallback) {
  if (err?.code === 'RATE_LIMITED' && err.retryAfter) {
    const seconds = Number(err.retryAfter);
    return seconds > 90
      ? tr('Too many attempts. Try again in {n} minutes.', { n: Math.ceil(seconds / 60) })
      : tr('Too many attempts. Try again in {n} seconds.', { n: seconds });
  }
  return tr(err?.message || fallback);
}
