import { DataEngine } from '../models/dataEngine.js';
import { analyzePoints, dayKey } from '../reports/gpsAnalysis.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 31 * DAY_MS;
const ALERT_TYPES = ['speeding', 'geofence_enter', 'geofence_exit'];

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const idOf = (ref) => String(ref?._id || ref || '');

function parseRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to.getTime() - 7 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return { error: 'Invalid time range' };
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) return { error: 'Time range cannot exceed 31 days' };
  return { from, to };
}

// Builds the report data for one organization (must run inside the tenant context)
export async function buildGpsReport({ from, to, vehicleId }) {
  const vehicles = vehicleId ? [await DataEngine.findById('vehicles', vehicleId)].filter(Boolean) : await DataEngine.find('vehicles');

  const positionFilter = { timestamp: { $gte: from, $lte: to } };
  if (vehicleId) positionFilter.vehicle = String(vehicleId);
  const positions = await DataEngine.find('positions', positionFilter, { sort: { timestamp: 1 } });

  const byVehicle = new Map();
  for (const p of positions) {
    const id = idOf(p.vehicle);
    if (!id) continue; // positions of trackers that were not linked to a vehicle
    if (!byVehicle.has(id)) byVehicle.set(id, []);
    byVehicle.get(id).push({
      lat: p.lat,
      lng: p.lng,
      speed: p.speed || 0,
      ignition: p.ignition,
      timestamp: new Date(p.timestamp).getTime()
    });
  }

  // fuel purchases and alerts in the same period, per vehicle
  const fuels = await DataEngine.find('fuels', { date: { $gte: from, $lte: to } });
  const fuelByVehicle = new Map();
  fuels.forEach((f) => {
    const id = idOf(f.vehicle);
    const entry = fuelByVehicle.get(id) || { liters: 0, cost: 0 };
    entry.liters += f.quantity || 0;
    entry.cost += f.totalCost || 0;
    fuelByVehicle.set(id, entry);
  });

  const alerts = await DataEngine.find('notifications', { createdAt: { $gte: from, $lte: to } });
  const alertsByVehicle = new Map();
  alerts
    .filter((n) => ALERT_TYPES.includes(n.type))
    .forEach((n) => {
      const entry = alertsByVehicle.get(String(n.relatedEntityId)) || { speeding: 0, geofence: 0 };
      if (n.type === 'speeding') entry.speeding += 1;
      else entry.geofence += 1;
      alertsByVehicle.set(String(n.relatedEntityId), entry);
    });

  const rows = vehicles.map((vehicle) => {
    const id = String(vehicle._id);
    const analysis = analyzePoints(byVehicle.get(id) || []);
    const fuel = fuelByVehicle.get(id) || { liters: 0, cost: 0 };
    const alertCounts = alertsByVehicle.get(id) || { speeding: 0, geofence: 0 };
    return {
      vehicleId: id,
      registrationNumber: vehicle.registrationNumber,
      brand: vehicle.brand,
      model: vehicle.model,
      ...analysis,
      fuelLiters: round(fuel.liters, 1),
      fuelCost: Math.round(fuel.cost),
      // km per litre from GPS distance and fuel purchases in the same period (only meaningful over longer periods)
      kmPerLiter: fuel.liters > 0 && analysis.distanceKm > 0 ? round(analysis.distanceKm / fuel.liters, 2) : null,
      speedingAlerts: alertCounts.speeding,
      geofenceAlerts: alertCounts.geofence
    };
  });

  // fleet totals and daily distance
  const dailyTotals = new Map();
  rows.forEach((r) => r.daily.forEach((d) => dailyTotals.set(d.date, (dailyTotals.get(d.date) || 0) + d.distanceKm)));
  const dailyAll = [];
  // include days without movement so the chart has no holes
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const key = dayKey(t);
    if (!dailyAll.some((d) => d.date === key)) dailyAll.push({ date: key, distanceKm: round(dailyTotals.get(key) || 0, 1) });
  }
  const lastKey = dayKey(to.getTime());
  if (!dailyAll.some((d) => d.date === lastKey)) dailyAll.push({ date: lastKey, distanceKm: round(dailyTotals.get(lastKey) || 0, 1) });

  const sum = (key) => rows.reduce((total, r) => total + (r[key] || 0), 0);
  const fuelLiters = sum('fuelLiters');
  const distanceKm = sum('distanceKm');
  const summary = {
    vehicles: rows.length,
    activeVehicles: rows.filter((r) => r.pointCount > 0).length,
    distanceKm: round(distanceKm, 1),
    tripCount: sum('tripCount'),
    drivingMin: sum('drivingMin'),
    stopMin: sum('stopMin'),
    idleMin: sum('idleMin'),
    maxSpeed: rows.reduce((m, r) => Math.max(m, r.maxSpeed), 0),
    speedingAlerts: sum('speedingAlerts'),
    geofenceAlerts: sum('geofenceAlerts'),
    fuelLiters: round(fuelLiters, 1),
    fuelCost: sum('fuelCost'),
    kmPerLiter: fuelLiters > 0 && distanceKm > 0 ? round(distanceKm / fuelLiters, 2) : null
  };

  return { rows, summary, daily: dailyAll.sort((a, b) => (a.date < b.date ? -1 : 1)) };
}

// @desc GPS usage report: distance, trips, stops, speeding and fuel per vehicle
// @route GET /api/reports/gps?from=&to=&vehicleId=
export const getGpsReport = async (req, res, next) => {
  try {
    const range = parseRange(req.query);
    if (range.error) return res.status(400).json({ success: false, message: range.error });

    const { vehicleId } = req.query;
    if (vehicleId && !(await DataEngine.findById('vehicles', vehicleId))) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const report = await buildGpsReport({ from: range.from, to: range.to, vehicleId });
    const detail = vehicleId ? report.rows[0] : null;

    res.status(200).json({
      success: true,
      data: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        summary: report.summary,
        daily: detail ? detail.daily : report.daily,
        // trips and stops are only returned for a single vehicle (they can be long lists)
        vehicles: report.rows.map(({ trips, stops, daily, ...row }) => row).sort((a, b) => b.distanceKm - a.distanceKm),
        trips: detail ? detail.trips.slice(-500).reverse() : undefined,
        stops: detail ? detail.stops.slice(-500).reverse() : undefined
      }
    });
  } catch (error) {
    next(error);
  }
};

// CSV cells starting with = + - @ are executed as formulas by spreadsheet programs
const cell = (value) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (header, rows) => `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

// @desc CSV export of the GPS report ("vehicles" summary, or "trips" / "stops" of one vehicle)
// @route GET /api/reports/gps.csv?from=&to=&vehicleId=&type=vehicles|trips|stops
export const exportGpsReport = async (req, res, next) => {
  try {
    const range = parseRange(req.query);
    if (range.error) return res.status(400).json({ success: false, message: range.error });
    const { vehicleId } = req.query;
    const type = ['trips', 'stops'].includes(req.query.type) ? req.query.type : 'vehicles';
    if (type !== 'vehicles' && !vehicleId) {
      return res.status(400).json({ success: false, message: 'vehicleId is required for trips and stops' });
    }
    if (vehicleId && !(await DataEngine.findById('vehicles', vehicleId))) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const report = await buildGpsReport({ from: range.from, to: range.to, vehicleId });
    let csv;
    if (type === 'trips') {
      csv = toCsv(
        ['Start', 'End', 'Distance km', 'Duration min', 'Max speed km/h', 'Avg speed km/h', 'Start lat', 'Start lng', 'End lat', 'End lng'],
        report.rows[0].trips.map((t) => [t.start, t.end, t.distanceKm, t.durationMin, t.maxSpeed, t.avgSpeed, t.startLat, t.startLng, t.endLat, t.endLng])
      );
    } else if (type === 'stops') {
      csv = toCsv(
        ['Start', 'End', 'Duration min', 'Idling (engine on)', 'Lat', 'Lng'],
        report.rows[0].stops.map((s) => [s.start, s.end, s.durationMin, s.idle ? 'yes' : 'no', s.lat, s.lng])
      );
    } else {
      csv = toCsv(
        ['Vehicle', 'Distance km', 'Trips', 'Driving min', 'Stopped min', 'Idling min', 'Max speed km/h', 'Avg speed km/h', 'Speeding alerts', 'Geofence alerts', 'Fuel litres', 'Fuel cost', 'km per litre'],
        report.rows.map((r) => [r.registrationNumber, r.distanceKm, r.tripCount, r.drivingMin, r.stopMin, r.idleMin, r.maxSpeed, r.avgSpeed, r.speedingAlerts, r.geofenceAlerts, r.fuelLiters, r.fuelCost, r.kmPerLiter])
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="gps-${type}-${range.from.toISOString().slice(0, 10)}_${range.to.toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
};
