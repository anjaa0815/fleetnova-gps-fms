import React from 'react';
import {
  LayoutDashboard,
  Truck,
  Users,
  Navigation,
  Fuel,
  Wrench,
  Receipt,
  BarChart3,
  FileText,
  Bell,
  Sparkles,
  Settings,
  UserCheck,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Sidebar({ currentTab, onSelectTab, isMobileOpen, onCloseMobile }) {
  const { user, logout } = useAuth();
  const role = user?.role || 'driver';

  // Role-based Nav Configuration
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'vehicles', label: 'Vehicles', icon: Truck, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'drivers', label: 'Drivers', icon: Users, roles: ['admin', 'fleet_manager'] },
    { id: 'trips', label: 'Trips', icon: Navigation, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'fuel', label: 'Fuel Management', icon: Fuel, roles: ['admin', 'fleet_manager'] },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'expenses', label: 'Expenses', icon: Receipt, roles: ['admin', 'fleet_manager'] },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'fleet_manager'] },
    { id: 'reports', label: 'Reports', icon: FileText, roles: ['admin', 'fleet_manager'] },
    { id: 'notifications', label: 'Notifications', icon: Bell, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'fleet-ai', label: 'FleetAI Assistant', icon: Sparkles, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['admin', 'fleet_manager'] },
    { id: 'profile', label: 'My Profile', icon: UserCheck, roles: ['admin', 'fleet_manager', 'driver'] }
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  const handleTabClick = (id) => {
    onSelectTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            zIndex: 35,
            backdropFilter: 'blur(3px)'
          }}
        />
      )}

      <aside className={`sidebar ${isMobileOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-header">
          <div className="brand-logo-area">
            <div className="brand-icon-box">
              <Truck size={22} />
            </div>
            <div>
              <div className="brand-text-name">FLEETNOVA</div>
              <div className="brand-tagline">SMART FLEET MANAGEMENT</div>
            </div>
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              style={{
                display: 'none',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer'
              }}
              className="mobile-close-btn"
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation List */}
        <div className="sidebar-nav">
          <div className="nav-section-title">Operations Menu</div>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <div
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`nav-link-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>

        {/* User Footer & Logout */}
        <div className="sidebar-footer">
          <div className="user-snippet-card">
            <div className="user-avatar-circle">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {user?.name || 'Authorized User'}
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--accent-cyan)',
                  textTransform: 'uppercase',
                  fontWeight: 600
                }}
              >
                {role === 'fleet_manager' ? 'Fleet Manager' : role}
              </div>
            </div>
            <button
              onClick={logout}
              title="Logout"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fb7185',
                cursor: 'pointer',
                padding: '0.35rem',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
