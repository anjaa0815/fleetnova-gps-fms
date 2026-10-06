import React, { useEffect, useState } from 'react';
import { Radio, Plus, Pencil, Trash2, Route as RouteIcon, Copy, Terminal } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import Loading from '../components/Loading.jsx';
import TrackHistoryModal from '../components/TrackHistoryModal.jsx';
import DeviceCommandsModal from '../components/DeviceCommandsModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { deviceApi, vehicleApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const emptyForm = { name: '', imei: '', protocol: 'teltonika', vehicle: '', simNumber: '', immobilizer: false };

const box = (extra = {}) => ({ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', ...extra });

export default function Devices() {
  const { tr } = useT();
  const { role } = useAuth();
  const [devices, setDevices] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editing, setEditing] = useState(null); // device being edited (null = creating)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // freshly created device (shows connection details)
  const [historyDevice, setHistoryDevice] = useState(null);
  const [commandDevice, setCommandDevice] = useState(null);

  const load = async () => {
    try {
      const [devs, vehs, conn] = await Promise.all([
        deviceApi.getAll(),
        vehicleApi.getAll('limit=500'),
        deviceApi.connectionInfo()
      ]);
      setDevices(devs.data);
      setVehicles(vehs.data);
      setInfo(conn.data);
      setError(null);
    } catch (err) {
      setError(tr(err.message || 'Failed to load devices'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000); // keep online status fresh
    return () => clearInterval(timer);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (device) => {
    setEditing(device);
    setForm({
      name: device.name,
      imei: device.imei,
      protocol: device.protocol,
      vehicle: device.vehicle?._id || '',
      simNumber: device.simNumber || '',
      immobilizer: Boolean(device.immobilizer)
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        const update = { name: form.name, vehicle: form.vehicle || null, simNumber: form.simNumber };
        if (role === 'admin' && form.immobilizer !== Boolean(editing.immobilizer)) update.immobilizer = form.immobilizer;
        await deviceApi.update(editing._id, update);
      } else {
        const res = await deviceApi.create({ ...form, vehicle: form.vehicle || null });
        setCreated({ ...res.data, traccarSync: res.traccarSync });
      }
      setIsFormOpen(false);
      load();
    } catch (err) {
      setFormError(tr(err.message || 'Failed to save device'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (device) => {
    if (!window.confirm(tr('Are you sure you want to delete this device? Its route history is kept.'))) return;
    try {
      await deviceApi.delete(device._id);
      load();
    } catch (err) {
      alert(tr(err.message || 'Failed to delete device'));
    }
  };

  const copy = (text) => navigator.clipboard?.writeText(text).catch(() => {});
  const host = window.location.hostname;
  const httpUrl = (device) =>
    `${window.location.origin}/api/gps/osmand?id=${device.imei}&key=${device.secret}&lat={0}&lon={1}&timestamp={2}&speed={3}&bearing={4}&altitude={5}`;

  const statusBadge = (d) => {
    if (d.online) return <span className="badge badge-active">{tr('Online')}</span>;
    if (d.lastSeenAt) return <span className="badge badge-inactive">{tr('Offline')}</span>;
    return <span className="badge badge-scheduled">{tr('Never connected')}</span>;
  };

  if (loading) return <Loading message={tr('Loading devices...')} />;

  const usedVehicleIds = new Set(devices.filter((d) => d.vehicle && d._id !== editing?._id).map((d) => d.vehicle._id));
  const freeVehicles = vehicles.filter((v) => !usedVehicleIds.has(v._id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{tr('GPS Devices')}</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {tr('Register trackers, link them to vehicles and watch their connection status')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> {tr('Add Device')}
        </button>
      </div>

      {error && <div style={box({ backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' })}>{error}</div>}

      {/* Where to point the trackers */}
      {info && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
            <Radio size={18} color="var(--accent-cyan)" /> {tr('Tracker connection settings')}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', fontSize: '0.85rem' }}>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>TELTONIKA (CODEC 8 / 8E)</div>
              {info.teltonika.enabled ? (
                <strong>TCP {host}:{info.teltonika.port}</strong>
              ) : (
                <strong>{tr('Disabled on this server')}</strong>
              )}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {tr('Set the tracker server IP/domain and port; it identifies itself with its IMEI.')}
              </div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>GT06 / CONCOX</div>
              {info.gt06?.enabled ? (
                <strong>TCP {host}:{info.gt06.port}</strong>
              ) : (
                <strong>{tr('Disabled on this server')}</strong>
              )}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {tr('Set the tracker server IP/domain and port; it identifies itself with its IMEI.')}
              </div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>TRACCAR (200+ PROTOCOLS)</div>
              <strong>{info.traccar?.enabled ? tr('Enabled') : tr('Disabled on this server')}</strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {tr('Trackers connect to the Traccar server; register the device here with its Traccar unique ID (usually the IMEI).')}
              </div>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>HTTP (OSMAND / TRACCAR CLIENT)</div>
              <strong>{window.location.origin}{info.osmand.path}</strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {tr('Phone apps send id + secret key; create the device with protocol "osmand" to get the key.')}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <Radio size={18} color="var(--primary)" /> {tr('Devices')} ({devices.length})
        </h3>
        {devices.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>{tr('No GPS devices registered yet')}</div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr('Device')}</th>
                  <th>{tr('Vehicle')}</th>
                  <th>{tr('Status')}</th>
                  <th>{tr('Last seen')}</th>
                  <th>{tr('Last position')}</th>
                  <th>{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d._id}>
                    <td>
                      <strong>{d.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.imei} · {d.protocol}</div>
                    </td>
                    <td>{d.vehicle ? d.vehicle.registrationNumber : <span style={{ color: 'var(--text-muted)' }}>{tr('Unassigned')}</span>}</td>
                    <td>{statusBadge(d)}</td>
                    <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}</td>
                    <td>
                      {d.lastPosition ? (
                        <span style={{ fontSize: '0.8rem' }}>
                          {d.lastPosition.lat.toFixed(5)}, {d.lastPosition.lng.toFixed(5)} · {d.lastPosition.speed} {tr('km/h')}
                        </span>
                      ) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {d.commandsSupported && (
                          <button className="btn btn-secondary btn-sm" title={tr('Device commands')} onClick={() => setCommandDevice(d)}>
                            <Terminal size={14} />
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" title={tr('Route history')} onClick={() => setHistoryDevice(d)}>
                          <RouteIcon size={14} />
                        </button>
                        <button className="btn btn-secondary btn-sm" title={tr('Edit')} onClick={() => openEdit(d)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-danger btn-sm" title={tr('Delete')} onClick={() => handleDelete(d)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={editing ? tr('Edit Device') : tr('Add Device')}>
        <form onSubmit={handleSubmit}>
          {formError && <div style={box({ marginBottom: '1rem', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185' })}>{formError}</div>}
          <div className="grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{tr('Device Name *')}</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Protocol')}</label>
              <select className="form-control" disabled={Boolean(editing)} value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                <option value="teltonika">Teltonika (TCP)</option>
                <option value="gt06">GT06 / Concox (TCP)</option>
                <option value="osmand">OsmAnd / Traccar Client (HTTP)</option>
                <option value="traccar">{tr('Via Traccar server (other protocols)')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{form.protocol === 'osmand' || form.protocol === 'traccar' ? tr('Device ID *') : tr('IMEI (15 digits) *')}</label>
              <input className="form-control" required disabled={Boolean(editing)} value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value.trim() })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Linked Vehicle')}</label>
              <select className="form-control" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })}>
                <option value="">{tr('-- Not linked --')}</option>
                {freeVehicles.map((v) => (
                  <option key={v._id} value={v._id}>{v.registrationNumber} ({v.brand} {v.model})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{tr('SIM Number')}</label>
              <input className="form-control" value={form.simNumber} onChange={(e) => setForm({ ...form, simNumber: e.target.value })} />
            </div>
            {editing && role === 'admin' && editing.commandsSupported && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.85rem' }}>
                  <input type="checkbox" checked={form.immobilizer} onChange={(e) => setForm({ ...form, immobilizer: e.target.checked })} style={{ marginTop: 3 }} />
                  <span>
                    <strong>{tr('Engine relay (immobilizer) is installed and tested')}</strong>
                    <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      {tr('Allows stopping and restoring the engine from here. Switch it on only after the relay is wired, the tracker is configured for it and it has been tested on the vehicle.')}
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsFormOpen(false)}>{tr('Cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? tr('Saving Changes...') : tr('Save Changes')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Connection details after creating an HTTP device */}
      <Modal isOpen={Boolean(created)} onClose={() => setCreated(null)} title={tr('Device registered')}>
        {created && (
          <div style={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p>{tr('{name} was registered.', { name: created.name })}</p>
            {created.protocol === 'osmand' ? (
              <>
                <p>{tr('Use this URL in the phone app (keep the key secret):')}</p>
                <div style={box({ backgroundColor: 'var(--bg-secondary)', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem' })}>
                  {httpUrl(created)}
                </div>
                <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => copy(httpUrl(created))}>
                  <Copy size={14} /> {tr('Copy')}
                </button>
              </>
            ) : created.protocol === 'traccar' ? (
              <>
                <p>{tr('Point the tracker to your Traccar server (its protocol port). Traccar forwards the positions here.')}</p>
                {created.traccarSync === 'failed' && (
                  <p style={{ color: '#fbbf24' }}>{tr('The device could not be added to the Traccar server automatically; add it there with the same unique ID.')}</p>
                )}
              </>
            ) : (
              <p>
                {tr('Point the tracker to')} <strong>{host}:{created.protocol === 'gt06' ? info?.gt06?.port : info?.teltonika.port}</strong> (TCP).
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setCreated(null)}>{tr('Close')}</button>
            </div>
          </div>
        )}
      </Modal>

      {commandDevice && <DeviceCommandsModal device={commandDevice} onClose={() => setCommandDevice(null)} />}
      {historyDevice && <TrackHistoryModal device={historyDevice} onClose={() => setHistoryDevice(null)} />}
    </div>
  );
}
