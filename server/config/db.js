import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

let isMongooseConnected = false;
const DATA_FILE = path.join(process.cwd(), 'server', 'data', 'fleetnova_store.json');

// Ensure data directory exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Memory / JSON Store for fallback when live Mongo cluster is not configured
let localStore = {
  users: [],
  vehicles: [],
  drivers: [],
  trips: [],
  fuels: [],
  maintenances: [],
  expenses: [],
  notifications: []
};

// Load saved local data if available
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    localStore = JSON.parse(raw);
  } catch (err) {
    console.warn('Could not parse local data store, starting fresh', err);
  }
}

export function saveLocalStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(localStore, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save local store:', err);
  }
}

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
      console.warn(`[FLEETNOVA] MongoDB connection failed (${error.message}). Falling back to internal persistent Mongoose-compatible engine.`);
      isMongooseConnected = false;
    }
  } else {
    console.log('[FLEETNOVA] No remote MONGODB_URI detected. Using internal persistent MERN Data Engine.');
    isMongooseConnected = false;
  }
};

export const isDBConnected = () => isMongooseConnected;
