import React, { useEffect, useState } from 'react';
import { Truck, Lock, Mail, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { publicApi } from '../services/api.js';
import { describeApiError } from '../utils/apiError.js';
import CheckEmailPanel from '../components/CheckEmailPanel.jsx';
import { getOrgSlugFromLocation } from '../utils/orgSlug.js';
import { useT } from '../i18n/LanguageContext.jsx';

export default function Login({ onSwitchToRegister, onSwitchToForgot }) {
  const { tr } = useT();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orgBrand, setOrgBrand] = useState(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null); // account exists but its email is not confirmed yet

  // Per-organization login page: ?org=<slug> or <slug>.yourdomain
  useEffect(() => {
    const slug = getOrgSlugFromLocation();
    if (!slug) return undefined;
    let cancelled = false;
    publicApi
      .getOrganization(slug)
      .then((res) => {
        if (!cancelled && res.success) setOrgBrand(res.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const color = orgBrand?.branding?.primaryColor;
    if (color) document.documentElement.style.setProperty('--primary', color);
    return () => document.documentElement.style.removeProperty('--primary');
  }, [orgBrand]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError(tr("Please provide your email and password"));
      return;
    }
    setLoading(true);
    setError(null);
    const res = await login(email, password);
    setLoading(false);
    if (!res.success) {
      if (res.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(email);
      } else {
        setError(describeApiError(res, tr));
      }
    }
  };

  const handleQuickLogin = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  if (unverifiedEmail) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div className="card" style={{ maxWidth: '460px', width: '100%', padding: '2.25rem 2rem' }}>
          <CheckEmailPanel email={unverifiedEmail} onBackToLogin={() => setUnverifiedEmail(null)} />
        </div>
      </div>
    );
  }

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
          maxWidth: '460px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
      >
        {/* Header Branding */}
        <div
          style={{
            padding: '2.25rem 2rem 1.5rem 2rem',
            textAlign: 'center',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(15, 21, 35, 0.6)'
          }}
        >
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto',
              boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)'
            }}
          >
            {orgBrand?.branding?.logoUrl ? (
              <img src={orgBrand.branding.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
            ) : (
              <Truck size={28} />
            )}
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
            {orgBrand ? orgBrand.name : tr("CLIXGPS")}
          </h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontWeight: 700, letterSpacing: '0.1em', marginTop: '2px' }}>
            {tr("SMART FLEET MANAGEMENT SYSTEM")}
          </p>
        </div>

        <div style={{ padding: '2rem' }}>
          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                color: '#fb7185',
                fontSize: '0.85rem',
                marginBottom: '1.25rem',
                textAlign: 'center'
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{tr("Email Address")}</label>
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
                  placeholder={tr("admin@fleetnova.com")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label">{tr("Password")}</label>
                <button
                  type="button"
                  onClick={onSwitchToForgot}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  {tr("Forgot password?")}
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock
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
                  type="password"
                  className="form-control"
                  style={{ paddingLeft: '38px' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}
            >
              {loading ? tr("Authenticating...") : tr("Sign In to CLIXGPS")} <ArrowRight size={16} />
            </button>
          </form>

          {/* Quick Demo Credentials: development builds only (hidden in production) */}
          {import.meta.env.DEV && (
          <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textAlign: 'center', fontWeight: 600 }}>
              {tr("QUICK DEMO ACCESS (CLICK TO FILL)")}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.7rem', padding: '0.4rem 0.2rem' }}
                onClick={() => handleQuickLogin('admin@fleetnova.com', 'admin123')}
              >
                {tr("👑 Admin")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.7rem', padding: '0.4rem 0.2rem' }}
                onClick={() => handleQuickLogin('manager@fleetnova.com', 'manager123')}
              >
                {tr("💼 Manager")}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.7rem', padding: '0.4rem 0.2rem' }}
                onClick={() => handleQuickLogin('driver@fleetnova.com', 'driver123')}
              >
                {tr("🚚 Driver")}
              </button>
            </div>
          </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {tr("Need an organization account?")}{' '}
            <button
              type="button"
              onClick={onSwitchToRegister}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {tr("Register here")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
