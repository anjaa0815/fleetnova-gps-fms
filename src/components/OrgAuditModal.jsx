import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';
import { platformApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

// What the platform owner changed inside one organization (reads are not recorded)
export default function OrgAuditModal({ org, onClose }) {
  const { tr } = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    platformApi
      .auditLog(org._id)
      .then((res) => setRows(res.data))
      .catch((err) => setError(tr(err.message || 'Failed to load the activity log')));
  }, [org._id, tr]);

  return (
    <Modal isOpen onClose={onClose} title={`${tr('Activity log')}: ${org.name}`} maxWidth="860px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {tr('Changes the platform owner made inside this organization. Looking at data is not recorded.')}
        </span>
        {error && <div style={{ color: '#fb7185' }}>{error}</div>}
        {!error && rows === null && <Loading message={tr('Loading...')} />}
        {rows && rows.length === 0 && <div style={{ color: 'var(--text-muted)' }}>{tr('No changes recorded yet.')}</div>}
        {rows && rows.length > 0 && (
          <div className="table-responsive" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr('Time')}</th>
                  <th>{tr('Done by')}</th>
                  <th>{tr('Change')}</th>
                  <th>{tr('Result')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td>{new Date(r.at).toLocaleString()}</td>
                    <td>{r.actorEmail}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{r.method} {r.path}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
