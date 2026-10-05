import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

let isMongooseConnected = false;
const DATA_FILE = process.env.FLEETNOVA_DATA_FILE || path.join(process.cwd(), 'server', 'data', 'fleetnova_store.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Memory / JSON Store for fallback when live Mongo cluster is not configured
let localStore = {
  organizations: [],
  users: [],
  vehicles: [],
  drivers: [],
  trips: [],
  fuels: [],
  maintenances: [],
  expenses: [],
  notifications: [],
  devices: [],
  positions: [],
  geofences: [],
  deliveries: [],
  invoices: []
};

// Load saved local data if available
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    localStore = JSON.parse(raw);
    if (!localStore.organizations) localStore.organizations = [];
    if (!localStore.devices) localStore.devices = [];
    if (!localStore.positions) localStore.positions = [];
    if (!localStore.geofences) localStore.geofences = [];
    if (!localStore.deliveries) localStore.deliveries = [];
    if (!localStore.invoices) localStore.invoices = [];
  } catch (err) {
    console.warn('Could not parse local data store, starting fresh', err);
  }
}

// Writes are coalesced (GPS ingestion can update the store many times per second) and always flushed
// when the process exits.
let saveTimer = null;

export function flushLocalStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(localStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save local store:', err);
  }
}

export function saveLocalStore() {
  if (saveTimer) return;
  saveTimer = setTimeout(flushLocalStore, 250);
  saveTimer.unref?.();
}

process.on('exit', () => {
  if (saveTimer) flushLocalStore();
});
['SIGINT', 'SIGTERM'].forEach((signal) =>
  process.once(signal, () => {
    flushLocalStore();
    process.exit(0);
  })
);

export function getLocalStore() {
  return localStore;
}

export const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI;

  if (mongoURI && !mongoURI.includes('YOUR_MONGODB_URI')) {
    try {
      const conn = await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000,
      });
      isMongooseConnected = true;
      console.log(`[FLEETNOVA] MongoDB Connected Successfully: ${conn.connection.host}`);
      return conn;
    } catch (error) {
      // REQUIRE_MONGODB=true: never run on the local JSON store by accident (tests, production)
      if (process.env.REQUIRE_MONGODB === 'true') throw error;
      console.warn(`[FLEETNOVA] MongoDB connection failed (${error.message}). Falling back to internal persistent Mongoose-compatible engine.`);
      isMongooseConnected = false;
    }
  } else {
    if (process.env.REQUIRE_MONGODB === 'true') throw new Error('REQUIRE_MONGODB is set but MONGODB_URI is missing');
    console.log('[FLEETNOVA] No remote MONGODB_URI detected. Using internal persistent MERN Data Engine.');
    isMongooseConnected = false;
  }
};

export const isDBConnected = () => isMongooseConnected;
