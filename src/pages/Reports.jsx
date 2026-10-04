import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Printer,
  Filter,
  Calendar,
  Truck,
  User,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import Loading from '../components/Loading.jsx';
import {
  vehicleApi,
  driverApi,
  tripApi,
  fuelApi,
  maintenanceApi,
  expenseApi
} from '../services/api.js';

export default function Reports() {
  const [reportType, setReportType] = useState('trip'); // trip, fuel, maintenance, expense, vehicle, driver
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedVehicle, setSelectedVehicle] = useState('All');
  const [vehicles, setVehicles] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const res = await vehicleApi.getAll('limit=100');
        if (res.success) setVehicles(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchVehicles();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      let data = [];
      if (reportType === 'trip') {
        const res = await tripApi.getAll('limit=500');
        data = res.data || [];
      } else if (reportType === 'fuel') {
        const res = await fuelApi.getAll('limit=500');
        data = res.data || [];
      } else if (reportType === 'maintenance') {
        const res = await maintenanceApi.getAll('limit=500');
        data = res.data || [];
      } else if (reportType === 'expense') {
        const res = await expenseApi.getAll('limit=500');
        data = res.data || [];
      } else if (reportType === 'vehicle') {
        const res = await vehicleApi.getAll('limit=500');
        data = res.data || [];
      } else if (reportType === 'driver') {
        const res = await driverApi.getAll('limit=500');
        data = res.data || [];
      }

      // Filter by vehicle if selected
      if (selectedVehicle !== 'All') {
        data = data.filter((item) => {
          const vId = item.vehicle?._id || item.vehicle || item._id;
          return vId === selectedVehicle;
        });
      }

      // Filter by date range if applicable
      if (startDate && endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime() + 86400000;
        data = data.filter((item) => {
          const dateField = item.date || item.startDate || item.serviceDate || item.createdAt;
          if (!dateField) return true;
          const time = new Date(dateField).getTime();
          return time >= start && time <= end;
        });
      }

      setRecords(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateReport();
  }, [reportType, selectedVehicle]);

  const handleExportCSV = () => {
    if (records.length === 0) return;
    const headers = Object.keys(records[0]).filter(k => !k.startsWith('_')).join(',');
    const rows = records.map(r =>
      Object.keys(records[0])
        .filter(k => !k.startsWith('_'))
        .map(k => {
          let val = r[k];
          if (typeof val === 'object' && val !== null) {
            val = val.registrationNumber || val.name || JSON.stringify(val);
          }
          return `"${String(val || '').replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FLEETNOVA_${reportType.toUpperCase()}_REPORT_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Calculations for summary banner
  const computeReportSummary = () => {
    if (reportType === 'trip') {
      const totalKm = records.reduce((acc, t) => acc + (t.distance || 0), 0);
      const completed = records.filter(t => t.status === 'Completed').length;
      return [
        { label: 'Total Dispatches', val: records.length },
        { label: 'Completed Deliveries', val: completed },
        { label: 'Gross Transit Distance', val: `${totalKm.toLocaleString()} km` }
      ];
    }
    if (reportType === 'fuel') {
      const totalCost = records.reduce((acc, f) => acc + (f.totalCost || 0), 0);
      const totalLiters = records.reduce((acc, f) => acc + (f.quantity || 0), 0);
      return [
        { label: 'Fuel Logs', val: records.length },
        { label: 'Total Liters Dispensed', val: `${totalLiters.toLocaleString()} L` },
        { label: 'Gross Fuel Expenditure', val: `₹${totalCost.toLocaleString()}` }
      ];
    }
    if (reportType === 'maintenance') {
      const totalMaintCost = records.reduce((acc, m) => acc + (m.cost || 0), 0);
      const completedJobs = records.filter(m => m.status === 'Completed').length;
      return [
        { label: 'Maintenance Records', val: records.length },
        { label: 'Completed Services', val: completedJobs },
        { label: 'Total Workshop Cost', val: `₹${totalMaintCost.toLocaleString()}` }
      ];
    }
    if (reportType === 'expense') {
      const totalExp = records.reduce((acc, e) => acc + (e.amount || 0), 0);
      return [
        { label: 'Expense Vouchers', val: records.length },
        { label: 'Total Operating Spend', val: `₹${totalExp.toLocaleString()}` }
      ];
    }
    return [
      { label: 'Total Records In Scope', val: records.length }
    ];
  };

  const summaryMetrics = computeReportSummary();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Configuration Header */}
      <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>Audit & Analytical Reports</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Export customized compliance summaries, financial totals, and operational records
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
              <Printer size={15} /> Print
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleExportCSV} disabled={records.length === 0}>
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Report Module</label>
            <select
              className="form-control"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="trip">Trip Logistics Summary</option>
              <option value="fuel">Fuel Consumption & Costs</option>
              <option value="maintenance">Maintenance Workshop History</option>
              <option value="expense">Operating Expense Ledger</option>
              <option value="vehicle">Vehicle Inventory Status</option>
              <option value="driver">Driver Personnel Roster</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">From Date</label>
            <input
              type="date"
              className="form-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">To Date</label>
            <input
              type="date"
              className="form-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Filter Rig</label>
            <select
              className="form-control"
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
            >
              <option value="All">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.registrationNumber} ({v.brand})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Box */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${summaryMetrics.length}, 1fr)`,
          gap: '1rem'
        }}
      >
        {summaryMetrics.map((sm, i) => (
          <div key={i} className="card" style={{ padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{sm.label}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{sm.val}</div>
          </div>
        ))}
      </div>

      {/* Report Records Table */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>
          <FileText size={18} color="var(--primary)" /> Detailed Audit Records ({records.length})
        </h3>

        {loading ? (
          <Loading message="Generating report table..." />
        ) : records.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
            No records matched the selected date parameters.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  {reportType === 'trip' && (
                    <>
                      <th>Trip ID</th>
                      <th>Rig</th>
                      <th>Operator</th>
                      <th>Origin ➔ Destination</th>
                      <th>Distance</th>
                      <th>Start Date</th>
                      <th>Status</th>
                    </>
                  )}
                  {reportType === 'fuel' && (
                    <>
                      <th>Record ID</th>
                      <th>Rig</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Rate</th>
                      <th>Total Cost</th>
                      <th>Station</th>
                    </>
                  )}
                  {reportType === 'maintenance' && (
                    <>
                      <th>Job ID</th>
                      <th>Rig</th>
                      <th>Type</th>
                      <th>Scope / Description</th>
                      <th>Service Date</th>
                      <th>Workshop</th>
                      <th>Cost</th>
                      <th>Status</th>
                    </>
                  )}
                  {reportType === 'expense' && (
                    <>
                      <th>Voucher ID</th>
                      <th>Rig</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                    </>
                  )}
                  {reportType === 'vehicle' && (
                    <>
                      <th>Rig ID</th>
                      <th>Reg Number</th>
                      <th>Type</th>
                      <th>Brand & Model</th>
                      <th>Fuel</th>
                      <th>Odometer</th>
                      <th>Status</th>
                    </>
                  )}
                  {reportType === 'driver' && (
                    <>
                      <th>Driver ID</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>License Number</th>
                      <th>License Expiry</th>
                      <th>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={r._id || idx}>
                    {reportType === 'trip' && (
                      <>
                        <td><strong>{r.tripId}</strong></td>
                        <td>{r.vehicle?.registrationNumber || 'Vehicle'}</td>
                        <td>{r.driver?.name || 'Driver'}</td>
                        <td>{r.source} ➔ {r.destination}</td>
                        <td>{r.distance} km</td>
                        <td>{new Date(r.startDate).toLocaleDateString()}</td>
                        <td><span className={`badge badge-${r.status?.toLowerCase().replace(' ', '-')}`}>{r.status}</span></td>
                      </>
                    )}
                    {reportType === 'fuel' && (
                      <>
                        <td><strong>{r.fuelRecordId}</strong></td>
                        <td>{r.vehicle?.registrationNumber || 'Vehicle'}</td>
                        <td>{new Date(r.date).toLocaleDateString()}</td>
                        <td>{r.fuelType}</td>
                        <td>{r.quantity} L</td>
                        <td>₹{r.pricePerLiter}</td>
                        <td><strong>₹{r.totalCost?.toLocaleString()}</strong></td>
                        <td>{r.fuelStation}</td>
                      </>
                    )}
                    {reportType === 'maintenance' && (
                      <>
                        <td><strong>{r.maintenanceId}</strong></td>
                        <td>{r.vehicle?.registrationNumber || 'Vehicle'}</td>
                        <td>{r.maintenanceType}</td>
                        <td>{r.description}</td>
                        <td>{new Date(r.serviceDate).toLocaleDateString()}</td>
                        <td>{r.serviceCenter}</td>
                        <td><strong>₹{r.cost?.toLocaleString()}</strong></td>
                        <td><span className={`badge badge-${r.status?.toLowerCase().replace(' ', '-')}`}>{r.status}</span></td>
                      </>
                    )}
                    {reportType === 'expense' && (
                      <>
                        <td><strong>{r.expenseId}</strong></td>
                        <td>{r.vehicle?.registrationNumber || 'Vehicle'}</td>
                        <td><span className="badge badge-ontrip">{r.category}</span></td>
                        <td>{r.description}</td>
                        <td>{new Date(r.date).toLocaleDateString()}</td>
                        <td><strong>₹{r.amount?.toLocaleString()}</strong></td>
                        <td>{r.paymentMethod}</td>
                      </>
                    )}
                    {reportType === 'vehicle' && (
                      <>
                        <td><strong>{r.vehicleId}</strong></td>
                        <td>{r.registrationNumber}</td>
                        <td>{r.vehicleType}</td>
                        <td>{r.brand} {r.model}</td>
                        <td>{r.fuelType}</td>
                        <td>{r.currentMileage?.toLocaleString()} km</td>
                        <td><span className={`badge badge-${r.status?.toLowerCase().replace(' ', '-')}`}>{r.status}</span></td>
                      </>
                    )}
                    {reportType === 'driver' && (
                      <>
                        <td><strong>{r.driverId}</strong></td>
                        <td>{r.name}</td>
                        <td>{r.phone}</td>
                        <td>{r.licenseNumber}</td>
                        <td>{new Date(r.licenseExpiry).toLocaleDateString()}</td>
                        <td><span className={`badge badge-${r.status?.toLowerCase().replace(' ', '-')}`}>{r.status}</span></td>
                      </>
                    )}
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
