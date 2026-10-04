import React, { useState } from 'react';
import { KeyRound, MailCheck, Lock } from 'lucide-react';
import { authApi } from '../services/api.js';
import { describeApiError } from '../utils/apiError.js';
import { useT } from '../i18n/LanguageContext.jsx';

// Landing page of the link in the password reset email (?reset=<token>)
export default function ResetPassword({ token, onDone }) {
  const { tr } = useT();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(tr('Password must be at least 8 characters'));
      return;
    }
    if (password !== confirm) {
      setError(tr('Passwords do not match'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(describeApiError(err, tr, 'Failed to reset the password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '2.25rem 2rem' }}>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <MailCheck size={48} color="#34d399" style={{ margin: '0 auto 1rem auto' }} />
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>{tr('Password changed')}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {tr('You can sign in with your new password. All other sessions were signed out.')}
            </p>
            <button className="btn btn-primary" style={{ marginTop: '1.5rem', width: '100%' }} onClick={onDone}>
              {tr('Go to sign in')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <KeyRound size={40} color="var(--accent-cyan)" style={{ margin: '0 auto 0.75rem auto' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{tr('Choose a new password')}</h2>
            </div>
            {error && (
              <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', fontSize: '0.85rem' }}>
                {error}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">{tr('New Password')}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="password" className="form-control" style={{ paddingLeft: '38px' }} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Confirm New Password')}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="password" className="form-control" style={{ paddingLeft: '38px' }} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? tr('Saving Changes...') : tr('Change password')}
            </button>
            <button type="button" className="btn btn-secondary" style={{ width: '100%', marginTop: '0.6rem' }} onClick={onDone}>
              {tr('Back to Sign In')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
