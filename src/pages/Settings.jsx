import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Users, Shield, Database, Sparkles, CheckCircle2, AlertTriangle, Key, Building2, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { authApi, organizationApi } from '../services/api.js';
import Loading from '../components/Loading.jsx';
import Modal from '../components/Modal.jsx';
import AlertDeliveryCard from '../components/AlertDeliveryCard.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

export default function Settings() {
  const { tr } = useT();
  const { user, role, setOrganization } = useAuth();
  const isAdmin = role === 'admin';

  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Organization profile (persisted)
  const [orgData, setOrgData] = useState(null);
  const [orgForm, setOrgForm] = useState({ name: '', contactEmail: '', contactPhone: '', address: '', primaryColor: '#2563eb', logoUrl: '', speedLimitKmh: 0 });
  const [orgMessage, setOrgMessage] = useState(null);
  const [orgError, setOrgError] = useState(null);
  const [orgSaving, setOrgSaving] = useState(false);

  // New user (admin)
  const emptyUser = { name: '', email: '', password: '', role: 'driver', phone: '' };
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState(emptyUser);
  const [userError, setUserError] = useState(null);
  const [userSaving, setUserSaving] = useState(false);

  // Settings State (local preview only)
  const [systemSettings, setSystemSettings] = useState({
    currency: 'MNT (₮)',
    speedLimit: 80,
    maintenanceAlertDays: 15,
    documentExpiryDays: 30,
    geminiModel: 'gemini-3.8-flash'
  });

  const fetchUsers = async () => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    try {
      const res = await authApi.getAllUsers();
      if (res.success) {
        setUsersList(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadOrganization = async () => {
    try {
      const res = await organizationApi.get();
      if (res.success) {
        setOrgData(res.data);
        setOrgForm({
          name: res.data.name,
          contactEmail: res.data.contactEmail,
          contactPhone: res.data.contactPhone,
          address: res.data.address,
          primaryColor: res.data.branding.primaryColor,
          logoUrl: res.data.branding.logoUrl,
          speedLimitKmh: res.data.settings?.speedLimitKmh || 0
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
    loadOrganization();
  }, [isAdmin]);

  const handleSaveOrganization = async (e) => {
    e.preventDefault();
    setOrgSaving(true);
    setOrgError(null);
    setOrgMessage(null);
    try {
      const res = await organizationApi.update({
        name: orgForm.name,
        contactEmail: orgForm.contactEmail,
        contactPhone: orgForm.contactPhone,
        address: orgForm.address,
        branding: { primaryColor: orgForm.primaryColor, logoUrl: orgForm.logoUrl },
        settings: { speedLimitKmh: Number(orgForm.speedLimitKmh) || 0 }
      });
      if (res.success) {
        setOrgData(res.data);
        setOrganization(res.data);
        setOrgMessage(tr('Organization updated successfully'));
      }
    } catch (err) {
      setOrgError(tr(err.message || 'Failed to update organization'));
    } finally {
      setOrgSaving(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserError(null);
    setUserSaving(true);
    try {
      await authApi.createUser(newUser);
      setIsUserModalOpen(false);
      setNewUser(emptyUser);
      fetchUsers();
      loadOrganization();
    } catch (err) {
      setUserError(tr(err.message || 'Failed to create user'));
    } finally {
      setUserSaving(false);
    }
  };

  const handleSaveSystemConfig = (e) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleToggleChannel = async (userId, channels) => {
    try {
      await authApi.updateAlertChannels(userId, channels);
      fetchUsers();
    } catch (err) {
      alert(tr(err.message || 'Failed to update alert channels'));
    }
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await authApi.updateUserStatus(userId, { status: nextStatus });
      fetchUsers();
    } catch (err) {
      alert(tr(err.message || 'Failed to update user status'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>{tr("System & Organization Settings")}</h2>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          {tr("Enterprise parameters, regulatory document thresholds, and user access control")}
        </p>
      </div>

      {saveSuccess && (
        <div
          style={{
            padding: '0.85rem 1rem',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <CheckCircle2 size={18} /> {tr("System parameters saved successfully!")}
        </div>
      )}

      {/* Organization Profile & Plan */}
      {isAdmin && orgData && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
            <Building2 size={18} color="var(--primary)" /> {tr("Organization Profile")}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("Plan")}</div>
              <strong style={{ color: 'var(--accent-cyan)' }}>{tr(orgData.plan)}</strong>
              {orgData.trialEndsAt && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {tr("Trial Ends")}: {new Date(orgData.trialEndsAt).toLocaleDateString()}
                </div>
              )}
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("Vehicles")}</div>
              <strong>{orgData.usage.vehicles} / {orgData.limits.maxVehicles < 0 ? '∞' : orgData.limits.maxVehicles}</strong>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("Users")}</div>
              <strong>{orgData.usage.users} / {orgData.limits.maxUsers < 0 ? '∞' : orgData.limits.maxUsers}</strong>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("Login Page")}</div>
              <a href={`${window.location.origin}/?org=${orgData.slug}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)', wordBreak: 'break-all' }}>
                ?org={orgData.slug}
              </a>
            </div>
          </div>

          {orgMessage && (
            <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              {orgMessage}
            </div>
          )}
          {orgError && (
            <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              {orgError}
            </div>
          )}

          <form onSubmit={handleSaveOrganization}>
            <div className="grid-cols-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">{tr("Organization Name")}</label>
                <input className="form-control" required maxLength={100} value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr("Contact Email")}</label>
                <input type="email" className="form-control" value={orgForm.contactEmail} onChange={(e) => setOrgForm({ ...orgForm, contactEmail: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr("Contact Phone")}</label>
                <input className="form-control" value={orgForm.contactPhone} onChange={(e) => setOrgForm({ ...orgForm, contactPhone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr("Address")}</label>
                <input className="form-control" value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr("Brand Color")}</label>
                <input type="color" className="form-control" style={{ height: '42px', padding: '4px' }} value={orgForm.primaryColor} onChange={(e) => setOrgForm({ ...orgForm, primaryColor: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr("Logo URL (https)")}</label>
                <input className="form-control" placeholder="https://" value={orgForm.logoUrl} onChange={(e) => setOrgForm({ ...orgForm, logoUrl: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">{tr("Speed limit alert (km/h, 0 = off)")}</label>
                <input type="number" min="0" max="300" step="1" className="form-control" value={orgForm.speedLimitKmh} onChange={(e) => setOrgForm({ ...orgForm, speedLimitKmh: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={orgSaving}>
                {orgSaving ? tr("Saving Changes...") : tr("Save Changes")}
              </button>
            </div>
          </form>
        </div>
      )}

      {isAdmin && <AlertDeliveryCard />}

      {/* Organization Parameters */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
          <SettingsIcon size={18} color="var(--primary)" /> {tr("Fleet Operations Parameters")}
        </h3>

        <form onSubmit={handleSaveSystemConfig}>
          <div className="grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Financial Accounting Currency")}</label>
              <input
                type="text"
                className="form-control"
                value={systemSettings.currency}
                disabled
              />
            </div>
          </div>

          <div className="grid-cols-3" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Maintenance Notice Lead (Days)")}</label>
              <input
                type="number"
                className="form-control"
                value={systemSettings.maintenanceAlertDays}
                onChange={(e) => setSystemSettings({ ...systemSettings, maintenanceAlertDays: parseInt(e.target.value) || 15 })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{tr("Document Expiry Alert (Days)")}</label>
              <input
                type="number"
                className="form-control"
                value={systemSettings.documentExpiryDays}
                onChange={(e) => setSystemSettings({ ...systemSettings, documentExpiryDays: parseInt(e.target.value) || 30 })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary">
              {tr("Save Parameters")}
            </button>
          </div>
        </form>
      </div>

      {/* FleetAI Architecture Specification */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <Sparkles size={18} color="var(--accent-cyan)" /> {tr("AI Engine Architecture & Security Boundary")}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', fontSize: '0.85rem' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("FOUNDATION MODEL")}</div>
            <strong style={{ color: 'var(--accent-cyan)' }}>{tr("Google Gemini 3.8 Flash")}</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{tr("High-speed analytical reasoning")}</div>
          </div>

          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("INTEGRATION PROTOCOL")}</div>
            <strong style={{ color: 'var(--accent-emerald)' }}>{tr("Express Server Proxy Route")}</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{tr("Zero client-side API key exposure")}</div>
          </div>

          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("DATABASE GROUNDING")}</div>
            <strong style={{ color: 'var(--primary)' }}>{tr("Read-Only Context Injection")}</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{tr("Answers strictly backed by Mongo records")}</div>
          </div>
        </div>
      </div>

      {/* Admin User Management Section */}
      {isAdmin && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Users size={18} color="var(--primary)" /> {tr("Organization User Management (Admin Only)")}
            </h3>
            <button className="btn btn-primary btn-sm" onClick={() => setIsUserModalOpen(true)}>
              <UserPlus size={14} /> {tr("Add User")}
            </button>
          </div>

          {loadingUsers ? (
            <Loading message={tr("Fetching user directory...")} />
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{tr("User Name")}</th>
                    <th>{tr("Email")}</th>
                    <th>{tr("Role")}</th>
                    <th>{tr("Status")}</th>
                    <th>{tr("Email alerts")}</th>
                    <th>{tr("SMS alerts")}</th>
                    <th>{tr("Action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u) => (
                    <tr key={u._id}>
                      <td><strong>{u.name}</strong></td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`role-badge ${u.role}`}>
                          {u.role === 'fleet_manager' ? tr("Fleet Manager") : tr(u.role)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${u.status}`}>
                          {tr(u.status)}
                        </span>
                      </td>
                      <td>
                        <input type="checkbox" checked={Boolean(u.alertChannels?.email)} onChange={(e) => handleToggleChannel(u._id, { email: e.target.checked })} />
                      </td>
                      <td>
                        <input type="checkbox" checked={Boolean(u.alertChannels?.sms)} onChange={(e) => handleToggleChannel(u._id, { sms: e.target.checked })} />
                      </td>
                      <td>
                        {String(u._id) !== String(user?._id) && (
                          <button
                            className={`btn btn-sm ${u.status === 'active' ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={() => handleToggleUserStatus(u._id, u.status)}
                          >
                            {u.status === 'active' ? tr("Deactivate") : tr("Activate")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title={tr("Add User")}>
        <form onSubmit={handleCreateUser}>
          {userError && (
            <div style={{ padding: '0.75rem 1rem', marginBottom: '1rem', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              {userError}
            </div>
          )}
          <div className="grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Full Name *")}</label>
              <input className="form-control" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Email Address *")}</label>
              <input type="email" className="form-control" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Initial Password * (min 8 characters)")}</label>
              <input type="password" className="form-control" required minLength={8} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Role")}</label>
              <select className="form-control" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="driver">{tr("driver")}</option>
                <option value="fleet_manager">{tr("Fleet Manager")}</option>
                <option value="admin">{tr("admin")}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Phone Number")}</label>
              <input className="form-control" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsUserModalOpen(false)}>{tr("Cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={userSaving}>
              {userSaving ? tr("Saving Changes...") : tr("Add User")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
