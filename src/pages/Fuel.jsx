import React, { useState, useEffect } from 'react';
import {
  Fuel as FuelIcon,
  Plus,
  Search,
  Calendar,
  Truck,
  User,
  Trash2,
  DollarSign,
  TrendingUp,
  Receipt
} from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import StatCard from '../components/StatCard.jsx';
import { fuelApi, vehicleApi, driverApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Fuel() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'fleet_manager';

  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [summary, setSummary] = useState({ totalConsumed: 0, totalCost: 0, avgPricePerLiter: 0, recordCount: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('All');
  const [fuelTypeFilter, setFuelTypeFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Form State
  const initialForm = {
    vehicleId: '',
    driverId: '',
    fuelType: 'Diesel',
    quantity: 50,
    pricePerLiter: 89.5,
    odometerReading: 50000,
    fuelStation: 'Authorized Indian Oil Pump',
    date: new Date().toISOString().split('T')[0],
    notes: ''
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchFuel = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        vehicle: vehicleFilter,
        fuelType: fuelTypeFilter
      });
      const res = await fuelApi.getAll(params.toString());
      if (res.success) {
        setRecords(res.data);
        if (res.summary) setSummary(res.summary);
        setTotalPages(res.totalPages || 1);
        setTotalRecords(res.totalRecords || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const v = await vehicleApi.getAll('limit=100');
      const d = await driverApi.getAll('limit=100');
      if (v.success) setVehicles(v.data);
      if (d.success) setDrivers(d.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchFuel();
  }, [page, vehicleFilter, fuelTypeFilter]);

  useEffect(() => {
    fetchOptions();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchFuel();
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    try {
      await fuelApi.create(formData);
      setIsModalOpen(false);
      setFormData(initialForm);
      fetchFuel();
    } catch (err) {
      setActionError(err.message || 'Failed to record fuel log');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await fuelApi.delete(deleteId);
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      fetchFuel();
    } catch (err) {
      alert(err.message || 'Failed to delete fuel record');
    }
  };

  const columns = [
    {
      header: 'Record ID & Date',
      render: (r) => (
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>{r.fuelRecordId}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {new Date(r.date).toLocaleDateString()}
          </div>
        </div>
      )
    },
    {
      header: 'Rig & Operator',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.vehicle?.registrationNumber || 'Vehicle'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {r.driver?.name || 'Driver Not Specified'}
          </div>
        </div>
      )
    },
    {
      header: 'Fuel Dispensed',
      render: (r) => (
        <div>
          <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{r.quantity} L</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '4px' }}>
            ({r.fuelType})
          </span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            ₹{r.pricePerLiter} / L
          </div>
        </div>
      )
    },
    {
      header: 'Gross Total',
      render: (r) => (
        <div>
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
            ₹{r.totalCost?.toLocaleString()}
          </strong>
        </div>
      )
    },
    {
      header: 'Station & Odometer',
      render: (r) => (
        <div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{r.fuelStation}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {r.odometerReading?.toLocaleString()} km
          </div>
        </div>
      )
    },
    {
      header: 'Actions',
      width: '80px',
      render: (r) => (
        canManage && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setDeleteId(r._id);
              setDeleteConfirmOpen(true);
            }}
            title="Delete Record"
          >
            <Trash2 size={14} />
          </button>
        )
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* KPI Cards */}
      <div className="grid-cols-4">
        <StatCard
          title="Total Fuel Consumed"
          value={`${summary.totalConsumed.toLocaleString()} L`}
          subtext="Recorded across all rigs"
          icon={FuelIcon}
          color="#06b6d4"
        />
        <StatCard
          title="Gross Fuel Cost"
          value={`₹${summary.totalCost.toLocaleString()}`}
          subtext="Total fueling expenditures"
          icon={DollarSign}
          color="#3b82f6"
        />
        <StatCard
          title="Avg Fuel Price"
          value={`₹${summary.avgPricePerLiter} / L`}
          subtext="Blended average rate"
          icon={TrendingUp}
          color="#10b981"
        />
        <StatCard
          title="Dispense Logs"
          value={summary.recordCount}
          subtext="Verified pump transactions"
          icon={Receipt}
          color="#8b5cf6"
        />
      </div>

      {/* Controls & Filter */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Fuel Management & Telemetry</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Track station refills, consumption efficiency, and auto-sync with company expenses
            </p>
          </div>

          {canManage && (
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={16} /> Log Fuel Refill
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '36px' }}
              placeholder="Search station, rig, record ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <select
            className="form-control"
            style={{ width: '180px' }}
            value={vehicleFilter}
            onChange={(e) => {
              setVehicleFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Vehicles</option>
            {vehicles.map((v) => (
              <option key={v._id} value={v._id}>
                {v.registrationNumber}
              </option>
            ))}
          </select>

          <select
            className="form-control"
            style={{ width: '150px' }}
            value={fuelTypeFilter}
            onChange={(e) => {
              setFuelTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Fuel Types</option>
            <option value="Diesel">Diesel</option>
            <option value="Petrol">Petrol</option>
            <option value="CNG">CNG</option>
            <option value="Electric">Electric</option>
          </select>
        </div>
      </div>

      {/* Main Fuel Table */}
      <DataTable
        columns={columns}
        data={records}
        loading={loading}
        emptyMessage="No fuel transactions found"
        emptySubtext="Record a fuel refill to start monitoring fleet consumption metrics."
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => setPage(p)}
      />

      {/* Log Refill Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Commercial Fuel Refill"
      >
        {actionError && (
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
            {actionError}
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Vehicle Rig *</label>
              <select
                className="form-control"
                value={formData.vehicleId}
                onChange={(e) => {
                  const selectedV = vehicles.find(v => v._id === e.target.value);
                  setFormData({
                    ...formData,
                    vehicleId: e.target.value,
                    fuelType: selectedV ? selectedV.fuelType : formData.fuelType,
                    odometerReading: selectedV ? selectedV.currentMileage : formData.odometerReading
                  });
                }}
                required
              >
                <option value="">-- Choose Rig --</option>
                {vehicles.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.registrationNumber} ({v.brand} {v.model})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Commercial Operator</label>
              <select
                className="form-control"
                value={formData.driverId}
                onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
              >
                <option value="">-- Select Driver (Optional) --</option>
                {drivers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Fuel Type *</label>
              <select
                className="form-control"
                value={formData.fuelType}
                onChange={(e) => setFormData({ ...formData, fuelType: e.target.value })}
              >
                <option value="Diesel">Diesel</option>
                <option value="Petrol">Petrol</option>
                <option value="CNG">CNG</option>
                <option value="Electric">Electric</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity (L/Units) *</label>
              <input
                type="number"
                step="0.1"
                className="form-control"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Price per Liter (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                value={formData.pricePerLiter}
                onChange={(e) => setFormData({ ...formData, pricePerLiter: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
          </div>

          {/* Auto calculated total box */}
          <div
            style={{
              padding: '0.85rem 1rem',
              backgroundColor: 'rgba(6, 182, 212, 0.1)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem'
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Automatically Calculated Total Cost:
            </span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
              ₹{(Math.round((formData.quantity || 0) * (formData.pricePerLiter || 0) * 100) / 100).toLocaleString()}
            </span>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Odometer Reading at Pump (km) *</label>
              <input
                type="number"
                className="form-control"
                value={formData.odometerReading}
                onChange={(e) => setFormData({ ...formData, odometerReading: parseInt(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Transaction Date *</label>
              <input
                type="date"
                className="form-control"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Fuel Station / Vendor Name</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Indian Oil Highway Care, Behror NH-48"
              value={formData.fuelStation}
              onChange={(e) => setFormData({ ...formData, fuelStation: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes / Receipt Reference</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="e.g. Fuel card txn ID, DEF fluid added..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Log Fuel Refill
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Fuel Record"
        maxWidth="440px"
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to delete this fuel record? This will also remove the corresponding transaction in the expense ledger.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirmDelete}>
              Yes, Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
