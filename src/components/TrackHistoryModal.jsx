import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';
import FitBounds from './FitBounds.jsx';
import { trackingApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const RANGES = [
  { id: '1h', hours: 1, label: 'Last hour' },
  { id: '6h', hours: 6, label: 'Last 6 hours' },
  { id: '24h', hours: 24, label: 'Last 24 hours' },
  { id: '7d', hours: 24 * 7, label: 'Last 7 days' }
];

// Route playback for one tracker: the travelled path, distance and start/end time
export default function TrackHistoryModal({ device, onClose }) {
  const { tr } = useT();
  const [range, setRange] = useState('24h');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!device) return undefined;
    let cancelled = false;
    const hours = RANGES.find((r) => r.id === range).hours;
    const to = new Date();
    const from = new Date(to.getTime() - hours * 3600 * 1000);
    setLoading(true);
    setError(null);
    trackingApi
      .history(new URLSearchParams({ deviceId: device._id, from: from.toISOString(), to: to.toISOString() }).toString())
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(tr(err.message || 'Failed to load route history'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [device, range]);

  const path = useMemo(() => (data ? data.points.map((p) => [p.lat, p.lng]) : []), [data]);
  const first = data?.points[0];
  const last = data?.points[data.points.length - 1];

  return (
    <Modal isOpen={Boolean(device)} onClose={onClose} title={`${tr('Route history')}: ${device?.name || ''}`} maxWidth="900px">
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {RANGES.map((r) => (
          <button
            key={r.id}
            className={`btn btn-sm ${range === r.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRange(r.id)}
          >
            {tr(r.label)}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <Loading message={tr('Loading route history...')} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
            <span><strong style={{ color: 'var(--text-primary)' }}>{data?.distanceKm ?? 0} km</strong> {tr('travelled')}</span>
            <span><strong style={{ color: 'var(--text-primary)' }}>{data?.totalPoints ?? 0}</strong> {tr('GPS points')}</span>
            {first && <span>{tr('From')}: {new Date(first.timestamp).toLocaleString()}</span>}
            {last && <span>{tr('To')}: {new Date(last.timestamp).toLocaleString()}</span>}
          </div>

          {path.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              {tr('No GPS points in this period.')}
            </div>
          ) : (
            <div style={{ height: '440px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <MapContainer center={path[0]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds points={path} fitKey={`${device._id}-${range}-${path.length}`} />
                <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4 }} />
                <CircleMarker center={path[0]} radius={8} pathOptions={{ color: '#fff', fillColor: '#10b981', fillOpacity: 1 }}>
                  <Tooltip>{tr('Start')}</Tooltip>
                </CircleMarker>
                <CircleMarker center={path[path.length - 1]} radius={8} pathOptions={{ color: '#fff', fillColor: '#ef4444', fillOpacity: 1 }}>
                  <Tooltip>{tr('End')}</Tooltip>
                </CircleMarker>
              </MapContainer>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
