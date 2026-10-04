import React, { useState } from 'react';
import { User, Mail, Phone, Lock, ShieldCheck, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

export default function Profile() {
  const { tr } = useT();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [alertChannels, setAlertChannels] = useState({ email: Boolean(user?.alertChannels?.email), sms: Boolean(user?.alertChannels?.sms) });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (password && password !== confirmPassword) {
      setError(tr("Passwords do not match"));
      return;
    }

    setLoading(true);
    const updateData = { name, phone, alertChannels };
    if (password) updateData.password = password;

    const res = await updateProfile(updateData);
    setLoading(false);

    if (res.success) {
      setMessage(tr("Profile updated successfully"));
      setPassword('');
      setConfirmPassword('');
    } else {
      setError(tr(res.message));
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Profile Overview Card */}
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          padding: '1.75rem',
          flexWrap: 'wrap'
        }}
      >
        <div
          className="user-avatar-circle"
          style={{ width: '64px', height: '64px', fontSize: '1.75rem', flexShrink: 0 }}
        >
          {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>

        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{user?.name}</h2>
            <span className={`role-badge ${user?.role}`}>
              {user?.role === 'fleet_manager' ? tr("Fleet Manager") : tr(user?.role)}
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {user?.email} {tr("• Status:")} <strong style={{ color: 'var(--accent-emerald)' }}>{tr("Active")}</strong>
          </p>
        </div>
      </div>

      {/* Profile Edit Form */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
          <User size={18} color="var(--primary)" /> {tr("Edit Account Details")}
        </h3>

        {message && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <CheckCircle2 size={16} /> {message}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fb7185',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Full Name")}</label>
              <input
                type="text"
                className="form-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{tr("Phone Number")}</label>
              <input
                type="text"
                className="form-control"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{tr("Email Address (Read-only)")}</label>
            <input
              type="email"
              className="form-control"
              value={user?.email || ''}
              disabled
              style={{ opacity: 0.7 }}
            />
          </div>

          {user?.role !== 'super_admin' && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>{tr("Alert notifications")}</h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
                {tr("Receive fleet alerts (speeding, geofences) on your email and phone. Your organization must enable each channel.")}
              </p>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
                <input type="checkbox" checked={alertChannels.email} onChange={(e) => setAlertChannels({ ...alertChannels, email: e.target.checked })} />
                {tr("Email alerts")}
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem', marginTop: '0.4rem' }}>
                <input type="checkbox" checked={alertChannels.sms} onChange={(e) => setAlertChannels({ ...alertChannels, sms: e.target.checked })} />
                {tr("SMS alerts")} {!phone && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({tr("add a phone number first")})</span>}
              </label>
            </div>
          )}

          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <KeyRound size={16} color="var(--accent-cyan)" /> {tr("Change Password (Leave blank to keep existing)")}
            </h4>

            <div className="grid-cols-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{tr("New Password")}</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{tr("Confirm New Password")}</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? tr("Saving Changes...") : tr("Save Profile Settings")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
