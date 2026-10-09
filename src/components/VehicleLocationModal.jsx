import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink, MapPinOff } from 'lucide-react';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';
import FitBounds from './FitBounds.jsx';
import { vehicleIcon } from './LiveMap.jsx';
import { trackingApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const POLL_MS = 10000;

// Where one vehicle is now: the last position of the tracker linked to it, refreshed while the window is open
export default function VehicleLocationModal({ isOpen, onClose, vehicle }) {
  const { tr } = useT();
  const [state, setState] = useState({ loading: true, position: null, error: null });

  useEffect(() => {
    if (!isOpen || !vehicle?._id) return undefined;
    let cancelled = false;
    setState({ loading: true, position: null, error: null });
    const load = async () => {
      try {
        const res = await trackingApi.live();
        if (cancelled) return;
        const position = (res.data || []).find((p) => String(p.vehicle?._id) === String(vehicle._id)) || null;
        setState({ loading: false, position, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ loading: false, position: s.position, error: tr(err.message || 'Failed to load the position') }));
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, vehicle?._id]);

  const { loading, position: p, error } = state;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${tr('Vehicle location')}: ${vehicle?.registrationNumber || ''}`} maxWidth="780px">
      {loading ? (
        <Loading message={tr('Looking for the vehicle...')} />
      ) : !p ? (
        <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
          <MapPinOff size={40} style={{ display: 'block', margin: '0 auto 0.75rem auto', color: 'var(--text-muted)' }} />
          <strong>{error || tr('No position yet for this vehicle')}</strong>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            {tr('Link a GPS device to this vehicle (GPS Devices page). The position appears after its first report.')}
          </p>
        </div>
      ) : (
        <>
          <div style={{ height: '380px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <MapContainer center={[p.lat, p.lng]} zoom={15} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitBounds points={[[p.lat, p.lng]]} fitKey={vehicle._id} />
              <Marker position={[p.lat, p.lng]} icon={vehicleIcon(p.heading, p.online)} />
            </MapContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginTop: '0.9rem', fontSize: '0.85rem' }}>
            <Fact label={tr('Status')} value={<span className={`badge badge-${p.online ? 'active' : 'inactive'}`}>{p.online ? tr('Online') : tr('Offline')}</span>} />
            <Fact label={tr('Speed')} value={`${p.speed ?? 0} ${tr('km/h')}`} />
            {p.ignition !== null && p.ignition !== undefined && <Fact label={tr('Ignition')} value={p.ignition ? tr('On') : tr('Off')} />}
            <Fact label={tr('Last update')} value={p.timestamp ? new Date(p.timestamp).toLocaleString() : '—'} />
            <Fact label={tr('Coordinates')} value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}</span>} />
          </div>
          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
            <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <ExternalLink size={13} /> {tr('Open in OpenStreetMap')}
            </a>
          </div>
        </>
      )}
    </Modal>
  );
}

function Fact({ label, value }) {
  return (
    <div style={{ padding: '0.6rem 0.8rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 600, marginTop: '0.2rem' }}>{value}</div>
    </div>
  );
}
