import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

// Shown to the platform owner for as long as they work inside a customer organization
export default function ActingBanner() {
  const { tr } = useT();
  const { acting, organization, exitOrganization } = useAuth();
  if (!acting) return null;

  return (
    <div
      className="no-print"
      style={{
        padding: '0.65rem 1rem',
        backgroundColor: 'rgba(245, 158, 11, 0.18)',
        border: '1px solid rgba(245, 158, 11, 0.45)',
        color: '#fbbf24',
        fontSize: '0.825rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}
    >
      <ShieldAlert size={16} />
      <span>
        {tr('You are working inside {org} as its administrator. Every change you make is recorded.', { org: organization?.name || '' })}
      </span>
      <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={exitOrganization}>
        <LogOut size={13} /> {tr('Leave organization')}
      </button>
    </div>
  );
}
