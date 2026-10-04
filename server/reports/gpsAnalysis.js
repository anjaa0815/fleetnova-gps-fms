import { haversineMeters } from '../gps/geometry.js';

// Turns a vehicle's time-ordered GPS points into trips, stops and distance.
//
//   moving      speed >= MOVING_KMH
//   stop        stationary for at least MIN_STOP_MS (shorter pauses - traffic lights - stay inside the trip)
//   data gap    no report for MAX_GAP_MS: nothing is assumed about that time (no distance, trip/stop ends)
//   glitch      a jump implying more than MAX_JUMP_KMH is ignored
//   drift       distance between stationary reports is not counted
export const MOVING_KMH = 3;
export const MIN_STOP_MS = 5 * 60 * 1000;
export const MAX_GAP_MS = 30 * 60 * 1000;
export const MAX_JUMP_KMH = 250;
export const MIN_TRIP_KM = 0.1;

const TIME_ZONE = process.env.ALERT_TIME_ZONE || 'Asia/Ulaanbaatar';
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (ms) => dayFormatter.format(new Date(ms));

const iso = (ms) => new Date(ms).toISOString();
const round = (n, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

// points: [{ lat, lng, speed, ignition, timestamp: <ms> }] sorted ascending
export function analyzePoints(points) {
  const trips = [];
  const stops = [];
  const daily = new Map(); // day -> km
  let distanceM = 0;
  let drivingMs = 0;
  let maxSpeed = 0;

  let trip = null; // open trip
  let stopStart = null; // index of the first stationary point of the current pause
  let prev = null;

  const addDistance = (meters, ms) => {
    distanceM += meters;
    const key = dayKey(ms);
    daily.set(key, (daily.get(key) || 0) + meters);
    if (trip) trip.distanceM += meters;
  };

  const closeTrip = (endPoint) => {
    if (!trip) return;
    const km = trip.distanceM / 1000;
    if (km >= MIN_TRIP_KM) {
      const durationMs = endPoint.timestamp - trip.start.timestamp;
      trips.push({
        start: iso(trip.start.timestamp),
        end: iso(endPoint.timestamp),
        startLat: trip.start.lat,
        startLng: trip.start.lng,
        endLat: endPoint.lat,
        endLng: endPoint.lng,
        distanceKm: round(km, 2),
        durationMin: round(durationMs / 60000, 1),
        maxSpeed: trip.maxSpeed,
        avgSpeed: durationMs > 0 ? round(km / (durationMs / 3600000), 1) : 0
      });
    }
    trip = null;
  };

  const recordStop = (fromIdx, toPoint) => {
    const first = points[fromIdx];
    const durationMs = toPoint.timestamp - first.timestamp;
    if (durationMs < MIN_STOP_MS) return;
    const slice = points.filter((p) => p.timestamp >= first.timestamp && p.timestamp <= toPoint.timestamp);
    const known = slice.filter((p) => p.ignition === true || p.ignition === false);
    const ignitionOn = known.length > 0 && known.filter((p) => p.ignition).length / known.length > 0.5;
    stops.push({
      start: iso(first.timestamp),
      end: iso(toPoint.timestamp),
      durationMin: round(durationMs / 60000, 1),
      lat: first.lat,
      lng: first.lng,
      ignition: known.length > 0 ? ignitionOn : null,
      idle: ignitionOn
    });
  };

  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const dt = prev ? p.timestamp - prev.timestamp : 0;
    const gap = prev && dt > MAX_GAP_MS;

    if (gap) {
      // unknown time: end the trip / pause where the data stops
      closeTrip(prev);
      if (stopStart !== null) recordStop(stopStart, prev);
      stopStart = null;
      prev = null;
    }

    let meters = 0;
    if (prev && dt > 0) {
      meters = haversineMeters(prev.lat, prev.lng, p.lat, p.lng);
      if ((meters / 1000) / (dt / 3600000) > MAX_JUMP_KMH) continue; // GPS glitch: drop the point
    }

    const moving = p.speed >= MOVING_KMH;
    if (p.speed > maxSpeed) maxSpeed = p.speed;

    if (moving) {
      if (stopStart !== null) {
        // the pause ended when the vehicle moved again (it was last stationary at `prev`)
        if (prev) recordStop(stopStart, prev);
        stopStart = null;
      }
      if (!trip) {
        const origin = prev && prev.speed < MOVING_KMH ? prev : p;
        trip = { start: origin, distanceM: 0, maxSpeed: 0 };
      }
      trip.maxSpeed = Math.max(trip.maxSpeed, p.speed);
      if (prev) drivingMs += dt;
    }

    // distance only while the vehicle moves (ignores GPS drift between stationary reports)
    if (prev && (moving || prev.speed >= MOVING_KMH)) addDistance(meters, p.timestamp);

    if (!moving) {
      if (stopStart === null) stopStart = i;
      if (trip && p.timestamp - points[stopStart].timestamp >= MIN_STOP_MS) closeTrip(points[stopStart]);
    }

    prev = p;
  }

  if (prev) {
    closeTrip(prev);
    if (stopStart !== null) recordStop(stopStart, prev);
  }

  const idleMs = stops.filter((s) => s.idle).reduce((sum, s) => sum + s.durationMin * 60000, 0);
  const stopMs = stops.reduce((sum, s) => sum + s.durationMin * 60000, 0);
  const km = distanceM / 1000;

  return {
    distanceKm: round(km, 1),
    tripCount: trips.length,
    drivingMin: Math.round(drivingMs / 60000),
    stopMin: Math.round(stopMs / 60000),
    idleMin: Math.round(idleMs / 60000),
    maxSpeed,
    avgSpeed: drivingMs > 0 ? round(km / (drivingMs / 3600000), 1) : 0,
    pointCount: points.length,
    firstSeen: points.length ? iso(points[0].timestamp) : null,
    lastSeen: points.length ? iso(points[points.length - 1].timestamp) : null,
    trips,
    stops,
    daily: [...daily.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, m]) => ({ date, distanceKm: round(m / 1000, 1) }))
  };
}
