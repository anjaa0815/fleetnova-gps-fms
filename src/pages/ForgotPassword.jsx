import React, { useState } from 'react';
import { Truck, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { authApi } from '../services/api.js';
import { describeApiError } from '../utils/apiError.js';
import { useT } from '../i18n/LanguageContext.jsx';

export default function ForgotPassword({ onSwitchToLogin }) {
  const { tr } = useT();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError(null);
    try {
      const res = await authApi.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(describeApiError(err, tr, 'Failed to submit reset request'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(circle at 50% 10%, rgba(37, 99, 235, 0.15) 0%, transparent 60%), #0a0d14'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 0.75rem auto'
              }}
            >
              <Truck size={24} />
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{tr("Reset Password")}</h2>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              {tr("Enter your corporate email to receive password recovery instructions")}
            </p>
          </div>

          {submitted ? (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 1rem auto' }} />
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{tr("Reset Link Dispatched")}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                {tr("If an account exists for {email}, you will receive password reset instructions.", { email })}
              </p>
              <button className="btn btn-primary" onClick={onSwitchToLogin} style={{ width: '100%' }}>
                {tr("Return to Login")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(244, 63, 94, 0.15)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: '#fb7185',
                    fontSize: '0.85rem',
                    marginBottom: '1.25rem'
                  }}
                >
                  {error}
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">{tr("Account Email Address")}</label>
                <div style={{ position: 'relative' }}>
                  <Mail
                    size={16}
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)'
                    }}
                  />
                  <input
                    type="email"
                    className="form-control"
                    style={{ paddingLeft: '38px' }}
                    placeholder={tr("name@fleetcompany.com")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem' }}
              >
                {loading ? tr("Submitting Request...") : tr("Send Recovery Instructions")}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={onSwitchToLogin}
                style={{ width: '100%' }}
              >
                <ArrowLeft size={16} /> {tr("Back to Sign In")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
