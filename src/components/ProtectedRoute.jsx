import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Loading from './Loading.jsx';
import { ShieldAlert } from 'lucide-react';
import { useT } from '../i18n/LanguageContext.jsx';

export default function ProtectedRoute({ allowedRoles = [], children }) {
  const { tr } = useT();
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loading message={tr("Validating credentials and permissions...")} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will trigger login view in App.jsx
  }

  if (allowedRoles.length > 0 && user && !allowedRoles.includes(user.role)) {
    return (
      <div
        style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          maxWidth: '550px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem'
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(244, 63, 94, 0.15)',
            color: '#fb7185',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ShieldAlert size={32} />
        </div>
        <h2 style={{ fontSize: '1.4rem' }}>{tr("Access Restricted")}</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {tr("Your user account role ({role}) does not have authorization to view this module.", { role: tr(user.role) })}
        </p>
      </div>
    );
  }

  return children;
}
