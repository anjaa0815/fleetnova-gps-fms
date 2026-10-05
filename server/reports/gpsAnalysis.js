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

// Incremental analyzer: feed time-ordered points one by one with push() and read the result with finish().
// Memory use is proportional to the number of trips and stops, not to the number of points, so a vehicle can be
// streamed from the database. point: { lat, lng, speed, ignition, timestamp: <ms> }
export function createAnalyzer() {
  const trips = [];
  const stops = [];
  const daily = new Map(); // day -> metres
  let distanceM = 0;
  let drivingMs = 0;
  let maxSpeed = 0;
  let pointCount = 0;
  let firstTs = null;
  let lastTs = null;

  let trip = null; // open trip
  let stopFirst = null; // first stationary point of the current pause
  let votes = { known: 0, on: 0 }; // ignition readings of every point since stopFirst
  let votesAtPrev = { known: 0, on: 0 }; // the same, as of the last accepted point
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

  // The pause lasted from stopFirst to the last accepted point (`prev`)
  const recordStop = () => {
    const first = stopFirst;
    const durationMs = prev.timestamp - first.timestamp;
    if (durationMs < MIN_STOP_MS) return;
    const { known, on } = votesAtPrev;
    const ignitionOn = known > 0 && on / known > 0.5;
    stops.push({
      start: iso(first.timestamp),
      end: iso(prev.timestamp),
      durationMin: round(durationMs / 60000, 1),
      lat: first.lat,
      lng: first.lng,
      ignition: known > 0 ? ignitionOn : null,
      idle: ignitionOn
    });
  };

  const push = (p) => {
    pointCount += 1;
    if (firstTs === null) firstTs = p.timestamp;
    lastTs = p.timestamp;

    const dt = prev ? p.timestamp - prev.timestamp : 0;
    const gap = prev && dt > MAX_GAP_MS;

    if (gap) {
      // unknown time: end the trip / pause where the data stops
      closeTrip(prev);
      if (stopFirst !== null) recordStop();
      stopFirst = null;
      prev = null;
    }

    if (stopFirst !== null && (p.ignition === true || p.ignition === false)) {
      votes.known += 1;
      if (p.ignition) votes.on += 1;
    }

    let meters = 0;
    if (prev && dt > 0) {
      meters = haversineMeters(prev.lat, prev.lng, p.lat, p.lng);
      if ((meters / 1000) / (dt / 3600000) > MAX_JUMP_KMH) return; // GPS glitch: drop the point
    }

    const moving = p.speed >= MOVING_KMH;
    if (p.speed > maxSpeed) maxSpeed = p.speed;

    if (moving) {
      if (stopFirst !== null) {
        // the pause ended when the vehicle moved again (it was last stationary at `prev`)
        if (prev) recordStop();
        stopFirst = null;
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
      if (stopFirst === null) {
        stopFirst = p;
        votes = { known: 0, on: 0 };
        if (p.ignition === true || p.ignition === false) {
          votes.known = 1;
          if (p.ignition) votes.on = 1;
        }
      }
      if (trip && p.timestamp - stopFirst.timestamp >= MIN_STOP_MS) closeTrip(stopFirst);
    }

    prev = p;
    votesAtPrev = { ...votes };
  };

  const finish = () => {
    if (prev) {
      closeTrip(prev);
      if (stopFirst !== null) recordStop();
      stopFirst = null;
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
      pointCount,
      firstSeen: firstTs !== null ? iso(firstTs) : null,
      lastSeen: lastTs !== null ? iso(lastTs) : null,
      trips,
      stops,
      daily: [...daily.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, m]) => ({ date, distanceKm: round(m / 1000, 1) }))
    };
  };

  return { push, finish };
}

// points: [{ lat, lng, speed, ignition, timestamp: <ms> }] sorted ascending
export function analyzePoints(points) {
  const analyzer = createAnalyzer();
  for (const p of points) analyzer.push(p);
  return analyzer.finish();
}
