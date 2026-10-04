import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Loading from './components/Loading.jsx';

// Pages
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Vehicles from './pages/Vehicles.jsx';
import VehicleDetails from './pages/VehicleDetails.jsx';
import Drivers from './pages/Drivers.jsx';
import DriverDetails from './pages/DriverDetails.jsx';
import Trips from './pages/Trips.jsx';
import Fuel from './pages/Fuel.jsx';
import Maintenance from './pages/Maintenance.jsx';
import Expenses from './pages/Expenses.jsx';
import Analytics from './pages/Analytics.jsx';
import Reports from './pages/Reports.jsx';
import Notifications from './pages/Notifications.jsx';
import FleetAI from './pages/FleetAI.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import { useT } from './i18n/LanguageContext.jsx';
import LanguageSwitch from './components/LanguageSwitch.jsx';

function MainApp() {
  const { tr } = useT();
  const { isAuthenticated, loading } = useAuth();

  // Auth sub-view when not logged in
  const [authView, setAuthView] = useState('login'); // 'login' | 'register' | 'forgot'

  // Dashboard tab state
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState(null);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0d14' }}>
        <Loading message={tr("Initializing FLEETNOVA Telematics Engine...")} />
      </div>
    );
  }

  // Unauthenticated screen
  if (!isAuthenticated) {
    let authScreen;
    if (authView === 'register') {
      authScreen = <Register onSwitchToLogin={() => setAuthView('login')} />;
    } else if (authView === 'forgot') {
      authScreen = <ForgotPassword onSwitchToLogin={() => setAuthView('login')} />;
    } else {
      authScreen = (
        <Login
          onSwitchToRegister={() => setAuthView('register')}
          onSwitchToForgot={() => setAuthView('forgot')}
        />
      );
    }
    return (
      <>
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 50 }}>
          <LanguageSwitch />
        </div>
        {authScreen}
      </>
    );
  }

  // Titles mapping
  const titles = {
    dashboard: tr('Operations Dashboard'),
    vehicles: tr('Vehicles Fleet Registry'),
    'vehicle-details': tr('Vehicle Telematics & History'),
    drivers: tr('Commercial Drivers'),
    'driver-details': tr('Driver Service Record'),
    trips: tr('Trip Logistics & Dispatch'),
    fuel: tr('Fuel Consumption & Costs'),
    maintenance: tr('Preventive Maintenance'),
    expenses: tr('Operating Expenses'),
    analytics: tr('Fleet Analytics & Insights'),
    reports: tr('Audit & Compliance Reports'),
    notifications: tr('Notifications & Alerts'),
    'fleet-ai': tr('FleetAI Operations Co-Pilot'),
    settings: tr('System & Organization Settings'),
    profile: tr('User Profile Settings')
  };

  const navigateTo = (tab) => {
    setCurrentTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <DashboardLayout
      currentTab={currentTab}
      onSelectTab={navigateTo}
      currentTitle={titles[currentTab] || 'FLEETNOVA'}
    >
      {currentTab === 'dashboard' && <Dashboard onNavigate={navigateTo} />}

      {currentTab === 'vehicles' && (
        <Vehicles
          onSelectVehicle={(id) => {
            setSelectedVehicleId(id);
            setCurrentTab('vehicle-details');
          }}
        />
      )}

      {currentTab === 'vehicle-details' && (
        <VehicleDetails
          vehicleId={selectedVehicleId}
          onBack={() => setCurrentTab('vehicles')}
        />
      )}

      {currentTab === 'drivers' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <Drivers
            onSelectDriver={(id) => {
              setSelectedDriverId(id);
              setCurrentTab('driver-details');
            }}
          />
        </ProtectedRoute>
      )}

      {currentTab === 'driver-details' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <DriverDetails
            driverId={selectedDriverId}
            onBack={() => setCurrentTab('drivers')}
          />
        </ProtectedRoute>
      )}

      {currentTab === 'trips' && <Trips />}

      {currentTab === 'fuel' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <Fuel />
        </ProtectedRoute>
      )}

      {currentTab === 'maintenance' && <Maintenance />}

      {currentTab === 'expenses' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <Expenses />
        </ProtectedRoute>
      )}

      {currentTab === 'analytics' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <Analytics />
        </ProtectedRoute>
      )}

      {currentTab === 'reports' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <Reports />
        </ProtectedRoute>
      )}

      {currentTab === 'notifications' && <Notifications />}

      {currentTab === 'fleet-ai' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <FleetAI />
        </ProtectedRoute>
      )}

      {currentTab === 'settings' && (
        <ProtectedRoute allowedRoles={['admin', 'fleet_manager']}>
          <Settings />
        </ProtectedRoute>
      )}

      {currentTab === 'profile' && <Profile />}
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
