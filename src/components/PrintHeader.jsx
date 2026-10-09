import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

// Letterhead of a printed report: organization (logo + name), report title, period / filters and who printed it
// and when. Hidden on screen, shown only when printing (see "@media print" in index.css).
export default function PrintHeader({ title, lines = [] }) {
  const { tr } = useT();
  const { organization, user } = useAuth();
  const logo = organization?.branding?.logoUrl;

  return (
    <div className="print-only print-header">
      <div className="print-header-top">
        <div className="print-header-org">
          {logo && <img src={logo} alt="" />}
          <strong>{organization?.name || 'CLIXGPS'}</strong>
        </div>
        <div className="print-header-meta">
          <div>{tr('Printed')}: {new Date().toLocaleString()}</div>
          {user?.name && <div>{tr('Printed by')}: {user.name}</div>}
        </div>
      </div>
      <h1>{title}</h1>
      {lines.filter(Boolean).map((line) => (
        <div key={line} className="print-header-line">{line}</div>
      ))}
    </div>
  );
}
