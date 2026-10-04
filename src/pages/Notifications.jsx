import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  ShieldAlert,
  Calendar,
  Info,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import Loading from '../components/Loading.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { notificationApi } from '../services/api.js';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, maintenance, expiry, trip

  const fetchNotifs = async () => {
    setLoading(true);
    try {
      const res = await notificationApi.getAll();
      if (res.success) {
        setNotifications(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationApi.markAsRead(id);
      fetchNotifs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      fetchNotifs();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredNotifs = notifications.filter((n) => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'maintenance') return n.type.includes('maint');
    if (filter === 'expiry') return n.type.includes('expiry');
    if (filter === 'trip') return n.type.includes('trip');
    return true;
  });

  const getIcon = (type) => {
    if (type.includes('overdue')) return <ShieldAlert size={20} color="#fb7185" />;
    if (type.includes('expiry') || type.includes('due')) return <AlertTriangle size={20} color="#fbbf24" />;
    if (type.includes('trip')) return <Calendar size={20} color="#60a5fa" />;
    return <Info size={20} color="#34d399" />;
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Card */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Notification & Alert Center</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            System-generated compliance alerts, document expiration countdowns, and dispatch updates
          </p>
        </div>

        {unreadCount > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={handleMarkAllRead}>
            <CheckCheck size={16} /> Mark All as Read ({unreadCount})
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: `All (${notifications.length})` },
          { id: 'unread', label: `Unread (${unreadCount})` },
          { id: 'expiry', label: 'Document Expiries' },
          { id: 'maintenance', label: 'Maintenance Due' },
          { id: 'trip', label: 'Trips & Dispatch' }
        ].map((t) => (
          <button
            key={t.id}
            className={`btn btn-sm ${filter === t.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="card" style={{ padding: '0.5rem' }}>
        {loading ? (
          <Loading message="Syncing alerts..." />
        ) : filteredNotifs.length === 0 ? (
          <EmptyState
            title="No Notifications Found"
            description="All fleet compliance notices and dispatches have been reviewed."
            icon={CheckCircle2}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredNotifs.map((n) => (
              <div
                key={n._id}
                style={{
                  padding: '1.15rem 1.25rem',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  backgroundColor: !n.isRead ? 'rgba(37, 99, 235, 0.06)' : 'transparent',
                  transition: 'background var(--transition-fast)'
                }}
              >
                <div style={{ marginTop: '2px', flexShrink: 0 }}>
                  {getIcon(n.type)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                      {n.title}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                    {n.message}
                  </div>
                </div>

                {!n.isRead && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleMarkAsRead(n._id)}
                    title="Mark as read"
                    style={{ flexShrink: 0 }}
                  >
                    <CheckCheck size={14} /> Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
