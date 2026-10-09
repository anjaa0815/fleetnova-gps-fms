import React, { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Modal from './Modal.jsx';
import { platformApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

// Deleting an organization cannot be undone: the exact name has to be typed
export default function OrgDeleteModal({ org, onClose, onDeleted }) {
  const { tr } = useT();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const remove = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await platformApi.deleteOrganization(org._id, typed);
      onDeleted();
    } catch (err) {
      setError(tr(err.message || 'Failed to delete the organization'));
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`${tr('Delete organization')}: ${org.name}`} maxWidth="560px">
      <form onSubmit={remove} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
        <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.12)', color: '#fb7185', display: 'flex', gap: 8 }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>{tr('This cannot be undone.')}</strong>
            <div>{tr('All vehicles, drivers, trips, fuel, maintenance, expenses, trackers, GPS history, geofences, notifications and every user of this organization are deleted. Payment invoices and the log of what you did there are kept.')}</div>
          </div>
        </div>
        {error && <div style={{ color: '#fb7185' }}>{error}</div>}
        <label>
          {tr('Type the name of the organization to confirm')}: <strong>{org.name}</strong>
          <input className="form-control" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus style={{ marginTop: 4 }} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{tr('Cancel')}</button>
          <button type="submit" className="btn btn-danger" disabled={busy || typed.trim() !== org.name}>
            <Trash2 size={15} /> {busy ? tr('Deleting...') : tr('Delete organization')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
