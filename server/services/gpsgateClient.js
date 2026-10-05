// Read-only client for the GpsGate REST API (https://support.gpsgate.com/hc/en-us/articles/360019290713).
// Our trackers stay connected to the GpsGate server; FLEETNOVA pulls their latest positions from it and runs them
// through the normal ingestion (alerts, trips, reports). Credentials come from the environment only.
const TIMEOUT_MS = 15000;
const TOKEN_TTL_MS = 30 * 60 * 1000;

let token = null;
let tokenAt = 0;
let loginPromise = null;

export const gpsgateConfig = () => ({
  baseUrl: String(process.env.GPSGATE_URL || '').replace(/\/+$/, ''),
  appId: process.env.GPSGATE_APP_ID || '',
  username: process.env.GPSGATE_USERNAME || '',
  password: process.env.GPSGATE_PASSWORD || ''
});

export const gpsgateConfigured = () => {
  const c = gpsgateConfig();
  return Boolean(c.baseUrl && c.appId && c.username && c.password);
};

async function request(method, path, { body, auth = true } = {}) {
  const { baseUrl } = gpsgateConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(auth ? { Authorization: token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const error = new Error(`GpsGate ${method} ${path} -> ${res.status} ${text.slice(0, 120)}`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function login(force = false) {
  if (!force && token && Date.now() - tokenAt < TOKEN_TTL_MS) return token;
  if (!loginPromise) {
    const { appId, username, password } = gpsgateConfig();
    loginPromise = request('POST', `/applications/${appId}/tokens`, { body: { username, password }, auth: false })
      .then((data) => {
        const value = typeof data === 'string' ? data : data?.token;
        if (!value) throw new Error('GpsGate login returned no token');
        token = value;
        tokenAt = Date.now();
        return token;
      })
      .finally(() => {
        loginPromise = null;
      });
  }
  return loginPromise;
}

// GET with a token; one re-login when the token has expired on the GpsGate side
async function get(path) {
  await login();
  try {
    return await request('GET', path);
  } catch (error) {
    if (error.status !== 401) throw error;
    await login(true);
    return request('GET', path);
  }
}

export function resetGpsgateSession() {
  token = null;
  tokenAt = 0;
}

const KMH_PER_UNIT = { ms: 3.6, kmh: 1, knots: 1.852 };

const number = (value) => {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? n : null;
};

// GpsGate reports "never" as 0001-01-01
const parseUtc = (value) => {
  if (!value || String(value).startsWith('0001')) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function ignitionFrom(variables) {
  for (const v of Array.isArray(variables) ? variables : []) {
    const name = String(v?.name || '').toLowerCase();
    if (name.includes('ignition') || name === 'din1') {
      const raw = String(v.value).toLowerCase();
      return raw === '1' || raw === 'true';
    }
  }
  return null;
}

// One usersstatus entry -> ingestion record (or null when the unit has no usable fix)
export function toRecord(status, speedUnit = process.env.GPSGATE_SPEED_UNIT || 'ms') {
  // Depending on the GpsGate version the fix is nested in trackPoint or sits on the status itself
  const point = status?.trackPoint && typeof status.trackPoint === 'object' ? status.trackPoint : status || {};
  if (point.valid === false) return null;
  const timestamp = parseUtc(point.utc ?? point.uTC ?? status?.utc);
  const lat = number(point.position?.latitude);
  const lng = number(point.position?.longitude);
  if (!timestamp || lat == null || lng == null) return null;
  const speed = number(point.velocity?.groundSpeed ?? point.velocity?.speed) ?? 0;
  const ignition = ignitionFrom(status.variables);
  return {
    timestamp,
    lat,
    lng,
    speed: speed * (KMH_PER_UNIT[speedUnit] ?? KMH_PER_UNIT.ms),
    heading: number(point.velocity?.heading) ?? 0,
    altitude: number(point.position?.altitude) ?? 0,
    satellites: 0,
    io: ignition == null ? {} : { 239: ignition ? 1 : 0 }
  };
}

// All units of the GpsGate application with their identifier (the tracker IMEI when GpsGate knows it)
export async function fetchGpsgateUnits() {
  const { appId } = gpsgateConfig();
  const [statuses, users] = await Promise.all([
    get(`/applications/${appId}/usersstatus`),
    get(`/applications/${appId}/users`).catch(() => [])
  ]);
  const byId = new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u]));
  return (Array.isArray(statuses) ? statuses : []).map((status) => {
    const user = byId.get(status.id) || {};
    const device = Array.isArray(user.devices) ? user.devices[0] || {} : {};
    return {
      gpsgateId: status.id,
      imei: String(device.imei || status.username || user.username || `gpsgate-${status.id}`).trim(),
      name: String(status.name || user.name || `GpsGate ${status.id}`).trim(),
      record: toRecord(status)
    };
  });
}
