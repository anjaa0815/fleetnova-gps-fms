const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in metres
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

// Ray casting; polygon is [[lat, lng], ...]. Planar maths is accurate enough for fence-sized shapes.
export function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const crosses = lngI > lng !== lngJ > lng && lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (crosses) inside = !inside;
  }
  return inside;
}

// geofence: { shape: 'circle', center: {lat, lng}, radiusM } | { shape: 'polygon', polygon: [[lat, lng], ...] }
export function isInsideGeofence(geofence, lat, lng) {
  if (geofence.shape === 'circle' && geofence.center) {
    return haversineMeters(lat, lng, geofence.center.lat, geofence.center.lng) <= geofence.radiusM;
  }
  if (geofence.shape === 'polygon' && Array.isArray(geofence.polygon)) {
    return pointInPolygon(lat, lng, geofence.polygon);
  }
  return false;
}
