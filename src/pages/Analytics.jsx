import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Truck,
  Users,
  Fuel,
  Wrench,
  Receipt,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import StatCard from '../components/StatCard.jsx';
import Loading from '../components/Loading.jsx';
import { dashboardApi } from '../services/api.js';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const res = await dashboardApi.getData();
        if (res.success) {
          setData(res.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return <Loading message="Computing deep fleet operational analytics and cost models..." />;
  }

  if (!data) return null;

  const { cards, vehicleStatusBreakdown, expenseCategories, fuelOverview, charts } = data;
  const utilizationRate = cards.totalVehicles > 0 ? Math.round((cards.activeVehicles / cards.totalVehicles) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800 }}>Fleet Operational Analytics</h2>
        <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
          Enterprise business intelligence, utilization indices, fuel economics, and maintenance forecasts
        </p>
      </div>

      {/* Top 4 Section KPI Summary */}
      <div className="grid-cols-4">
        <StatCard
          title="Vehicle Fleet Utilization"
          value={`${utilizationRate}%`}
          subtext={`${cards.activeVehicles} active of ${cards.totalVehicles} rigs`}
          icon={Activity}
          color="#3b82f6"
        />
        <StatCard
          title="Avg Fuel Efficiency"
          value={`${cards.avgFuelEfficiency} km/L`}
          subtext="Calculated across all dispatches"
          icon={Fuel}
          color="#06b6d4"
        />
        <StatCard
          title="Gross Operating Cost"
          value={`₹${cards.totalExpenses.toLocaleString()}`}
          subtext="Financial year to date"
          icon={Receipt}
          color="#8b5cf6"
        />
        <StatCard
          title="Workshop Maintenance Ratio"
          value={`${cards.totalVehicles ? Math.round((cards.maintenanceVehicles / cards.totalVehicles) * 100) : 0}%`}
          subtext={`${cards.maintenanceVehicles} under scheduled repair`}
          icon={Wrench}
          color="#f59e0b"
        />
      </div>

      {/* Section 1: Vehicle & Driver Analytics */}
      <div className="grid-cols-2">
        {/* Vehicle Analytics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Truck size={18} color="var(--primary)" /> Vehicle Analytics & Fleet Health
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>OPERATIONAL READINESS</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                  {cards.totalVehicles ? Math.round(((cards.availableVehicles + cards.activeVehicles) / cards.totalVehicles) * 100) : 0}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Available + Active Deliveries</div>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>DOWNTIME RATIO</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fb7185' }}>
                  {cards.totalVehicles ? Math.round((cards.maintenanceVehicles / cards.totalVehicles) * 100) : 0}%
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Off-road for workshop service</div>
              </div>
            </div>

            {/* Status Breakdown Bar chart */}
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                STATUS ALLOCATION BREAKDOWN
              </div>
              {vehicleStatusBreakdown.map((item) => (
                <div key={item.status} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                  <span style={{ width: '100px', color: 'var(--text-primary)' }}>{item.status}</span>
                  <div style={{ flex: 1, height: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${item.percentage}%`, backgroundColor: item.color }} />
                  </div>
                  <span style={{ width: '60px', textAlign: 'right', fontWeight: 600 }}>{item.count} ({item.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Driver Analytics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Users size={18} color="var(--accent-emerald)" /> Commercial Driver Roster Analytics
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ROSTER SIZE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{cards.totalDrivers}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Certified Drivers</div>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ON HIGHWAY</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6' }}>{cards.activeTrips}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Active Dispatches</div>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>STANDBY POOL</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981' }}>{cards.availableDrivers}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Ready for routes</div>
              </div>
            </div>

            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Driver Deployment Ratio</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                  {cards.totalDrivers ? Math.round((cards.activeTrips / cards.totalDrivers) * 100) : 0}%
                </span>
              </div>
              <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${cards.totalDrivers ? Math.min(100, Math.round((cards.activeTrips / cards.totalDrivers) * 100)) : 0}%`,
                    backgroundColor: 'var(--accent-cyan)'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Fuel & Maintenance Analytics */}
      <div className="grid-cols-2">
        {/* Fuel Economics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Fuel size={18} color="var(--accent-cyan)" /> Fuel Consumption & Efficiency Indices
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>LIFETIME FUEL COST</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                  ₹{cards.totalFuelCost.toLocaleString()}
                </div>
              </div>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>TOTAL DISPENSED</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>
                  {cards.totalFuelConsumed.toLocaleString()} L
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                TOP FUEL CONSUMING COMMERCIAL RIGS
              </div>
              {charts?.fuelByVehicleData?.map((item) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', fontSize: '0.8rem' }}>
                  <span style={{ width: '130px', fontWeight: 600 }}>{item.name}</span>
                  <div style={{ flex: 1, height: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, (item.value / (charts.fuelByVehicleData[0]?.value || 1)) * 100)}%`,
                        backgroundColor: 'var(--accent-cyan)'
                      }}
                    />
                  </div>
                  <span style={{ width: '70px', textAlign: 'right', color: 'var(--text-secondary)' }}>{item.value} L</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Maintenance Analytics */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Wrench size={18} color="var(--accent-amber)" /> Maintenance & Workshop Expenditure
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>TOTAL MAINTENANCE SPEND</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-amber)' }}>
                  ₹{cards.totalMaintenanceCost.toLocaleString()}
                </div>
              </div>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>SERVICE TICKETS</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>
                  {cards.maintenanceVehicles} Active
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <ShieldCheck size={18} color="var(--accent-emerald)" />
                <strong>Preventive Maintenance Strategy</strong>
              </div>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Automated scheduling ensures transmission fluid checks, tire rotational alignments, and oil flushes are conducted within OEM parameters, minimizing road breakdown risk.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Monthly Expenses Historical Trend */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <TrendingUp size={18} color="var(--accent-purple)" /> Monthly Expenditure Trends (Last 6 Months)
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${charts?.monthlyData?.length || 6}, 1fr)`, gap: '1rem', alignItems: 'flex-end', minHeight: '200px', padding: '1.5rem 0.5rem 0.5rem 0.5rem' }}>
          {charts?.monthlyData?.map((m) => {
            const maxVal = Math.max(...charts.monthlyData.map(d => d.totalExpense || 1));
            const barHeightPct = Math.max(15, Math.round((m.totalExpense / maxVal) * 100));

            return (
              <div key={m.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ₹{m.totalExpense > 0 ? `${Math.round(m.totalExpense / 1000)}k` : '0'}
                </div>
                <div style={{ width: '42px', height: '140px', display: 'flex', alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-sm)', padding: '2px' }}>
                  <div
                    style={{
                      width: '100%',
                      height: `${barHeightPct}%`,
                      background: 'linear-gradient(180deg, #8b5cf6, #3b82f6)',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'height 0.4s ease'
                    }}
                    title={`${m.month}: Total ₹${m.totalExpense.toLocaleString()} (Fuel: ₹${m.fuelExpense.toLocaleString()}, Maint: ₹${m.maintenanceExpense.toLocaleString()})`}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {m.month}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
