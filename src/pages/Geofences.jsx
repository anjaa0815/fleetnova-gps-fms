import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinned, Plus, Trash2, Undo2 } from 'lucide-react';
import FitBounds from '../components/FitBounds.jsx';
import Loading from '../components/Loading.jsx';
import { geofenceApi, vehicleApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const UB = [47.9188, 106.9176];

const newDraft = () => ({
  _id: null,
  name: '',
  shape: 'circle',
  center: null,
  radiusM: 500,
  polygon: [],
  alertOnEnter: true,
  alertOnExit: true,
  color: '#2563eb',
  vehicles: [],
  active: true
});

const fromGeofence = (g) => ({
  _id: g._id,
  name: g.name,
  shape: g.shape,
  center: g.center,
  radiusM: g.radiusM || 500,
  polygon: g.polygon || [],
  alertOnEnter: g.alertOnEnter,
  alertOnExit: g.alertOnExit,
  color: g.color,
  vehicles: g.vehicles || [],
  active: g.active
});

// Click on the map to place the circle centre / add polygon points while editing
function MapClicks({ draft, onChange }) {
  useMapEvents({
    click(e) {
      if (!draft) return;
      const { lat, lng } = e.latlng;
      if (draft.shape === 'circle') onChange({ ...draft, center: { lat, lng } });
      else onChange({ ...draft, polygon: [...draft.polygon, [lat, lng]] });
    }
  });
  return null;
}

const boxStyle = { padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' };

export default function Geofences() {
  const { tr } = useT();
  const [geofences, setGeofences] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fitKey, setFitKey] = useState(0);

  const load = async () => {
    try {
      const [g, v] = await Promise.all([geofenceApi.getAll(), vehicleApi.getAll('limit=500')]);
      setGeofences(g.data);
      setVehicles(v.data);
      setFitKey((k) => k + 1);
    } catch (err) {
      setError(tr(err.message || 'Failed to load geofences'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fitPoints = useMemo(() => {
    const pts = [];
    geofences.forEach((g) => {
      if (g.shape === 'circle' && g.center) pts.push([g.center.lat, g.center.lng]);
      if (g.shape === 'polygon' && g.polygon) pts.push(...g.polygon);
    });
    return pts;
  }, [geofences]);

  const canSave =
    draft &&
    draft.name.trim() &&
    (draft.shape === 'circle' ? draft.center && Number(draft.radiusM) >= 20 : draft.polygon.length >= 3);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      name: draft.name.trim(),
      shape: draft.shape,
      alertOnEnter: draft.alertOnEnter,
      alertOnExit: draft.alertOnExit,
      color: draft.color,
      vehicles: draft.vehicles,
      active: draft.active,
      ...(draft.shape === 'circle'
        ? { center: draft.center, radiusM: Number(draft.radiusM) }
        : { polygon: draft.polygon })
    };
    try {
      if (draft._id) await geofenceApi.update(draft._id, payload);
      else await geofenceApi.create(payload);
      setDraft(null);
      await load();
    } catch (err) {
      setError(tr(err.message || 'Failed to save geofence'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(tr('Are you sure you want to delete this geofence?'))) return;
    try {
      await geofenceApi.delete(draft._id);
      setDraft(null);
      await load();
    } catch (err) {
      setError(tr(err.message || 'Failed to delete geofence'));
    }
  };

  const toggleVehicle = (id) =>
    setDraft((d) => ({ ...d, vehicles: d.vehicles.includes(id) ? d.vehicles.filter((v) => v !== id) : [...d.vehicles, id] }));

  if (loading) return <Loading message={tr('Loading geofences...')} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{tr('Geofences')}</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {tr('Draw zones on the map and get alerts when vehicles enter or leave them')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setDraft(newDraft()); setError(null); }}>
          <Plus size={16} /> {tr('New Geofence')}
        </button>
      </div>

      {error && <div style={{ ...boxStyle, backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* List + editor */}
        <div style={{ flex: '1 1 300px', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {draft ? (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '1rem' }}>
                <MapPinned size={18} color="var(--primary)" /> {draft._id ? tr('Edit Geofence') : tr('New Geofence')}
              </h3>

              <div className="form-group">
                <label className="form-label">{tr('Name *')}</label>
                <input className="form-control" maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">{tr('Shape')}</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['circle', 'polygon'].map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      className={`btn btn-sm ${draft.shape === shape ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setDraft({ ...draft, shape })}
                    >
                      {shape === 'circle' ? tr('Circle') : tr('Polygon')}
                    </button>
                  ))}
                </div>
              </div>

              <p style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {draft.shape === 'circle'
                  ? tr('Click on the map to set the center of the circle.')
                  : tr('Click on the map to add points (at least 3).')}
              </p>

              {draft.shape === 'circle' ? (
                <div className="form-group">
                  <label className="form-label">{tr('Radius (metres)')}</label>
                  <input type="number" min="20" max="500000" className="form-control" value={draft.radiusM} onChange={(e) => setDraft({ ...draft, radiusM: e.target.value })} />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <span>{tr('{n} points', { n: draft.polygon.length })}</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft({ ...draft, polygon: draft.polygon.slice(0, -1) })}>
                    <Undo2 size={14} /> {tr('Undo')}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft({ ...draft, polygon: [] })}>
                    {tr('Clear')}
                  </button>
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={draft.alertOnEnter} onChange={(e) => setDraft({ ...draft, alertOnEnter: e.target.checked })} />
                  {tr('Alert when a vehicle enters')}
                </label>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                  <input type="checkbox" checked={draft.alertOnExit} onChange={(e) => setDraft({ ...draft, alertOnExit: e.target.checked })} />
                  {tr('Alert when a vehicle leaves')}
                </label>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', marginTop: '0.4rem' }}>
                  <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                  {tr('Active')}
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">{tr('Color')}</label>
                <input type="color" className="form-control" style={{ height: '38px', padding: '4px' }} value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">{tr('Applies to')}</label>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  {draft.vehicles.length === 0 ? tr('All vehicles') : tr('{n} selected vehicles', { n: draft.vehicles.length })}
                </div>
                <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {vehicles.map((v) => (
                    <label key={v._id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                      <input type="checkbox" checked={draft.vehicles.includes(v._id)} onChange={() => toggleVehicle(v._id)} />
                      {v.registrationNumber} ({v.brand} {v.model})
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                <div>
                  {draft._id && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete}>
                      <Trash2 size={14} /> {tr('Delete')}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>{tr('Cancel')}</button>
                  <button type="button" className="btn btn-primary" disabled={!canSave || saving} onClick={handleSave}>
                    {saving ? tr('Saving Changes...') : tr('Save Changes')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
                <MapPinned size={18} color="var(--primary)" /> {tr('Geofences')} ({geofences.length})
              </h3>
              {geofences.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>{tr('No geofences yet')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {geofences.map((g) => (
                    <div
                      key={g._id}
                      onClick={() => setDraft(fromGeofence(g))}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)', cursor: 'pointer' }}
                    >
                      <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: g.color, opacity: g.active ? 1 : 0.35 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{g.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {g.shape === 'circle' ? `${tr('Circle')} · ${g.radiusM} m` : `${tr('Polygon')} · ${g.polygon?.length || 0}`}
                          {g.vehicles.length > 0 && ` · ${tr('{n} selected vehicles', { n: g.vehicles.length })}`}
                          {!g.active && ` · ${tr('Inactive')}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="card" style={{ flex: '2 1 480px', padding: '0.75rem' }}>
          <div style={{ height: '560px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <MapContainer center={UB} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={fitPoints} fitKey={fitKey} />
              <MapClicks draft={draft} onChange={setDraft} />

              {geofences
                .filter((g) => g._id !== draft?._id)
                .map((g) =>
                  g.shape === 'circle' && g.center ? (
                    <Circle key={g._id} center={[g.center.lat, g.center.lng]} radius={g.radiusM} pathOptions={{ color: g.color, fillOpacity: g.active ? 0.15 : 0.04, weight: g.active ? 2 : 1, dashArray: g.active ? null : '6' }} eventHandlers={{ click: () => !draft && setDraft(fromGeofence(g)) }} />
                  ) : g.polygon ? (
                    <Polygon key={g._id} positions={g.polygon} pathOptions={{ color: g.color, fillOpacity: g.active ? 0.15 : 0.04, weight: g.active ? 2 : 1, dashArray: g.active ? null : '6' }} eventHandlers={{ click: () => !draft && setDraft(fromGeofence(g)) }} />
                  ) : null
                )}

              {draft && draft.shape === 'circle' && draft.center && (
                <Circle center={[draft.center.lat, draft.center.lng]} radius={Number(draft.radiusM) || 0} pathOptions={{ color: draft.color, fillOpacity: 0.3, weight: 3 }} />
              )}
              {draft && draft.shape === 'polygon' && draft.polygon.length >= 3 && (
                <Polygon positions={draft.polygon} pathOptions={{ color: draft.color, fillOpacity: 0.3, weight: 3 }} />
              )}
              {draft && draft.shape === 'polygon' &&
                draft.polygon.map((p, i) => (
                  <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: '#fff', fillColor: draft.color, fillOpacity: 1 }} />
                ))}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
