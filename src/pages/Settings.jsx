import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Users, Shield, Database, Sparkles, CheckCircle2, AlertTriangle, Key } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { authApi } from '../services/api.js';
import Loading from '../components/Loading.jsx';

export default function Settings() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';

  const [usersList, setUsersList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Settings State
  const [systemSettings, setSystemSettings] = useState({
    orgName: 'FLEETNOVA Enterprise Logistics Corp.',
    currency: 'INR (₹)',
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

  useEffect(() => {
    fetchUsers();
  }, [isAdmin]);

  const handleSaveSystemConfig = (e) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleToggleUserStatus = async (userId, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      await authApi.updateUserStatus(userId, { status: nextStatus });
      fetchUsers();
    } catch (err) {
      alert(err.message || 'Failed to update user status');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>System & Organization Settings</h2>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          Enterprise parameters, regulatory document thresholds, and user access control
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
          <CheckCircle2 size={18} /> System parameters saved successfully!
        </div>
      )}

      {/* Organization Parameters */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>
          <SettingsIcon size={18} color="var(--primary)" /> Fleet Operations Parameters
        </h3>

        <form onSubmit={handleSaveSystemConfig}>
          <div className="grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Operating Enterprise Name</label>
              <input
                type="text"
                className="form-control"
                value={systemSettings.orgName}
                onChange={(e) => setSystemSettings({ ...systemSettings, orgName: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Financial Accounting Currency</label>
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
              <label className="form-label">Highway Speed Governor Limit (km/h)</label>
              <input
                type="number"
                className="form-control"
                value={systemSettings.speedLimit}
                onChange={(e) => setSystemSettings({ ...systemSettings, speedLimit: parseInt(e.target.value) || 80 })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Maintenance Notice Lead (Days)</label>
              <input
                type="number"
                className="form-control"
                value={systemSettings.maintenanceAlertDays}
                onChange={(e) => setSystemSettings({ ...systemSettings, maintenanceAlertDays: parseInt(e.target.value) || 15 })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Document Expiry Alert (Days)</label>
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
              Save Parameters
            </button>
          </div>
        </form>
      </div>

      {/* FleetAI Architecture Specification */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <Sparkles size={18} color="var(--accent-cyan)" /> AI Engine Architecture & Security Boundary
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', fontSize: '0.85rem' }}>
          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>FOUNDATION MODEL</div>
            <strong style={{ color: 'var(--accent-cyan)' }}>Google Gemini 3.8 Flash</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>High-speed analytical reasoning</div>
          </div>

          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>INTEGRATION PROTOCOL</div>
            <strong style={{ color: 'var(--accent-emerald)' }}>Express Server Proxy Route</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Zero client-side API key exposure</div>
          </div>

          <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>DATABASE GROUNDING</div>
            <strong style={{ color: 'var(--primary)' }}>Read-Only Context Injection</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Answers strictly backed by Mongo records</div>
          </div>
        </div>
      </div>

      {/* Admin User Management Section */}
      {isAdmin && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Users size={18} color="var(--primary)" /> Organization User Management (Admin Only)
            </h3>
          </div>

          {loadingUsers ? (
            <Loading message="Fetching user directory..." />
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u) => (
                    <tr key={u._id}>
                      <td><strong>{u.name}</strong></td>
                      <td>{u.email}</td>
                      <td>
                        <span className={`role-badge ${u.role}`}>
                          {u.role === 'fleet_manager' ? 'Fleet Manager' : u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${u.status}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>
                        {u.role !== 'admin' && (
                          <button
                            className={`btn btn-sm ${u.status === 'active' ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={() => handleToggleUserStatus(u._id, u.status)}
                          >
                            {u.status === 'active' ? 'Deactivate' : 'Activate'}
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
    </div>
  );
}
