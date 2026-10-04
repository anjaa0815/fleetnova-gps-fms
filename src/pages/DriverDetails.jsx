import React, { useState, useEffect } from 'react';
import {
  User,
  ArrowLeft,
  Truck,
  Phone,
  Mail,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  Award,
  Navigation,
  CheckCircle2
} from 'lucide-react';
import Loading from '../components/Loading.jsx';
import StatCard from '../components/StatCard.jsx';
import { driverApi } from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

export default function DriverDetails({ driverId, onBack }) {
  const { tr } = useT();
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDriver = async () => {
      setLoading(true);
      try {
        const res = await driverApi.getById(driverId);
        if (res.success) {
          setDriver(res.data);
        }
      } catch (err) {
        setError(tr(err.message || 'Failed to load driver profile'));
      } finally {
        setLoading(false);
      }
    };
    if (driverId) fetchDriver();
  }, [driverId]);

  if (loading) {
    return <Loading message={tr("Loading driver profile, service ledger & safety record...")} />;
  }

  if (error || !driver) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <AlertTriangle size={40} color="#fb7185" style={{ margin: '0 auto 1rem auto' }} />
        <h3>{tr("Driver Profile Not Found")}</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem 0' }}>{error}</p>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} /> {tr("Back to Drivers")}
        </button>
      </div>
    );
  }

  const { performance = {}, trips = [], warnings = [], activeTrip } = driver;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> {tr("Back")}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="user-avatar-circle" style={{ width: '48px', height: '48px', fontSize: '1.25rem' }}>
              {driver.name.charAt(0)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{driver.name}</h2>
                <span className={`badge badge-${driver.status?.toLowerCase().replace(' ', '-')}`}>
                  {tr(driver.status)}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {tr("Driver ID:")} {driver.driverId} {tr("• Member since")} {driver.dateOfJoining ? new Date(driver.dateOfJoining).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Warnings Banner */}
      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {warnings.map((w, idx) => (
            <div
              key={idx}
              style={{
                padding: '0.85rem 1.25rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: w.type === 'danger' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                border: w.type === 'danger' ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                color: w.type === 'danger' ? '#fb7185' : '#fbbf24',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontWeight: 600
              }}
            >
              <AlertTriangle size={18} />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Driver Performance Metrics */}
      <div className="grid-cols-4">
        <StatCard
          title={tr("Assigned Deliveries")}
          value={performance.totalTrips || 0}
          subtext={tr("Total lifetime bookings")}
          icon={Navigation}
          color="#3b82f6"
        />
        <StatCard
          title={tr("Completed Trips")}
          value={performance.completedTrips || 0}
          subtext={tr("Delivered successfully")}
          icon={CheckCircle2}
          color="#10b981"
        />
        <StatCard
          title={tr("Distance Covered")}
          value={`${performance.totalDistanceKm?.toLocaleString() || 0} km`}
          subtext={tr("Highway & city transit")}
          icon={Truck}
          color="#06b6d4"
        />
        <StatCard
          title={tr("Delivery Success Rate")}
          value={`${performance.completionRate || 100}%`}
          subtext={tr("Proof of Delivery verified")}
          icon={Award}
          color="#8b5cf6"
        />
      </div>

      {/* Profile Details & Vehicle Info */}
      <div className="grid-cols-2">
        {/* Personal & License Information */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>
            <User size={18} color="var(--primary)" /> {tr("Driver Dossier & Credentials")}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', fontSize: '0.85rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>{tr("PRIMARY CONTACT")}</div>
              <div style={{ fontWeight: 600 }}>{driver.phone}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>{tr("EMAIL ADDRESS")}</div>
              <div style={{ fontWeight: 600 }}>{driver.email}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>{tr("COMMERCIAL LICENSE")}</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{driver.licenseNumber}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>{tr("LICENSE EXPIRY")}</div>
              <div style={{ fontWeight: 600 }}>
                {driver.licenseExpiry ? new Date(driver.licenseExpiry).toLocaleDateString() : 'N/A'}
              </div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ color: 'var(--text-muted)' }}>{tr("EMERGENCY CONTACT")}</div>
              <div style={{ fontWeight: 600 }}>{driver.emergencyContact || tr("None on file")}</div>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ color: 'var(--text-muted)' }}>{tr("RESIDENTIAL ADDRESS")}</div>
              <div style={{ fontWeight: 600 }}>{driver.address || tr("Address not registered")}</div>
            </div>
          </div>

          {driver.notes && (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.825rem' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{tr("QUALIFICATIONS & SPECIALIZATIONS")}</div>
              <p style={{ color: 'var(--text-secondary)' }}>{driver.notes}</p>
            </div>
          )}
        </div>

        {/* Assigned Vehicle Card */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>
            <Truck size={18} color="var(--accent-cyan)" /> {tr("Dedicated Fleet Vehicle")}
          </h3>

          {driver.assignedVehicle ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Truck size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                    {driver.assignedVehicle.registrationNumber}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {driver.assignedVehicle.brand} {driver.assignedVehicle.model} • {tr(driver.assignedVehicle.fuelType)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("VEHICLE STATUS")}</div>
                  <strong style={{ color: 'var(--accent-emerald)' }}>{tr(driver.assignedVehicle.status)}</strong>
                </div>
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{tr("CURRENT ODOMETER")}</div>
                  <strong>{driver.assignedVehicle.currentMileage?.toLocaleString()} {tr("km")}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              {tr("No commercial vehicle currently assigned to this driver.")}
            </div>
          )}
        </div>
      </div>

      {/* Driver Trip History Table */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <Navigation size={18} color="var(--primary)" /> {tr("Driver Transit & Delivery Log")}
        </h3>

        {trips.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{tr("No completed or scheduled trips found for this driver.")}</p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr("Trip ID")}</th>
                  <th>{tr("Route")}</th>
                  <th>{tr("Distance")}</th>
                  <th>{tr("Start Date")}</th>
                  <th>{tr("Purpose")}</th>
                  <th>{tr("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t._id}>
                    <td><strong>{t.tripId}</strong></td>
                    <td>{t.source} ➔ {t.destination}</td>
                    <td>{t.distance} {tr("km")}</td>
                    <td>{new Date(t.startDate).toLocaleDateString()}</td>
                    <td>{tr(t.purpose)}</td>
                    <td><span className={`badge badge-${t.status.toLowerCase().replace(' ', '-')}`}>{tr(t.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
