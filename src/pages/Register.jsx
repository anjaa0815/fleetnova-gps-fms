import React, { useState } from 'react';
import { Truck, Lock, Mail, User, Phone, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

export default function Register({ onSwitchToLogin }) {
  const { tr } = useT();
  const { register } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      setError(tr("Please fill in all required fields"));
      return;
    }
    if (formData.password.length < 8) {
      setError(tr("Password must be at least 8 characters"));
      return;
    }

    setLoading(true);
    setError(null);
    const res = await register(formData);
    setLoading(false);
    if (!res.success) {
      setError(tr(res.message));
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
          maxWidth: '500px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '2rem 2rem 1.25rem 2rem',
            textAlign: 'center',
            borderBottom: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(15, 21, 35, 0.6)'
          }}
        >
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
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800 }}>{tr("Create FLEETNOVA Account")}</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {tr("Join the smart centralized fleet management platform")}
          </p>
        </div>

        <div style={{ padding: '1.75rem 2rem' }}>
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

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{tr("Full Name *")}</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '38px' }}
                  placeholder={tr("e.g. Vikramaditya Singh")}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{tr("Email Address *")}</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  className="form-control"
                  style={{ paddingLeft: '38px' }}
                  placeholder={tr("vikram@fleetoperations.com")}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid-cols-2" style={{ gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div className="form-group">
                <label className="form-label">{tr("Phone Number")}</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    style={{ paddingLeft: '38px' }}
                    placeholder="+91 98000 00000"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">{tr("Password * (min 8 characters)")}</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  className="form-control"
                  style={{ paddingLeft: '38px' }}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', padding: '0.75rem' }}
            >
              {loading ? tr("Creating Account...") : tr("Complete Registration")} <ArrowRight size={16} />
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {tr("Already registered?")}{' '}
            <button
              type="button"
              onClick={onSwitchToLogin}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {tr("Sign In")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
