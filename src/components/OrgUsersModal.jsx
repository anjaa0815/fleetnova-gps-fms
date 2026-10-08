import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, UserPlus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Modal from './Modal.jsx';
import Loading from './Loading.jsx';
import { platformApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const ROLES = ['admin', 'fleet_manager', 'driver'];
const emptyUser = { name: '', email: '', password: '', role: 'fleet_manager', phone: '' };

// The platform owner manages the accounts of one organization: add a user with a role, change role or status,
// set a new password. Business data of the organization is not shown here.
export default function OrgUsersModal({ org, onClose, onChanged }) {
  const { tr } = useT();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [newUser, setNewUser] = useState(null); // the add form, when open
  const [resetFor, setResetFor] = useState(null); // user whose new password is being typed
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const roleLabel = (role) => (role === 'fleet_manager' ? tr('Fleet Manager') : tr(role));

  const load = useCallback(async () => {
    try {
      const res = await platformApi.listUsers(org._id);
      setUsers(res.data);
    } catch (err) {
      setError(tr(err.message || 'Failed to load users'));
    }
  }, [org._id, tr]);

  useEffect(() => { load(); }, [load]);

  // runs one change, shows its error or the notice, and refreshes the list
  const run = async (action, doneText) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (doneText) setNotice(doneText);
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(tr(err.message || 'Failed to update user'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    if (newUser.password.length < 8) {
      setError(tr('Password must be at least 8 characters'));
      return;
    }
    if (await run(() => platformApi.createUser(org._id, newUser), tr('User created successfully'))) setNewUser(null);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(tr('Password must be at least 8 characters'));
      return;
    }
    const ok = await run(
      () => platformApi.updateUser(org._id, resetFor._id, { password }),
      tr('The password was changed. {name} was signed out everywhere and has to sign in again.', { name: resetFor.name })
    );
    if (ok) {
      setResetFor(null);
      setPassword('');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`${tr('Users')}: ${org.name}`} maxWidth="860px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
        {error && (
          <div style={{ padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}
        {notice && (
          <div style={{ padding: '0.65rem 0.9rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', display: 'flex', gap: 6, alignItems: 'center' }}>
            <CheckCircle2 size={15} /> {notice}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {tr('Accounts of this organization. Its vehicles, trips and other data are not visible to the platform owner.')}
          </span>
          {!newUser && (
            <button className="btn btn-primary btn-sm" onClick={() => { setNewUser(emptyUser); setNotice(null); setError(null); }}>
              <UserPlus size={14} /> {tr('Add user')}
            </button>
          )}
        </div>

        {newUser && (
          <form onSubmit={addUser} style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)' }}>
            <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{tr('Name')} *</label>
                <input className="form-control" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{tr('Email')} *</label>
                <input type="email" className="form-control" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{tr('Initial Password * (min 8 characters)')}</label>
                <input type="password" className="form-control" required minLength={8} autoComplete="new-password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{tr('Role')}</label>
                <select className="form-control" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewUser(null)}>{tr('Cancel')}</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{tr('Add user')}</button>
            </div>
          </form>
        )}

        {resetFor && (
          <form onSubmit={savePassword} style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <strong>{tr('Set a new password for {name}', { name: resetFor.name })}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              {tr('The user is signed out everywhere and gets an email about the change. Tell them the new password in person.')}
            </span>
            <input type="password" className="form-control" required minLength={8} autoFocus autoComplete="new-password" placeholder={tr('New password (min 8 characters)')} value={password} onChange={(e) => setPassword(e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setResetFor(null); setPassword(''); }}>{tr('Cancel')}</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{tr('Set new password')}</button>
            </div>
          </form>
        )}

        {users === null ? (
          <Loading message={tr('Loading...')} />
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr('Name')}</th>
                  <th>{tr('Role')}</th>
                  <th>{tr('Status')}</th>
                  <th>{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <strong>{u.name}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div>
                    </td>
                    <td>
                      <select
                        className="form-control"
                        style={{ padding: '0.3rem 0.5rem', minWidth: '140px' }}
                        value={u.role}
                        disabled={busy}
                        onChange={(e) => run(() => platformApi.updateUser(org._id, u._id, { role: e.target.value }))}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                      </select>
                    </td>
                    <td>
                      <span className={`badge badge-${u.status === 'inactive' ? 'inactive' : 'active'}`}>{tr(u.status === 'inactive' ? 'inactive' : 'active')}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setResetFor(u); setPassword(''); setNotice(null); setError(null); }}>
                          <KeyRound size={13} /> {tr('Reset password')}
                        </button>
                        <button
                          className={`btn btn-sm ${u.status === 'inactive' ? 'btn-secondary' : 'btn-danger'}`}
                          disabled={busy}
                          onClick={() => run(() => platformApi.updateUser(org._id, u._id, { status: u.status === 'inactive' ? 'active' : 'inactive' }))}
                        >
                          {u.status === 'inactive' ? tr('Activate') : tr('Deactivate')}
                        </button>
                      </div>
                    </td>
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
