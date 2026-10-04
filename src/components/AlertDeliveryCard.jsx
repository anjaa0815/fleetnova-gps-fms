import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Send, RefreshCw } from 'lucide-react';
import { deliveryApi, organizationApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const ALERT_TYPES = [
  { id: 'speeding', label: 'Speed limit exceeded' },
  { id: 'geofence_enter', label: 'Entered geofence' },
  { id: 'geofence_exit', label: 'Left geofence' }
];

const limitText = (used, max) => `${used} / ${max < 0 ? '∞' : max}`;
const msg = (kind) => ({
  padding: '0.7rem 1rem',
  marginBottom: '0.75rem',
  borderRadius: 'var(--radius-md)',
  fontSize: '0.85rem',
  backgroundColor: kind === 'ok' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
  color: kind === 'ok' ? '#34d399' : '#fb7185'
});

// Organization-level switches for sending alerts by email / SMS, provider status and a delivery log.
// Which users receive them is chosen per user (table below in Settings).
export default function AlertDeliveryCard() {
  const { tr } = useT();
  const [config, setConfig] = useState(null);
  const [settings, setSettings] = useState(null);
  const [log, setLog] = useState([]);
  const [feedback, setFeedback] = useState(null); // { kind: 'ok' | 'error', text }
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);

  const load = useCallback(async () => {
    try {
      const [cfg, entries] = await Promise.all([deliveryApi.config(), deliveryApi.log(10)]);
      setConfig(cfg.data);
      setSettings((prev) => prev || cfg.data.settings);
      setLog(entries.data);
    } catch (err) {
      setFeedback({ kind: 'error', text: tr(err.message || 'Failed to load delivery settings') });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleType = (id) =>
    setSettings((s) => ({ ...s, types: s.types.includes(id) ? s.types.filter((t) => t !== id) : [...s.types, id] }));

  const save = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await organizationApi.update({ settings: { delivery: settings } });
      setFeedback({ kind: 'ok', text: tr('Alert delivery settings saved') });
      load();
    } catch (err) {
      setFeedback({ kind: 'error', text: tr(err.message || 'Failed to save delivery settings') });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async (channel) => {
    setTesting(channel);
    setFeedback(null);
    try {
      const res = await deliveryApi.test(channel);
      setFeedback({ kind: 'ok', text: tr(res.message) });
    } catch (err) {
      setFeedback({ kind: 'error', text: tr(err.message || 'Failed to send test message') });
    } finally {
      setTesting(null);
      load();
    }
  };

  if (!config || !settings) return null;

  const providerBadge = (channelInfo) => (
    <span className={`badge ${channelInfo.simulated ? 'badge-scheduled' : 'badge-active'}`}>
      {channelInfo.provider}
      {channelInfo.simulated ? ` · ${tr('simulated')}` : ''}
    </span>
  );

  const statusBadge = (status) => {
    const cls = { sent: 'badge-active', queued: 'badge-scheduled', failed: 'badge-cancelled', skipped: 'badge-inactive' }[status];
    return <span className={`badge ${cls}`}>{tr(status)}</span>;
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: '1rem' }}>
        <BellRing size={18} color="var(--accent-cyan)" /> {tr('Alert Delivery (Email & SMS)')}
      </h3>

      {feedback && <div style={msg(feedback.kind)}>{feedback.text}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        {[
          { id: 'email', title: tr('Email alerts'), info: config.providers.email, usage: config.usage.email, max: config.limits.emailPerDay },
          { id: 'sms', title: tr('SMS alerts'), info: config.providers.sms, usage: config.usage.sms, max: config.limits.smsPerDay }
        ].map((ch) => (
          <div key={ch.id} style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 600 }}>
              <input type="checkbox" checked={settings[ch.id]} onChange={(e) => setSettings({ ...settings, [ch.id]: e.target.checked })} />
              {ch.title}
            </label>
            <div style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
              {tr('Provider')}: {providerBadge(ch.info)}
            </div>
            <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)' }}>
              {tr('Last 24 hours')}: {limitText(ch.usage, ch.max)}
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: '0.6rem' }} disabled={testing === ch.id} onClick={() => sendTest(ch.id)}>
              <Send size={13} /> {testing === ch.id ? tr('Sending...') : tr('Send test to me')}
            </button>
          </div>
        ))}
      </div>

      <div className="grid-cols-2" style={{ gap: '1rem', alignItems: 'start' }}>
        <div className="form-group">
          <label className="form-label">{tr('Send these alerts')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {ALERT_TYPES.map((type) => (
              <label key={type.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={settings.types.includes(type.id)} onChange={() => toggleType(type.id)} />
                {tr(type.label)}
              </label>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{tr('Message language')}</label>
          <select className="form-control" value={settings.language} onChange={(e) => setSettings({ ...settings, language: e.target.value })}>
            <option value="mn">Монгол</option>
            <option value="en">English</option>
          </select>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {tr('Choose which users receive email / SMS in the user table below.')}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? tr('Saving Changes...') : tr('Save Changes')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>{tr('Recent deliveries')}</strong>
        <button className="btn btn-secondary btn-sm" onClick={load}>
          <RefreshCw size={13} />
        </button>
      </div>
      {log.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{tr('No deliveries yet')}</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr('Time')}</th>
                <th>{tr('Channel')}</th>
                <th>{tr('Recipient')}</th>
                <th>{tr('Status')}</th>
                <th>{tr('Attempts')}</th>
              </tr>
            </thead>
            <tbody>
              {log.map((d) => (
                <tr key={d._id}>
                  <td>{new Date(d.createdAt).toLocaleString()}</td>
                  <td>{d.channel === 'email' ? 'Email' : 'SMS'}</td>
                  <td>{d.to}</td>
                  <td>
                    {statusBadge(d.status)}
                    {d.simulated && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '6px' }}>{tr('simulated')}</span>}
                    {d.lastError && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{tr(d.lastError)}</div>}
                  </td>
                  <td>{d.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
