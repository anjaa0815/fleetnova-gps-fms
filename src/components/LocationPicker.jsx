import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, MapPin } from 'lucide-react';
import Modal from './Modal.jsx';
import { searchAddress, reverseAddress } from '../utils/geocode.js';
import { useT } from '../i18n/LanguageContext.jsx';

const UB = [47.9188, 106.9176];

// A round letter badge as a map pin (no image files needed)
export const pinIcon = (letter, color = '#2563eb') =>
  L.divIcon({
    className: '',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;box-shadow:0 1px 6px rgba(0,0,0,.5)">${letter}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });

function Clicks({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ point }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [point, map]);
  return null;
}

// Pick a place: search an address or click the map. Gives back { lat, lng, label } where label is the address found.
export default function LocationPicker({ isOpen, onClose, onPick, initial, letter = 'A', title }) {
  const { tr, lang } = useT();
  const [point, setPoint] = useState(null); // { lat, lng, label }
  const [fly, setFly] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setPoint(initial ? { lat: initial.lat, lng: initial.lng, label: initial.label || '' } : null);
    setFly(initial ? { lat: initial.lat, lng: initial.lng } : null);
    setQuery('');
    setResults([]);
    setMessage(null);
  }, [isOpen, initial]);

  const search = async (e) => {
    e?.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setMessage(null);
    try {
      const rows = await searchAddress(query.trim(), lang);
      setResults(rows);
      if (rows.length === 0) setMessage(tr('Nothing found. Try another spelling or click the map.'));
    } catch (err) {
      setMessage(tr(err.message));
    } finally {
      setBusy(false);
    }
  };

  const choose = (r) => {
    setPoint({ lat: r.lat, lng: r.lng, label: r.label });
    setFly({ lat: r.lat, lng: r.lng });
    setResults([]);
  };

  // A click gives the point at once; the address of that point arrives a moment later (when the lookup works)
  const clicked = async (p) => {
    const next = { ...p, label: '' };
    setPoint(next);
    setMessage(null);
    try {
      const label = await reverseAddress(p.lat, p.lng, lang);
      setPoint((cur) => (cur && cur.lat === p.lat && cur.lng === p.lng ? { ...cur, label } : cur));
    } catch { /* the coordinates are enough */ }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || tr('Choose a place on the map')} maxWidth="780px">
      <form onSubmit={search} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input className="form-control" style={{ flex: 1 }} placeholder={tr('Search an address or a place, then press Enter')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className="btn btn-secondary" disabled={busy}>
          <Search size={15} /> {busy ? tr('Searching...') : tr('Search')}
        </button>
      </form>
      {message && <div style={{ fontSize: '0.8rem', color: '#fbbf24', marginBottom: '0.5rem' }}>{message}</div>}
      {results.length > 0 && (
        <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', maxHeight: '170px', overflowY: 'auto' }}>
          {results.map((r) => (
            <div key={`${r.lat},${r.lng}`} onClick={() => choose(r)} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
              <MapPin size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {r.label}
            </div>
          ))}
        </div>
      )}

      <div style={{ height: '380px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <MapContainer center={point ? [point.lat, point.lng] : UB} zoom={point ? 14 : 11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Clicks onPick={clicked} />
          <FlyTo point={fly} />
          {point && <Marker position={[point.lat, point.lng]} icon={pinIcon(letter)} />}
        </MapContainer>
      </div>

      <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)', minHeight: '2.4em' }}>
        {point ? (
          <>
            <strong>{point.label || tr('Selected point')}</strong>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</div>
          </>
        ) : tr('Click the map or search an address to place the pin.')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>{tr('Cancel')}</button>
        <button type="button" className="btn btn-primary" disabled={!point} onClick={() => onPick({ lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)), label: point.label })}>
          {tr('Use this place')}
        </button>
      </div>
    </Modal>
  );
}
