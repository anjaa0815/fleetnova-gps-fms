// Optional link to a Traccar server (https://www.traccar.org) that receives the trackers' data.
// Traccar decodes the device protocols and forwards each position to /api/gps/traccar; this client only keeps
// Traccar's device list in step with ours (Traccar drops data from devices it does not know).
const TIMEOUT_MS = 5000;

export const traccarConfigured = () => Boolean(process.env.TRACCAR_URL) && Boolean(authHeader());

function authHeader() {
  if (process.env.TRACCAR_TOKEN) return `Bearer ${process.env.TRACCAR_TOKEN}`;
  if (process.env.TRACCAR_USER && process.env.TRACCAR_PASSWORD) {
    return `Basic ${Buffer.from(`${process.env.TRACCAR_USER}:${process.env.TRACCAR_PASSWORD}`).toString('base64')}`;
  }
  return null;
}

async function call(method, path, body) {
  const base = String(process.env.TRACCAR_URL).replace(/\/+$/, '');
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { Authorization: authHeader(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(`Traccar ${method} ${path} -> ${res.status} ${text.slice(0, 120)}`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const findByUniqueId = async (uniqueId) => {
  const list = await call('GET', `/devices?uniqueId=${encodeURIComponent(uniqueId)}`);
  return Array.isArray(list) ? list[0] || null : null;
};

// Returns 'not_configured' | 'synced' | 'failed'. Never throws: a Traccar outage must not block our own API.
export async function registerTraccarDevice({ uniqueId, name }) {
  if (!traccarConfigured()) return 'not_configured';
  try {
    if (!(await findByUniqueId(uniqueId))) await call('POST', '/devices', { name, uniqueId });
    return 'synced';
  } catch (error) {
    console.error(`[Traccar] Could not register device: ${error.message}`);
    return 'failed';
  }
}

export async function removeTraccarDevice(uniqueId) {
  if (!traccarConfigured()) return 'not_configured';
  try {
    const existing = await findByUniqueId(uniqueId);
    if (existing) await call('DELETE', `/devices/${existing.id}`);
    return 'synced';
  } catch (error) {
    console.error(`[Traccar] Could not remove device: ${error.message}`);
    return 'failed';
  }
}
