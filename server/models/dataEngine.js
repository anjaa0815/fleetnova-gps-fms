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

// Helper to generate MongoDB-style ObjectId string
export function generateId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const random = 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
  return timestamp + random;
}

// Populate reference fields in in-memory documents
function populateDoc(collectionName, doc) {
  if (!doc) return doc;
  const store = getLocalStore();
  const copy = { ...doc };

  if (collectionName === 'vehicles') {
    if (copy.assignedDriver && typeof copy.assignedDriver === 'string') {
      copy.assignedDriver = store.drivers.find(
        (d) => d._id === copy.assignedDriver || d.driverId === copy.assignedDriver
      ) || copy.assignedDriver;
    }
  }

  if (collectionName === 'drivers') {
    if (copy.assignedVehicle && typeof copy.assignedVehicle === 'string') {
      copy.assignedVehicle = store.vehicles.find(
        (v) => v._id === copy.assignedVehicle || v.vehicleId === copy.assignedVehicle
      ) || copy.assignedVehicle;
    }
  }

  if (collectionName === 'trips') {
    if (copy.vehicle && typeof copy.vehicle === 'string') {
      copy.vehicle = store.vehicles.find(
        (v) => v._id === copy.vehicle || v.vehicleId === copy.vehicle
      ) || copy.vehicle;
    }
    if (copy.driver && typeof copy.driver === 'string') {
      copy.driver = store.drivers.find(
        (d) => d._id === copy.driver || d.driverId === copy.driver
      ) || copy.driver;
    }
  }

  if (collectionName === 'fuels' || collectionName === 'maintenances' || collectionName === 'expenses') {
    if (copy.vehicle && typeof copy.vehicle === 'string') {
      copy.vehicle = store.vehicles.find(
        (v) => v._id === copy.vehicle || v.vehicleId === copy.vehicle
      ) || copy.vehicle;
    }
    if (copy.driver && typeof copy.driver === 'string') {
      copy.driver = store.drivers.find(
        (d) => d._id === copy.driver || d.driverId === copy.driver
      ) || copy.driver;
    }
    if (copy.trip && typeof copy.trip === 'string') {
      copy.trip = store.trips.find(
        (t) => t._id === copy.trip || t.tripId === copy.trip
      ) || copy.trip;
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
        default: return null;
      }
    }
    return null;
  },

  async find(collectionName, filter = {}, options = {}) {
    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      let query = Model.find(filter);
      if (options.populate) {
        if (Array.isArray(options.populate)) {
          options.populate.forEach(p => { query = query.populate(p); });
        } else {
          query = query.populate(options.populate);
        }
      }
      if (options.sort) query = query.sort(options.sort);
      if (options.skip) query = query.skip(options.skip);
      if (options.limit) query = query.limit(options.limit);
      return await query.exec();
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    let matched = items.filter((doc) => matchFilter(doc, filter));

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

    const total = matched.length;
    if (options.skip) {
      matched = matched.slice(options.skip);
    }
    if (options.limit) {
      matched = matched.slice(0, options.limit);
    }

    return matched.map((doc) => populateDoc(collectionName, doc));
  },

  async findOne(collectionName, filter = {}, options = {}) {
    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      let query = Model.findOne(filter);
      if (options.select) query = query.select(options.select);
      if (options.populate) query = query.populate(options.populate);
      return await query.exec();
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const item = items.find((doc) => matchFilter(doc, filter));
    return item ? populateDoc(collectionName, item) : null;
  },

  async findById(collectionName, id, options = {}) {
    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      let query = Model.findById(id);
      if (options.populate) query = query.populate(options.populate);
      return await query.exec();
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const item = items.find((doc) => doc._id === id || doc.id === id);
    return item ? populateDoc(collectionName, item) : null;
  },

  async create(collectionName, data) {
    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.create(data);
    }

    const store = getLocalStore();
    if (!store[collectionName]) store[collectionName] = [];

    const newDoc = {
      _id: generateId(),
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store[collectionName].unshift(newDoc);
    saveLocalStore();
    return populateDoc(collectionName, newDoc);
  },

  async findByIdAndUpdate(collectionName, id, updateData, options = {}) {
    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.findByIdAndUpdate(id, updateData, { new: true, ...options });
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const index = items.findIndex((doc) => doc._id === id || doc.id === id);
    if (index === -1) return null;

    items[index] = {
      ...items[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    saveLocalStore();
    return populateDoc(collectionName, items[index]);
  },

  async findByIdAndDelete(collectionName, id) {
    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.findByIdAndDelete(id);
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    const index = items.findIndex((doc) => doc._id === id || doc.id === id);
    if (index === -1) return null;

    const [removed] = items.splice(index, 1);
    saveLocalStore();
    return removed;
  },

  async countDocuments(collectionName, filter = {}) {
    if (isDBConnected()) {
      const Model = await this.getCollection(collectionName);
      return await Model.countDocuments(filter);
    }

    const store = getLocalStore();
    const items = store[collectionName] || [];
    return items.filter((doc) => matchFilter(doc, filter)).length;
  }
};
