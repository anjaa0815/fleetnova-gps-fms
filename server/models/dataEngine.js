import mongoose from 'mongoose';
import { isDBConnected, getLocalStore, saveLocalStore } from '../config/db.js';
import User from './User.js';
import Vehicle from './Vehicle.js';
import Driver from './Driver.js';
import Trip from './Trip.js';
import Fuel from './Fuel.js';
import Maintenance from './Maintenance.js';
import Expense from './Expense.js';
import Notification from './Notification.js';
import Organization from './Organization.js';
import Device from './Device.js';
import Position from './Position.js';
import Geofence from './Geofence.js';
import Delivery from './Delivery.js';
import { getTenantContext } from '../middleware/tenantContext.js';

// Helper to generate MongoDB-style ObjectId string
export function generateId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const random = 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
  return timestamp + random;
}

// Collections whose documents belong to exactly one organization (tenant).
// Every query on these is scoped to the caller's organization by the data layer.
export const TENANT_COLLECTIONS = new Set([
  'users',
  'vehicles',
  'drivers',
  'trips',
  'fuels',
  'maintenances',
  'expenses',
  'notifications',
  'devices',
  'positions',
  'geofences',
  'deliveries'
]);

function forbidden(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

// Resolve the extra filter that must be applied for the current request.
//   no tenant context  -> trusted internal code (login lookup, seeding): unscoped
//   organization user  -> always { orgId }
//   platform user      -> users and counts only; tenant data is off limits
function resolveScope(collectionName, op) {
  const ctx = getTenantContext();
  if (!ctx || !TENANT_COLLECTIONS.has(collectionName)) return {};
  if (ctx.platform) {
    if (collectionName === 'users' || op === 'count') return {};
    throw forbidden('Platform accounts cannot access organization data');
  }
  return { orgId: ctx.orgId };
}

const sameOrg = (doc, scope) => !scope.orgId || String(doc.orgId) === String(scope.orgId);

// Restrict Mongoose populate() to documents of the caller's organization
function scopePopulate(populate, scope) {
  if (!populate || !scope.orgId) return populate;
  const wrap = (p) => (typeof p === 'string' ? { path: p, match: { orgId: scope.orgId } } : { ...p, match: { ...(p.match || {}), orgId: scope.orgId } });
  return Array.isArray(populate) ? populate.map(wrap) : wrap(populate);
}

// Populate reference fields in in-memory documents (only within the document's own organization)
function populateDoc(collectionName, doc) {
  if (!doc) return doc;
  const store = getLocalStore();
  const copy = { ...doc };
  const scope = { orgId: copy.orgId };
  const lookup = (list, ref, idKey) =>
    (list || []).find((x) => (x._id === ref || x[idKey] === ref) && sameOrg(x, scope)) || ref;

  if (collectionName === 'devices') {
    if (copy.vehicle && typeof copy.vehicle === 'string') {
      copy.vehicle = lookup(store.vehicles, copy.vehicle, 'vehicleId');
    }
  }

  if (collectionName === 'vehicles') {
    if (copy.assignedDriver && typeof copy.assignedDriver === 'string') {
      copy.assignedDriver = lookup(store.drivers, copy.assignedDriver, 'driverId');
    }
  }

  if (collectionName === 'drivers') {
    if (copy.assignedVehicle && typeof copy.assignedVehicle === 'string') {
      copy.assignedVehicle = lookup(store.vehicles, copy.assignedVehicle, 'vehicleId');
    }
  }

  if (collectionName === 'trips') {
    if (copy.vehicle && typeof copy.vehicle === 'string') {
      copy.vehicle = lookup(store.vehicles, copy.vehicle, 'vehicleId');
    }
    if (copy.driver && typeof copy.driver === 'string') {
      copy.driver = lookup(store.drivers, copy.driver, 'driverId');
    }
  }

  if (collectionName === 'fuels' || collectionName === 'maintenances' || collectionName === 'expenses') {
    if (copy.vehicle && typeof copy.vehicle === 'string') {
      copy.vehicle = lookup(store.vehicles, copy.vehicle, 'vehicleId');
    }
    if (copy.driver && typeof copy.driver === 'string') {
      copy.driver = lookup(store.drivers, copy.driver, 'driverId');
    }
    if (copy.trip && typeof copy.trip === 'string') {
      copy.trip = lookup(store.trips, copy.trip, 'tripId');
    }
  }

  return copy;
}

// Check match with Mongo filter
function matchFilter(doc, filter = {}) {
  if (!filter || Object.keys(filter).length === 0) return true;

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$or' && Array.isArray(value)) {
      const orMatched = value.some((subFilter) => matchFilter(doc, subFilter));
      if (!orMatched) return false;
      continue;
    }

    const docVal = doc[key];

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if ('$regex' in value) {
        const regex = new RegExp(value.$regex, value.$options || 'i');
        if (!regex.test(String(docVal || ''))) return false;
      }
      if ('$in' in value) {
        if (!value.$in.includes(docVal)) return false;
      }
      if ('$ne' in value) {
        if (docVal === value.$ne) return false;
      }
      if ('$gte' in value) {
        const compareVal = value.$gte instanceof Date ? value.$gte.getTime() : value.$gte;
        const targetVal = new Date(docVal).getTime();
        if (targetVal < compareVal) return false;
      }
      if ('$lte' in value) {
        const compareVal = value.$lte instanceof Date ? value.$lte.getTime() : value.$lte;
        const targetVal = new Date(docVal).getTime();
        if (targetVal > compareVal) return false;
      }
      if ('$gt' in value) {
        if (docVal <= value.$gt) return false;
      }
      if ('$lt' in value) {
        if (docVal >= value.$lt) return false;
      }
    } else if (value !== undefined) {
      if (String(docVal) !== String(value)) return false;
    }
  }
  return true;
}

export const DataEngine = {
  async getCollection(name) {
    if (isDBConnected()) {
      switch (name) {
        case 'users': return User;
        case 'vehicles': return Vehicle;
        case 'drivers': return Driver;
        case 'trips': return Trip;
        case 'fuels': return Fuel;
        case 'maintenances': return Maintenance;
        case 'expenses': return Expense;
        case 'notifications': return Notification;
        case 'organizations': return Organization;
        case 'devices': return Device;
        case 'positions': return Position;
        case 'geofences': return Geofence;
        case 'deliveries': return Delivery;
        default: return null;
      }
    }
    return null;
  },

  async find(collectionName, filter = {}, options = {}) {
    const scope = resolveScope(collectionName, 'read');
    const scopedFilter = { ...filter, ...scope };

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      let query = Model.find(scopedFilter);
      const populate = scopePopulate(options.populate, scope);
      if (populate) {
        if (Array.isArray(populate)) {
          populate.forEach(p => { query = query.populate(p); });
        } else {
          query = query.populate(populate);
        }
      }
      if (options.sort) query = query.sort(options.sort);
      if (options.skip) query = query.skip(options.skip);
      if (options.limit) query = query.limit(options.limit);
      return await query.exec();
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    let matched = items.filter((doc) => matchFilter(doc, scopedFilter));

    // Sort
    if (options.sort) {
      const [field, direction] = Object.entries(options.sort)[0] || ['createdAt', -1];
      const dir = direction === -1 || direction === 'desc' ? -1 : 1;
      matched.sort((a, b) => {
        if (a[field] < b[field]) return -1 * dir;
        if (a[field] > b[field]) return 1 * dir;
        return 0;
      });
    } else {
      matched.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    if (options.skip) {
      matched = matched.slice(options.skip);
    }
    if (options.limit) {
      matched = matched.slice(0, options.limit);
    }

    return matched.map((doc) => populateDoc(collectionName, doc));
  },

  async findOne(collectionName, filter = {}, options = {}) {
    const scope = resolveScope(collectionName, 'read');
    const scopedFilter = { ...filter, ...scope };

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      let query = Model.findOne(scopedFilter);
      if (options.select) query = query.select(options.select);
      const populate = scopePopulate(options.populate, scope);
      if (populate) query = query.populate(populate);
      return await query.exec();
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const item = items.find((doc) => matchFilter(doc, scopedFilter));
    return item ? populateDoc(collectionName, item) : null;
  },

  async findById(collectionName, id, options = {}) {
    const scope = resolveScope(collectionName, 'read');

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      let query = Model.findOne({ _id: id, ...scope });
      const populate = scopePopulate(options.populate, scope);
      if (populate) query = query.populate(populate);
      return await query.exec();
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const item = items.find((doc) => (doc._id === id || doc.id === id) && sameOrg(doc, scope));
    return item ? populateDoc(collectionName, item) : null;
  },

  async create(collectionName, data) {
    const ctx = getTenantContext();
    let payload = { ...data };

    if (TENANT_COLLECTIONS.has(collectionName)) {
      if (ctx && !ctx.platform) {
        // Organization users can only ever create documents inside their own organization
        payload.orgId = ctx.orgId;
      } else if (!('orgId' in payload)) {
        throw new Error(`orgId is required to create ${collectionName}`);
      }
    }

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.create(payload);
    }

    const store = getLocalStore();
    if (!store[collectionName]) store[collectionName] = [];

    const newDoc = {
      _id: generateId(),
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store[collectionName].unshift(newDoc);
    saveLocalStore();
    return populateDoc(collectionName, newDoc);
  },

  // Bulk insert for high-volume data (GPS positions). Same tenant rules as create().
  async createMany(collectionName, docs) {
    if (!docs.length) return [];
    const ctx = getTenantContext();
    const payloads = docs.map((data) => {
      const payload = { ...data };
      if (TENANT_COLLECTIONS.has(collectionName)) {
        if (ctx && !ctx.platform) {
          payload.orgId = ctx.orgId;
        } else if (!('orgId' in payload)) {
          throw new Error(`orgId is required to create ${collectionName}`);
        }
      }
      return payload;
    });

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.insertMany(payloads);
    }

    const store = getLocalStore();
    if (!store[collectionName]) store[collectionName] = [];
    const now = new Date().toISOString();
    const created = payloads.map((payload) => ({ _id: generateId(), ...payload, createdAt: now, updatedAt: now }));
    store[collectionName].push(...created);
    saveLocalStore();
    return created;
  },

  async findByIdAndUpdate(collectionName, id, updateData, options = {}) {
    const scope = resolveScope(collectionName, 'write');
    const safeUpdate = { ...updateData };
    if (getTenantContext()) {
      // Documents can never be moved to another organization through a request
      delete safeUpdate.orgId;
      delete safeUpdate._id;
    }

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.findOneAndUpdate({ _id: id, ...scope }, safeUpdate, { new: true, ...options });
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const index = items.findIndex((doc) => (doc._id === id || doc.id === id) && sameOrg(doc, scope));
    if (index === -1) return null;

    items[index] = {
      ...items[index],
      ...safeUpdate,
      updatedAt: new Date().toISOString()
    };

    saveLocalStore();
    return populateDoc(collectionName, items[index]);
  },

  async findByIdAndDelete(collectionName, id) {
    const scope = resolveScope(collectionName, 'write');

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.findOneAndDelete({ _id: id, ...scope });
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const index = items.findIndex((doc) => (doc._id === id || doc.id === id) && sameOrg(doc, scope));
    if (index === -1) return null;

    const [removed] = items.splice(index, 1);
    saveLocalStore();
    return removed;
  },

  // Deletes every matching document inside the caller's scope. Returns how many were removed.
  async deleteMany(collectionName, filter = {}) {
    const scope = resolveScope(collectionName, 'write');
    const scopedFilter = { ...filter, ...scope };

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      const result = await Model.deleteMany(scopedFilter);
      return result.deletedCount || 0;
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const kept = items.filter((doc) => !matchFilter(doc, scopedFilter));
    const removed = items.length - kept.length;
    if (removed > 0) {
      store[collectionName] = kept;
      saveLocalStore();
    }
    return removed;
  },

  async countDocuments(collectionName, filter = {}) {
    const scope = resolveScope(collectionName, 'count');
    const scopedFilter = { ...filter, ...scope };

    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.countDocuments(scopedFilter);
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    return items.filter((doc) => matchFilter(doc, scopedFilter)).length;
  }
};
