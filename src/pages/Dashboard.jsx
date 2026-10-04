import React, { useState, useEffect } from 'react';
import {
  Truck,
  Users,
  Navigation,
  Fuel,
  Wrench,
  Receipt,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Activity
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import Loading from '../components/Loading.jsx';
import { dashboardApi } from '../services/api.js';

export default function Dashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await dashboardApi.getData();
      if (res.success) {
        setData(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return <Loading message="Syncing live fleet telemetry and financial metrics..." />;
  }

  if (error || !data) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
        <AlertTriangle size={40} color="#fb7185" style={{ margin: '0 auto 1rem auto' }} />
        <h3>Telemetry Feed Error</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem 0' }}>{error}</p>
        <button className="btn btn-primary" onClick={fetchDashboard}>
          Retry Sync
        </button>
      </div>
    );
  }

  const { cards, vehicleStatusBreakdown, recentTrips, upcomingMaintenance, expenseCategories, fuelOverview, charts } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Banner Alert for Due/Overdue Maintenance */}
      {cards.maintenanceVehicles > 0 && (
        <div
          style={{
            padding: '1rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={20} color="#fbbf24" />
            <div>
              <strong style={{ color: '#fbbf24' }}>Fleet Advisory:</strong> {cards.maintenanceVehicles} vehicle(s) currently require scheduled maintenance or emergency service.
            </div>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => onNavigate('maintenance')}
            style={{ backgroundColor: '#f59e0b', color: '#000', fontWeight: 700 }}
          >
            Review Maintenance Roster
          </button>
        </div>
      )}

      {/* Primary KPI Metric Cards (Grid of 5x2 or 4x2) */}
      <div className="grid-cols-4">
        <StatCard
          title="Total Vehicles"
          value={cards.totalVehicles}
          subtext={`${cards.activeVehicles} on trip | ${cards.availableVehicles} available`}
          icon={Truck}
          color="#3b82f6"
        />
        <StatCard
          title="Active Deliveries"
          value={cards.activeTrips}
          subtext={`${cards.scheduledTrips} scheduled | ${cards.completedTrips} completed`}
          icon={Navigation}
          color="#10b981"
        />
        <StatCard
          title="Active Drivers"
          value={cards.totalDrivers}
          subtext={`${cards.availableDrivers} ready for assignment`}
          icon={Users}
          color="#06b6d4"
        />
        <StatCard
          title="Maintenance Alert"
          value={cards.maintenanceVehicles}
          subtext="Vehicles currently in workshop"
          icon={Wrench}
          color="#f59e0b"
        />
      </div>

      <div className="grid-cols-4">
        <StatCard
          title="Gross Expenses"
          value={`₹${cards.totalExpenses.toLocaleString()}`}
          subtext="Comprehensive operating costs"
          icon={Receipt}
          color="#8b5cf6"
        />
        <StatCard
          title="Fuel Expenditure"
          value={`₹${cards.totalFuelCost.toLocaleString()}`}
          subtext={`${cards.totalFuelConsumed} Liters consumed`}
          icon={Fuel}
          color="#06b6d4"
        />
        <StatCard
          title="Maintenance Cost"
          value={`₹${cards.totalMaintenanceCost.toLocaleString()}`}
          subtext="Scheduled services & parts"
          icon={Wrench}
          color="#fb7185"
        />
        <StatCard
          title="Avg Fuel Efficiency"
          value={`${cards.avgFuelEfficiency} km/L`}
          subtext="Commercial fleet baseline"
          icon={TrendingUp}
          color="#10b981"
        />
      </div>

      {/* Vehicle Status & Realtime Fleet Utilization */}
      <div className="grid-cols-3">
        {/* Status Visual Bars Card */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header">
            <h3 className="card-title">
              <Activity size={18} color="var(--primary)" /> Real-Time Vehicle Status & Allocation
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('vehicles')}>
              View All Vehicles <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {vehicleStatusBreakdown.map((item) => (
              <div
                key={item.status}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {item.status}
                  </span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }} />
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800 }}>{item.count}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.percentage}% of fleet</div>
              </div>
            ))}
          </div>

          {/* Unified Visual Bar */}
          <div
            style={{
              height: '14px',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              overflow: 'hidden',
              backgroundColor: 'rgba(255,255,255,0.06)'
            }}
          >
            {vehicleStatusBreakdown.map((item) => (
              <div
                key={item.status}
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: item.color,
                  transition: 'width 0.5s ease'
                }}
                title={`${item.status}: ${item.count} (${item.percentage}%)`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.85rem', flexWrap: 'wrap' }}>
            {vehicleStatusBreakdown.map((item) => (
              <div key={item.status} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: item.color }} />
                {item.status} ({item.count})
              </div>
            ))}
          </div>
        </div>

        {/* Quick FleetAI Insights Card */}
        <div
          className="card"
          style={{
            background: 'linear-gradient(145deg, rgba(21, 29, 48, 0.95), rgba(15, 23, 42, 0.98))',
            borderColor: 'rgba(6, 182, 212, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}
              >
                <Sparkles size={18} />
              </div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>FleetAI Smart Co-Pilot</h4>
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
              Gemini 3.8 is continuously analyzing trip logs, fuel consumption peaks, and scheduled repair timelines.
            </p>
            <div
              style={{
                backgroundColor: 'rgba(10, 13, 20, 0.6)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.775rem',
                color: 'var(--text-secondary)',
                marginBottom: '1rem'
              }}
            >
              💡 <strong>AI Tip:</strong> {cards.avgFuelEfficiency < 12 ? 'Diesel fuel consumption spiked 6% on northern corridor routes. Check tire pressures on multi-axle trailers.' : 'High fleet efficiency sustained this week with electric couriers taking 100% of urban parcel routes.'}
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => onNavigate('fleet-ai')}
            style={{ width: '100%', gap: '0.5rem' }}
          >
            Launch FleetAI Assistant <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Recent Trips & Upcoming Maintenance */}
      <div className="grid-cols-2">
        {/* Recent Trips */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Navigation size={18} color="var(--primary)" /> Active & Recent Deliveries
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('trips')}>
              All Trips <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {recentTrips.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No recent trip dispatches recorded.</p>
            ) : (
              recentTrips.map((t) => (
                <div
                  key={t._id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2px' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {t.tripId}
                      </strong>
                      <span className={`badge badge-${t.status.toLowerCase().replace(' ', '-')}`}>
                        {t.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {t.source} ➔ {t.destination} ({t.distance} km)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                      {t.vehicle?.registrationNumber || 'Vehicle'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {t.driver?.name || 'Driver'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Maintenance */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Wrench size={18} color="var(--accent-amber)" /> Scheduled Vehicle Maintenance
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('maintenance')}>
              Maintenance Log <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {upcomingMaintenance.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>All vehicles are up to date on maintenance!</p>
            ) : (
              upcomingMaintenance.map((m) => (
                <div
                  key={m._id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-secondary)',
                    border: m.isOverdue ? '1px solid rgba(244, 63, 94, 0.4)' : '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2px' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {m.vehicle?.registrationNumber || 'Vehicle'}
                      </strong>
                      <span className={`badge badge-${m.status.toLowerCase().replace(' ', '-')}`}>
                        {m.status}
                      </span>
                      {m.isOverdue && (
                        <span style={{ fontSize: '0.65rem', color: '#fb7185', fontWeight: 700 }}>
                          OVERDUE
                        </span>
                      )}
                      {m.isDueSoon && (
                        <span style={{ fontSize: '0.65rem', color: '#fbbf24', fontWeight: 700 }}>
                          DUE SOON
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {m.maintenanceType} - {m.description}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ₹{m.cost?.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {m.serviceDate ? new Date(m.serviceDate).toLocaleDateString() : 'Pending'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Fuel Overview & Expenses Breakdown */}
      <div className="grid-cols-2">
        {/* Fuel Telemetry Summary */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Fuel size={18} color="var(--accent-cyan)" /> Fleet Fuel Consumption Telemetry
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('fuel')}>
              View Fuel Logs <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
            <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TOTAL FUEL DISPENSED</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                {fuelOverview.totalConsumed.toLocaleString()} L
              </div>
            </div>
            <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>HIGHEST CONSUMING RIG</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {fuelOverview.highestFuelVehicle.registration}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {fuelOverview.highestFuelVehicle.quantity} Liters consumed
              </div>
            </div>
          </div>

          {/* Top Fuel Consuming Vehicles Table/Bar */}
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            TOP FUEL CONSUMING RIGS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {charts?.fuelByVehicleData?.map((item) => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8rem' }}>
                <span style={{ width: '130px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</span>
                <div style={{ flex: 1, height: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, (item.value / (charts.fuelByVehicleData[0]?.value || 1)) * 100)}%`,
                      backgroundColor: 'var(--accent-cyan)'
                    }}
                  />
                </div>
                <span style={{ width: '60px', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.value} L</span>
              </div>
            ))}
          </div>
        </div>

        {/* Operating Expenses Breakdown */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Receipt size={18} color="var(--accent-purple)" /> Expense Category Distribution
            </h3>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('expenses')}>
              All Expenses <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Object.entries(expenseCategories).map(([cat, amount]) => {
              const percentage = cards.totalExpenses > 0 ? Math.round((amount / cards.totalExpenses) * 100) : 0;
              return (
                <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                    <span style={{ fontWeight: 600 }}>{cat}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                      ₹{amount.toLocaleString()} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({percentage}%)</span>
                    </span>
                  </div>
                  <div style={{ height: '7px', backgroundColor: 'var(--bg-secondary)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${percentage}%`,
                        background: cat === 'Fuel' ? 'var(--accent-cyan)' : cat === 'Maintenance' ? 'var(--accent-amber)' : 'var(--primary)'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: '1.25rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Gross Fleet Operating Expenditure:</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              ₹{cards.totalExpenses.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
