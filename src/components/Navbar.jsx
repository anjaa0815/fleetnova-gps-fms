import React from 'react';
import { Menu, Sparkles, User, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationBell from './NotificationBell.jsx';

export default function Navbar({ currentTitle, onToggleMobile, onNavigate, onOpenFleetAI }) {
  const { user, logout } = useAuth();
  const role = user?.role || 'driver';

  return (
    <header className="navbar">
      <div className="navbar-left">
        <button
          onClick={onToggleMobile}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            cursor: 'pointer'
          }}
          className="mobile-menu-btn"
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} />
        </button>

        <h1 className="page-header-title">
          {currentTitle || 'Dashboard'}
        </h1>
      </div>

      <div className="navbar-right">
        {/* Quick FleetAI Launcher in Navbar */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenFleetAI}
          style={{
            borderColor: 'rgba(6, 182, 212, 0.4)',
            color: 'var(--accent-cyan)'
          }}
        >
          <Sparkles size={14} />
          <span className="hidden-mobile">FleetAI</span>
        </button>

        {/* Notifications Component */}
        <NotificationBell onNavigate={onNavigate} />

        {/* Role Tag */}
        <span className={`role-badge ${role}`}>
          {role === 'fleet_manager' ? 'Manager' : role}
        </span>

        {/* User Mini Avatar Menu */}
        <div
          onClick={() => onNavigate('profile')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-card)'
          }}
          title="Account Profile"
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 700
            }}
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <span style={{ fontSize: '0.825rem', fontWeight: 600 }} className="hidden-mobile">
            {user?.name?.split(' ')[0] || 'User'}
          </span>
        </div>
      </div>
    </header>
  );
}
