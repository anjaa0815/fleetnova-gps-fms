import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// Zooms the map to the given [lat, lng] points. `fitKey` changes -> fit again (e.g. new route selected).
export default function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 13));
    } else {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}
