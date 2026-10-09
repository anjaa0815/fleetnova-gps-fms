import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react';
import Loading from '../components/Loading.jsx';
import Modal from '../components/Modal.jsx';
import { platformApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

const emptyAdmin = { name: '', email: '', password: '', phone: '' };

// The platform owner's team: other super admins. They manage organizations like the owner does and belong to none.
export default function PlatformAdmins() {
  const { tr } = useT();
  const { user } = useAuth();
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(null); // the add form, when open
  const [resetFor, setResetFor] = useState(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await platformApi.listAdmins();
      setAdmins(res.data);
    } catch (err) {
      setError(tr(err.message || 'Failed to load users'));
    }
  }, [tr]);

  useEffect(() => { load(); }, [load]);

  const run = async (action, doneText) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (doneText) setNotice(doneText);
      await load();
      return true;
    } catch (err) {
      setError(tr(err.message || 'Failed to update user'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setError(tr('Password must be at least 8 characters'));
      return;
    }
    if (await run(() => platformApi.createAdmin(form), tr('User created successfully'))) setForm(null);
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError(tr('Password must be at least 8 characters'));
      return;
    }
    const ok = await run(
      () => platformApi.updateAdmin(resetFor._id, { password }),
      tr('The password was changed. {name} was signed out everywhere and has to sign in again.', { name: resetFor.name })
    );
    if (ok) {
      setResetFor(null);
      setPassword('');
    }
  };

  if (admins === null && !error) return <Loading message={tr('Loading...')} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{tr('Platform Admins')}</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {tr('People who manage the platform: organizations, plans, accounts. They belong to no organization.')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(emptyAdmin); setError(null); setNotice(null); }}>
          <UserPlus size={16} /> {tr('Add platform admin')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontSize: '0.85rem', display: 'flex', gap: 6, alignItems: 'center' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}
      {notice && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '0.85rem', display: 'flex', gap: 6, alignItems: 'center' }}>
          <CheckCircle2 size={15} /> {notice}
        </div>
      )}

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <ShieldCheck size={18} color="var(--primary)" /> {tr('Platform Admins')} ({admins?.length || 0})
        </h3>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr('Name')}</th>
                <th>{tr('Status')}</th>
                <th>{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(admins || []).map((a) => {
                const me = String(a._id) === String(user?._id);
                return (
                  <tr key={a._id}>
                    <td>
                      <strong>{a.name}</strong> {me && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({tr('you')})</span>}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{a.email}</div>
                    </td>
                    <td><span className={`badge badge-${a.status === 'inactive' ? 'inactive' : 'active'}`}>{tr(a.status === 'inactive' ? 'inactive' : 'active')}</span></td>
                    <td>
                      {me ? (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr('Change your own password in My Profile')}</span>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setResetFor(a); setPassword(''); setError(null); setNotice(null); }}>
                            <KeyRound size={13} /> {tr('Reset password')}
                          </button>
                          <button
                            className={`btn btn-sm ${a.status === 'inactive' ? 'btn-secondary' : 'btn-danger'}`}
                            disabled={busy}
                            onClick={() => run(() => platformApi.updateAdmin(a._id, { status: a.status === 'inactive' ? 'active' : 'inactive' }))}
                          >
                            {a.status === 'inactive' ? tr('Activate') : tr('Deactivate')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={Boolean(form)} onClose={() => setForm(null)} title={tr('Add platform admin')} maxWidth="560px">
        {form && (
          <form onSubmit={add}>
            <div className="grid-cols-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{tr('Name')} *</label>
                <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr('Email')} *</label>
                <input type="email" className="form-control" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr('Initial Password * (min 8 characters)')}</label>
                <input type="password" className="form-control" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr('Phone Number')}</label>
                <input className="form-control" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>{tr('Cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{tr('Add platform admin')}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(resetFor)} onClose={() => setResetFor(null)} title={tr('Reset password')} maxWidth="480px">
        {resetFor && (
          <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
            <strong>{tr('Set a new password for {name}', { name: resetFor.name })}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>
              {tr('The user is signed out everywhere and gets an email about the change. Tell them the new password in person.')}
            </span>
            <input type="password" className="form-control" required minLength={8} autoFocus autoComplete="new-password" placeholder={tr('New password (min 8 characters)')} value={password} onChange={(e) => setPassword(e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setResetFor(null)}>{tr('Cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{tr('Set new password')}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
