import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, RotateCw, OctagonX, Play, AlertTriangle, X } from 'lucide-react';
import Modal from './Modal.jsx';
import { deviceApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

const TYPE_LABEL = {
  locate: 'Request position now',
  reboot: 'Restart the device',
  engine_stop: 'Stop the engine',
  engine_resume: 'Restore the engine'
};
const STATUS_BADGE = { queued: 'in-progress', sending: 'in-progress', sent: 'in-progress', acknowledged: 'completed', unconfirmed: 'maintenance', failed: 'inactive', expired: 'inactive', cancelled: 'cancelled' };
const STATUS_TEXT = {
  queued: 'Waiting for the device',
  sending: 'Sending',
  sent: 'Sent, waiting for the answer',
  acknowledged: 'Done',
  unconfirmed: 'Sent, but the device did not answer',
  failed: 'Failed',
  expired: 'Expired',
  cancelled: 'Cancelled'
};
const OPEN = ['queued', 'sending', 'sent'];

// Commands to a tracker. Engine commands (admin only) need the registration number typed in as confirmation.
export default function DeviceCommandsModal({ device, onClose }) {
  const { tr } = useT();
  const { role } = useAuth();
  const [commands, setCommands] = useState([]);
  const [info, setInfo] = useState({ supported: true, immobilizer: Boolean(device.immobilizer) });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState(null); // 'engine_stop' | 'engine_resume' while the confirmation is open
  const [typed, setTyped] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await deviceApi.commands(device._id);
      setCommands(res.data);
      setInfo({ supported: res.supported, immobilizer: res.immobilizer });
    } catch (err) {
      setError(tr(err.message));
    }
  }, [device._id, tr]);

  useEffect(() => { load(); }, [load]);

  // keep the list fresh while something is still on its way
  const open = commands.some((c) => OPEN.includes(c.status));
  useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [open, load]);

  const send = async (type, extra = {}) => {
    setBusy(true);
    setError(null);
    try {
      await deviceApi.sendCommand(device._id, { type, ...extra });
      setEngine(null);
      setTyped('');
      await load();
    } catch (err) {
      setError(tr(err.message));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    try {
      await deviceApi.cancelCommand(device._id, id);
      await load();
    } catch (err) {
      setError(tr(err.message));
    }
  };

  const plate = device.vehicle?.registrationNumber || '';
  const canEngine = role === 'admin' && info.immobilizer;
  const moving = Number(device.lastPosition?.speed) >= 5;

  return (
    <Modal isOpen onClose={onClose} title={`${tr('Device commands')}: ${device.name}`} maxWidth="640px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
        {error && (
          <div style={{ padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}
        <div style={{ color: 'var(--text-secondary)' }}>
          {plate && <strong>{plate}</strong>} {device.lastPosition ? `· ${device.lastPosition.speed} ${tr('km/h')} · ${new Date(device.lastPosition.timestamp).toLocaleString()}` : `· ${tr('No position yet')}`}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {tr('A command that cannot be delivered right away waits until the device connects, but not for long.')}
          </div>
        </div>

        {engine ? (
          <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244, 63, 94, 0.4)', backgroundColor: 'rgba(244, 63, 94, 0.08)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <strong style={{ color: '#fb7185' }}>
              {engine === 'engine_stop' ? tr('Stop the engine of {plate}?', { plate }) : tr('Restore the engine of {plate}?', { plate })}
            </strong>
            {engine === 'engine_stop' && (
              <div>{tr('Only do this when the vehicle stands still in a safe place. The command is refused while it is moving, and checked again just before it is sent.')}</div>
            )}
            <label>
              {tr('Type the registration number to confirm')}: <strong>{plate}</strong>
              <input className="form-control" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus style={{ marginTop: 4 }} />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setEngine(null); setTyped(''); }}>{tr('Cancel')}</button>
              <button className="btn btn-danger btn-sm" disabled={busy || typed.trim().toUpperCase() !== plate.toUpperCase()} onClick={() => send(engine, { confirmRegistration: typed })}>
                {engine === 'engine_stop' ? tr('Stop the engine') : tr('Restore the engine')}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => send('locate')}><MapPin size={14} /> {tr(TYPE_LABEL.locate)}</button>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (window.confirm(tr('Restart the device? It is offline for a minute.'))) send('reboot'); }}><RotateCw size={14} /> {tr(TYPE_LABEL.reboot)}</button>
            {canEngine && plate && (
              <>
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setEngine('engine_stop')}><OctagonX size={14} /> {tr(TYPE_LABEL.engine_stop)}</button>
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEngine('engine_resume')}><Play size={14} /> {tr(TYPE_LABEL.engine_resume)}</button>
              </>
            )}
          </div>
        )}
        {role === 'admin' && !info.immobilizer && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {tr('Engine commands are off for this device. Switch them on in the device settings once the engine relay is installed and tested.')}
          </div>
        )}
        {canEngine && moving && (
          <div style={{ color: '#fbbf24', fontSize: '0.75rem' }}>{tr('The vehicle is moving: stopping the engine is not possible now.')}</div>
        )}

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{tr('Recent commands')}</div>
          {commands.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>{tr('No commands yet.')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {commands.map((c) => (
                <div key={c._id} style={{ padding: '0.55rem 0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div><strong>{tr(TYPE_LABEL[c.type])}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.createdByName} · {new Date(c.createdAt).toLocaleString()}</span></div>
                    {(c.response || c.error) && (
                      <div style={{ fontSize: '0.75rem', color: c.error ? '#fb7185' : 'var(--text-secondary)', wordBreak: 'break-word' }}>{c.error ? tr(c.error) : c.response}</div>
                    )}
                  </div>
                  <span className={`badge badge-${STATUS_BADGE[c.status]}`}>{tr(STATUS_TEXT[c.status])}</span>
                  {c.status === 'queued' && (
                    <button className="btn btn-secondary btn-sm" title={tr('Cancel')} onClick={() => cancel(c._id)}><X size={13} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
