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
import PrintHeader from '../components/PrintHeader.jsx';
import { downloadCsv } from '../utils/csv.js';
import {
  vehicleApi,
  driverApi,
  tripApi,
  fuelApi,
  maintenanceApi,
  expenseApi
} from '../services/api.js';
import { useT } from '../i18n/LanguageContext.jsx';

const statusBadge = (tr, status) => (
  <span className={`badge badge-${status?.toLowerCase().replace(' ', '-')}`}>{tr(status)}</span>
);

// One definition per report column: `label` is the column title (also the CSV title unless `csvLabel` is given),
// `cell` is what the table shows, `csv` is what the CSV file gets (plain text / numbers, so Excel can sum them).
function reportColumns(type, tr, day) {
  const iso = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');
  const rig = (r) => r.vehicle?.registrationNumber || tr('Vehicle');
  const status = { label: tr('Status'), text: (r) => tr(r.status), render: (r) => statusBadge(tr, r.status) };
  const col = (label, text, extra = {}) => ({ label, text, ...extra });

  if (type === 'trip') {
    return [
      col(tr('Trip ID'), (r) => r.tripId, { bold: true }),
      col(tr('Rig'), rig),
      col(tr('Operator'), (r) => r.driver?.name || tr('Driver')),
      col(tr('Origin ➔ Destination'), (r) => `${r.source} → ${r.destination}`),
      col(tr('Distance'), (r) => `${r.distance} ${tr('km')}`, { csvLabel: tr('Distance (km)'), csv: (r) => r.distance }),
      col(tr('Start Date'), (r) => day(r.startDate), { csv: (r) => iso(r.startDate) }),
      status
    ].map(normalize);
  }
  if (type === 'fuel') {
    return [
      col(tr('Record ID'), (r) => r.fuelRecordId, { bold: true }),
      col(tr('Rig'), rig),
      col(tr('Date'), (r) => day(r.date), { csv: (r) => iso(r.date) }),
      col(tr('Type'), (r) => tr(r.fuelType)),
      col(tr('Quantity'), (r) => `${r.quantity} L`, { csvLabel: tr('Quantity (L)'), csv: (r) => r.quantity }),
      col(tr('Rate'), (r) => `₮${r.pricePerLiter}`, { csvLabel: tr('Rate (₮/L)'), csv: (r) => r.pricePerLiter }),
      col(tr('Total Cost'), (r) => `₮${r.totalCost?.toLocaleString()}`, { bold: true, csvLabel: tr('Total Cost (₮)'), csv: (r) => r.totalCost }),
      col(tr('Station'), (r) => r.fuelStation)
    ].map(normalize);
  }
  if (type === 'maintenance') {
    return [
      col(tr('Job ID'), (r) => r.maintenanceId, { bold: true }),
      col(tr('Rig'), rig),
      col(tr('Type'), (r) => tr(r.maintenanceType)),
      col(tr('Scope / Description'), (r) => r.description),
      col(tr('Service Date'), (r) => day(r.serviceDate), { csv: (r) => iso(r.serviceDate) }),
      col(tr('Workshop'), (r) => r.serviceCenter),
      col(tr('Cost'), (r) => `₮${r.cost?.toLocaleString()}`, { bold: true, csvLabel: tr('Cost (₮)'), csv: (r) => r.cost }),
      status
    ].map(normalize);
  }
  if (type === 'expense') {
    return [
      col(tr('Voucher ID'), (r) => r.expenseId, { bold: true }),
      col(tr('Rig'), rig),
      col(tr('Category'), (r) => tr(r.category), { render: (r) => <span className="badge badge-ontrip">{tr(r.category)}</span> }),
      col(tr('Description'), (r) => r.description),
      col(tr('Date'), (r) => day(r.date), { csv: (r) => iso(r.date) }),
      col(tr('Amount'), (r) => `₮${r.amount?.toLocaleString()}`, { bold: true, csvLabel: tr('Amount (₮)'), csv: (r) => r.amount }),
      col(tr('Method'), (r) => tr(r.paymentMethod))
    ].map(normalize);
  }
  if (type === 'vehicle') {
    return [
      col(tr('Rig ID'), (r) => r.vehicleId, { bold: true }),
      col(tr('Reg Number'), (r) => r.registrationNumber),
      col(tr('Type'), (r) => tr(r.vehicleType)),
      col(tr('Brand & Model'), (r) => `${r.brand} ${r.model}`),
      col(tr('Fuel'), (r) => tr(r.fuelType)),
      col(tr('Odometer'), (r) => `${r.currentMileage?.toLocaleString()} ${tr('km')}`, { csvLabel: tr('Odometer (km)'), csv: (r) => r.currentMileage }),
      status
    ].map(normalize);
  }
  return [
    col(tr('Driver ID'), (r) => r.driverId, { bold: true }),
    col(tr('Name'), (r) => r.name),
    col(tr('Phone'), (r) => r.phone),
    col(tr('License Number'), (r) => r.licenseNumber),
    col(tr('License Expiry'), (r) => day(r.licenseExpiry), { csv: (r) => iso(r.licenseExpiry) }),
    status
  ].map(normalize);
}

// fills in what a column definition leaves out
function normalize(column) {
  return {
    ...column,
    csvLabel: column.csvLabel || column.label,
    csv: column.csv || column.text,
    render: column.render || ((r) => (column.bold ? <strong>{column.text(r)}</strong> : column.text(r)))
  };
}

const REPORT_TITLES = {
  trip: 'Trip Logistics Summary',
  fuel: 'Fuel Consumption & Costs',
  maintenance: 'Maintenance Workshop History',
  expense: 'Operating Expense Ledger',
  vehicle: 'Vehicle Inventory Status',
  driver: 'Driver Personnel Roster'
};

export default function Reports() {
  const { tr } = useT();
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

  const day = (value) => (value ? new Date(value).toLocaleDateString() : '—');
  const columns = reportColumns(reportType, tr, day);

  const handleExportCSV = () => {
    if (records.length === 0) return;
    downloadCsv(
      `CLIXGPS_${reportType.toUpperCase()}_REPORT_${new Date().toISOString().split('T')[0]}.csv`,
      columns.map((c) => c.csvLabel),
      records.map((r) => columns.map((c) => c.csv(r)))
    );
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
        { label: tr("Total Dispatches"), val: records.length },
        { label: tr("Completed Deliveries"), val: completed },
        { label: tr("Gross Transit Distance"), val: `${totalKm.toLocaleString()} km` }
      ];
    }
    if (reportType === 'fuel') {
      const totalCost = records.reduce((acc, f) => acc + (f.totalCost || 0), 0);
      const totalLiters = records.reduce((acc, f) => acc + (f.quantity || 0), 0);
      return [
        { label: tr("Fuel Logs"), val: records.length },
        { label: tr("Total Liters Dispensed"), val: `${totalLiters.toLocaleString()} L` },
        { label: tr("Gross Fuel Expenditure"), val: `₮${totalCost.toLocaleString()}` }
      ];
    }
    if (reportType === 'maintenance') {
      const totalMaintCost = records.reduce((acc, m) => acc + (m.cost || 0), 0);
      const completedJobs = records.filter(m => m.status === 'Completed').length;
      return [
        { label: tr("Maintenance Records"), val: records.length },
        { label: tr("Completed Services"), val: completedJobs },
        { label: tr("Total Workshop Cost"), val: `₮${totalMaintCost.toLocaleString()}` }
      ];
    }
    if (reportType === 'expense') {
      const totalExp = records.reduce((acc, e) => acc + (e.amount || 0), 0);
      return [
        { label: tr("Expense Vouchers"), val: records.length },
        { label: tr("Total Operating Spend"), val: `₮${totalExp.toLocaleString()}` }
      ];
    }
    return [
      { label: tr("Total Records In Scope"), val: records.length }
    ];
  };

  const summaryMetrics = computeReportSummary();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PrintHeader
        title={tr(REPORT_TITLES[reportType])}
        lines={[
          `${tr('From Date')}: ${startDate} — ${tr('To Date')}: ${endDate}`,
          selectedVehicle !== 'All' ? `${tr('Filter Rig')}: ${vehicles.find((v) => v._id === selectedVehicle)?.registrationNumber || ''}` : null
        ]}
      />

      {/* Configuration Header */}
      <div className="card no-print" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800 }}>{tr("Audit & Analytical Reports")}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {tr("Export customized compliance summaries, financial totals, and operational records")}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={handlePrint}>
              <Printer size={15} /> {tr("Print")}
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleExportCSV} disabled={records.length === 0}>
              <Download size={15} /> {tr("Export CSV")}
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{tr("Report Module")}</label>
            <select
              className="form-control"
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              <option value="trip">{tr("Trip Logistics Summary")}</option>
              <option value="fuel">{tr("Fuel Consumption & Costs")}</option>
              <option value="maintenance">{tr("Maintenance Workshop History")}</option>
              <option value="expense">{tr("Operating Expense Ledger")}</option>
              <option value="vehicle">{tr("Vehicle Inventory Status")}</option>
              <option value="driver">{tr("Driver Personnel Roster")}</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{tr("From Date")}</label>
            <input
              type="date"
              className="form-control"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{tr("To Date")}</label>
            <input
              type="date"
              className="form-control"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{tr("Filter Rig")}</label>
            <select
              className="form-control"
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
            >
              <option value="All">{tr("All Vehicles")}</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {tr(v.registrationNumber)} ({tr(v.brand)})
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
          <FileText size={18} color="var(--primary)" /> {tr("Detailed Audit Records (")}{records.length})
        </h3>

        {loading ? (
          <Loading message={tr("Generating report table...")} />
        ) : records.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
            {tr("No records matched the selected date parameters.")}
          </p>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.label}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={r._id || idx}>
                    {columns.map((c) => (
                      <td key={c.label}>{c.render(r)}</td>
                    ))}
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
