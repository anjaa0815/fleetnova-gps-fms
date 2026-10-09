import React from 'react';
import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  Radio,
  MapPinned,
  ClipboardList,
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
  CreditCard,
  UserCheck,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import ClixLogo from './ClixLogo.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

export default function Sidebar({ currentTab, onSelectTab, isMobileOpen, onCloseMobile }) {
  const { tr } = useT();
  const { user, logout, organization } = useAuth();
  const role = user?.role || 'driver';

  // Role-based Nav Configuration
  const navItems = [
    { id: 'organizations', label: tr("Organizations"), icon: Building2, roles: ['super_admin'] },
    { id: 'platform-admins', label: tr("Platform Admins"), icon: ShieldCheck, roles: ['super_admin'] },
    { id: 'dashboard', label: tr("Dashboard"), icon: LayoutDashboard, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'vehicles', label: tr("Vehicles"), icon: Truck, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'drivers', label: tr("Drivers"), icon: Users, roles: ['admin', 'fleet_manager'] },
    { id: 'devices', label: tr("GPS Devices"), icon: Radio, roles: ['admin', 'fleet_manager'] },
    { id: 'geofences', label: tr("Geofences"), icon: MapPinned, roles: ['admin', 'fleet_manager'] },
    { id: 'trips', label: tr("Trips"), icon: Navigation, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'fuel', label: tr("Fuel Management"), icon: Fuel, roles: ['admin', 'fleet_manager'] },
    { id: 'maintenance', label: tr("Maintenance"), icon: Wrench, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'expenses', label: tr("Expenses"), icon: Receipt, roles: ['admin', 'fleet_manager'] },
    { id: 'analytics', label: tr("Analytics"), icon: BarChart3, roles: ['admin', 'fleet_manager'] },
    { id: 'gps-reports', label: tr("GPS Reports"), icon: ClipboardList, roles: ['admin', 'fleet_manager'] },
    { id: 'reports', label: tr("Reports"), icon: FileText, roles: ['admin', 'fleet_manager'] },
    { id: 'notifications', label: tr("Notifications"), icon: Bell, roles: ['admin', 'fleet_manager', 'driver'] },
    { id: 'fleet-ai', label: tr("FleetAI Assistant"), icon: Sparkles, roles: ['admin', 'fleet_manager'] },
    { id: 'billing', label: tr("Billing"), icon: CreditCard, roles: ['admin'] },
    { id: 'settings', label: tr("Settings"), icon: Settings, roles: ['admin', 'fleet_manager'] },
    { id: 'profile', label: tr("My Profile"), icon: UserCheck, roles: ['super_admin', 'admin', 'fleet_manager', 'driver'] }
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
          <ClixLogo width={140} padding={5} />
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

        {/* The customer organization keeps its own name and logo under the CLIX logo */}
        {organization && (
          <div className="sidebar-org">
            <div className="brand-icon-box" style={{ width: 28, height: 28, flexShrink: 0 }}>
              {organization.branding?.logoUrl ? (
                <img src={organization.branding.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Truck size={16} />
              )}
            </div>
            <div className="sidebar-org-name" title={organization.name}>{organization.name}</div>
          </div>
        )}

        {/* Navigation List */}
        <div className="sidebar-nav">
          <div className="nav-section-title">{tr("Operations Menu")}</div>
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
                {user?.name || tr("Authorized User")}
              </div>
              <div
                style={{
                  fontSize: '0.7rem',
                  color: 'var(--accent-cyan)',
                  textTransform: 'uppercase',
                  fontWeight: 600
                }}
              >
                {role === "fleet_manager" ? tr("Fleet Manager") : tr(role)}
              </div>
            </div>
            <button
              onClick={logout}
              title={tr("Logout")}
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
