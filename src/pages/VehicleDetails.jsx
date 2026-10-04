import React, { useState, useEffect } from 'react';
import {
  Truck,
  ArrowLeft,
  Calendar,
  AlertTriangle,
  Fuel,
  Wrench,
  Receipt,
  Navigation,
  ShieldCheck,
  User,
  Clock,
  CheckCircle2
} from 'lucide-react';
import Loading from '../components/Loading.jsx';
import StatCard from '../components/StatCard.jsx';
import { vehicleApi } from '../services/api.js';

export default function VehicleDetails({ vehicleId, onBack }) {
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, trips, fuel, maintenance, expenses

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      try {
        const res = await vehicleApi.getById(vehicleId);
        if (res.success) {
          setVehicle(res.data);
        }
      } catch (err) {
        setError(err.message || 'Failed to load vehicle profile');
      } finally {
        setLoading(false);
      }
    };
    if (vehicleId) fetchDetails();
  }, [vehicleId]);

  if (loading) {
    return <Loading message="Loading detailed vehicle telematics and service dossier..." />;
  }

  if (error || !vehicle) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <AlertTriangle size={40} color="#fb7185" style={{ margin: '0 auto 1rem auto' }} />
        <h3>Vehicle Record Not Found</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem 0' }}>{error}</p>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Back to Vehicles
        </button>
      </div>
    );
  }

  const { analytics, warnings = [], trips = [], fuels = [], maintenance = [], expenses = [] } = vehicle;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header & Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn btn-secondary" onClick={onBack}>
            <ArrowLeft size={16} /> Back
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{vehicle.registrationNumber}</h2>
              <span className={`badge badge-${vehicle.status?.toLowerCase().replace(' ', '-')}`}>
                {vehicle.status}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {vehicle.brand} {vehicle.model} • {vehicle.vehicleType} • {vehicle.fuelType} • {vehicle.vehicleId}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={15} /> Last Service: {vehicle.lastServiceDate ? new Date(vehicle.lastServiceDate).toLocaleDateString() : 'N/A'}
          </span>
        </div>
      </div>

      {/* Warnings & Expiry Alerts */}
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

      {/* Key Metric KPI Cards */}
      <div className="grid-cols-4">
        <StatCard
          title="Total Trips Run"
          value={analytics?.totalTrips || 0}
          subtext={`${analytics?.totalDistance?.toLocaleString() || 0} km logged`}
          icon={Navigation}
          color="#3b82f6"
        />
        <StatCard
          title="Fuel Consumed"
          value={`${analytics?.totalFuelUsed || 0} L`}
          subtext={`₹${analytics?.totalFuelCost?.toLocaleString() || 0} spent`}
          icon={Fuel}
          color="#06b6d4"
        />
        <StatCard
          title="Maintenance Cost"
          value={`₹${analytics?.totalMaintenanceCost?.toLocaleString() || 0}`}
          subtext={`${maintenance.length} service logs`}
          icon={Wrench}
          color="#f59e0b"
        />
        <StatCard
          title="Total Operating Cost"
          value={`₹${analytics?.totalExpenses?.toLocaleString() || 0}`}
          subtext="Fuel + Repair + Tolls"
          icon={Receipt}
          color="#8b5cf6"
        />
      </div>

      {/* Tabs navigation */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '0.5rem'
        }}
      >
        {['overview', 'trips', 'fuel', 'maintenance', 'expenses'].map((tab) => (
          <button
            key={tab}
            className={`btn btn-sm ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform: 'capitalize' }}
            onClick={() => setActiveTab(tab)}
          >
            {tab} History
          </button>
        ))}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid-cols-2">
          {/* Technical Specifications */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>
              <Truck size={18} color="var(--primary)" /> Technical & Registration Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', fontSize: '0.85rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>REGISTRATION NUMBER</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{vehicle.registrationNumber}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>VEHICLE ID</div>
                <div style={{ fontWeight: 600 }}>{vehicle.vehicleId}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>BRAND & MODEL</div>
                <div style={{ fontWeight: 600 }}>{vehicle.brand} {vehicle.model}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>MANUFACTURING YEAR</div>
                <div style={{ fontWeight: 600 }}>{vehicle.manufacturingYear}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>FUEL TYPE</div>
                <div style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{vehicle.fuelType}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>TANK / BATTERY CAPACITY</div>
                <div style={{ fontWeight: 600 }}>{vehicle.fuelCapacity} L / Units</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>CURRENT ODOMETER</div>
                <div style={{ fontWeight: 600 }}>{vehicle.currentMileage?.toLocaleString()} km</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>ACQUISITION DATE</div>
                <div style={{ fontWeight: 600 }}>{vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toLocaleDateString() : 'N/A'}</div>
              </div>
            </div>

            {vehicle.notes && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.825rem' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>OPERATIONAL NOTES</div>
                <p style={{ color: 'var(--text-secondary)' }}>{vehicle.notes}</p>
              </div>
            )}
          </div>

          {/* Compliance & Driver Assignment */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Driver Assignment Card */}
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
                <User size={18} color="var(--accent-emerald)" /> Assigned Commercial Driver
              </h3>
              {vehicle.assignedDriver ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div className="user-avatar-circle" style={{ width: '42px', height: '42px', fontSize: '1rem' }}>
                    {vehicle.assignedDriver.name?.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{vehicle.assignedDriver.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Phone: {vehicle.assignedDriver.phone} • License: {vehicle.assignedDriver.licenseNumber}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                  No driver currently assigned to this vehicle
                </div>
              )}
            </div>

            {/* Document Compliance Card */}
            <div className="card">
              <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>
                <ShieldCheck size={18} color="var(--primary)" /> Regulatory Document Expiry
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Comprehensive Insurance:</span>
                  <strong>{vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toLocaleDateString() : 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Registration Certificate (RC):</span>
                  <strong>{vehicle.registrationExpiry ? new Date(vehicle.registrationExpiry).toLocaleDateString() : 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Next Scheduled Service:</span>
                  <strong>{vehicle.nextServiceDate ? new Date(vehicle.nextServiceDate).toLocaleDateString() : 'N/A'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Trips */}
      {activeTab === 'trips' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>Dispatched Deliveries</h3>
          {trips.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No trip records associated with this vehicle.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Route</th>
                    <th>Distance</th>
                    <th>Start Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t._id}>
                      <td><strong>{t.tripId}</strong></td>
                      <td>{t.source} ➔ {t.destination}</td>
                      <td>{t.distance} km</td>
                      <td>{new Date(t.startDate).toLocaleDateString()}</td>
                      <td><span className={`badge badge-${t.status.toLowerCase().replace(' ', '-')}`}>{t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Fuel */}
      {activeTab === 'fuel' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>Fueling History</h3>
          {fuels.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No fuel records logged for this vehicle.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Record ID</th>
                    <th>Date</th>
                    <th>Quantity</th>
                    <th>Rate</th>
                    <th>Total Cost</th>
                    <th>Odometer</th>
                  </tr>
                </thead>
                <tbody>
                  {fuels.map((f) => (
                    <tr key={f._id}>
                      <td><strong>{f.fuelRecordId}</strong></td>
                      <td>{new Date(f.date).toLocaleDateString()}</td>
                      <td>{f.quantity} L</td>
                      <td>₹{f.pricePerLiter}</td>
                      <td><strong>₹{f.totalCost?.toLocaleString()}</strong></td>
                      <td>{f.odometerReading?.toLocaleString()} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Maintenance */}
      {activeTab === 'maintenance' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>Service & Workshop History</h3>
          {maintenance.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No maintenance jobs recorded.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Service Date</th>
                    <th>Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((m) => (
                    <tr key={m._id}>
                      <td><strong>{m.maintenanceId}</strong></td>
                      <td>{m.maintenanceType}</td>
                      <td>{m.description}</td>
                      <td>{new Date(m.serviceDate).toLocaleDateString()}</td>
                      <td><strong>₹{m.cost?.toLocaleString()}</strong></td>
                      <td><span className={`badge badge-${m.status.toLowerCase().replace(' ', '-')}`}>{m.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Expenses */}
      {activeTab === 'expenses' && (
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: '1rem' }}>Operating Expenses Ledger</h3>
          {expenses.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No expenses recorded for this vehicle.</p>
          ) : (
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Expense ID</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e._id}>
                      <td><strong>{e.expenseId}</strong></td>
                      <td><span className="badge badge-ontrip">{e.category}</span></td>
                      <td>{e.description}</td>
                      <td>{new Date(e.date).toLocaleDateString()}</td>
                      <td><strong>₹{e.amount?.toLocaleString()}</strong></td>
                      <td>{e.paymentMethod}</td>
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
