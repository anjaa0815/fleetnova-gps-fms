import React, { useEffect, useState } from 'react';
import { Building2, Plus, Link as LinkIcon } from 'lucide-react';
import Modal from '../components/Modal.jsx';
import Loading from '../components/Loading.jsx';
import { platformApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const PLANS = ['trial', 'basic', 'pro', 'enterprise'];

const emptyForm = {
  organizationName: '',
  plan: 'trial',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
  adminPhone: ''
};

const limitText = (used, max) => `${used} / ${max < 0 ? '∞' : max}`;

export default function Organizations() {
  const { tr } = useT();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadOrgs = async () => {
    try {
      const res = await platformApi.listOrganizations();
      if (res.success) setOrgs(res.data);
      setError(null);
    } catch (err) {
      setError(tr(err.message || 'Failed to load organizations'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrgs();
  }, []);

  const handleUpdate = async (id, patch) => {
    try {
      await platformApi.updateOrganization(id, patch);
      loadOrgs();
    } catch (err) {
      alert(tr(err.message || 'Failed to update organization'));
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (form.adminPassword.length < 8) {
      setFormError(tr('Password must be at least 8 characters'));
      return;
    }
    setSaving(true);
    try {
      await platformApi.createOrganization(form);
      setIsModalOpen(false);
      setForm(emptyForm);
      loadOrgs();
    } catch (err) {
      setFormError(tr(err.message || 'Failed to create organization'));
    } finally {
      setSaving(false);
    }
  };

  const loginLink = (slug) => `${window.location.origin}/?org=${slug}`;

  if (loading) return <Loading message={tr('Loading organizations...')} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{tr('Platform Organizations')}</h2>
          <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
            {tr('Customer companies, subscription plans and account status')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} /> {tr('New Organization')}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <Building2 size={18} color="var(--primary)" /> {tr('Organizations')} ({orgs.length})
        </h3>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr('Organization')}</th>
                <th>{tr('Plan')}</th>
                <th>{tr('Status')}</th>
                <th>{tr('Users')}</th>
                <th>{tr('Vehicles')}</th>
                <th>{tr('Trial Ends')}</th>
                <th>{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org._id}>
                  <td>
                    <strong>{org.name}</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <a href={loginLink(org.slug)} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <LinkIcon size={11} /> ?org={org.slug}
                      </a>
                    </div>
                  </td>
                  <td>
                    <select
                      className="form-control"
                      style={{ padding: '0.3rem 0.5rem', minWidth: '120px' }}
                      value={org.plan}
                      onChange={(e) => handleUpdate(org._id, { plan: e.target.value })}
                    >
                      {PLANS.map((p) => (
                        <option key={p} value={p}>{tr(p)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`badge badge-${org.status === 'active' ? 'active' : 'inactive'}`}>
                      {tr(org.status)}
                    </span>
                  </td>
                  <td>{limitText(org.usage.users, org.limits.maxUsers)}</td>
                  <td>{limitText(org.usage.vehicles, org.limits.maxVehicles)}</td>
                  <td>{org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${org.status === 'active' ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => handleUpdate(org._id, { status: org.status === 'active' ? 'suspended' : 'active' })}
                    >
                      {org.status === 'active' ? tr('Suspend') : tr('Activate')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={tr('New Organization')}>
        <form onSubmit={handleCreate}>
          {formError && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {formError}
            </div>
          )}
          <div className="grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{tr('Organization / Company Name *')}</label>
              <input className="form-control" required maxLength={100} value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Plan')}</label>
              <select className="form-control" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
                {PLANS.map((p) => (
                  <option key={p} value={p}>{tr(p)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Administrator Name *')}</label>
              <input className="form-control" required value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Administrator Email *')}</label>
              <input type="email" className="form-control" required value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Initial Password * (min 8 characters)')}</label>
              <input type="password" className="form-control" required minLength={8} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr('Phone Number')}</label>
              <input className="form-control" value={form.adminPhone} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>{tr('Cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? tr('Saving Changes...') : tr('Create Organization')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
