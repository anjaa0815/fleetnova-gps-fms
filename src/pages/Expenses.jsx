import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  Truck,
  Trash2,
  DollarSign,
  PieChart,
  CreditCard
} from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import StatCard from '../components/StatCard.jsx';
import { expenseApi, vehicleApi, driverApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Expenses() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'fleet_manager';

  const [expenses, setExpenses] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [summary, setSummary] = useState({ totalAmount: 0, categoryTotals: {}, count: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [vehicleFilter, setVehicleFilter] = useState('All');
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
    category: 'Toll',
    amount: 1000,
    date: new Date().toISOString().split('T')[0],
    description: '',
    driverId: '',
    paymentMethod: 'Company Card'
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        category: categoryFilter,
        vehicle: vehicleFilter
      });
      const res = await expenseApi.getAll(params.toString());
      if (res.success) {
        setExpenses(res.data);
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

  const fetchLists = async () => {
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
    fetchExpenses();
  }, [page, categoryFilter, vehicleFilter]);

  useEffect(() => {
    fetchLists();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchExpenses();
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    try {
      await expenseApi.create(formData);
      setIsModalOpen(false);
      setFormData(initialForm);
      fetchExpenses();
    } catch (err) {
      setActionError(err.message || 'Failed to record expense');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await expenseApi.delete(deleteId);
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      fetchExpenses();
    } catch (err) {
      alert(err.message || 'Failed to delete expense');
    }
  };

  const columns = [
    {
      header: 'Expense ID & Date',
      render: (e) => (
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>{e.expenseId}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {new Date(e.date).toLocaleDateString()}
          </div>
        </div>
      )
    },
    {
      header: 'Category & Details',
      render: (e) => (
        <div>
          <span className="badge badge-ontrip" style={{ marginBottom: '2px' }}>
            {e.category}
          </span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {e.description}
          </div>
        </div>
      )
    },
    {
      header: 'Vehicle & Driver',
      render: (e) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {e.vehicle?.registrationNumber || 'Vehicle'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {e.driver?.name || 'Unassigned'}
          </div>
        </div>
      )
    },
    {
      header: 'Payment Mode',
      render: (e) => (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {e.paymentMethod}
        </span>
      )
    },
    {
      header: 'Amount',
      render: (e) => (
        <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          ₹{e.amount?.toLocaleString()}
        </strong>
      )
    },
    {
      header: 'Actions',
      width: '80px',
      render: (e) => (
        canManage && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setDeleteId(e._id);
              setDeleteConfirmOpen(true);
            }}
            title="Delete Expense"
          >
            <Trash2 size={13} />
          </button>
        )
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Metric Cards */}
      <div className="grid-cols-4">
        <StatCard
          title="Gross Operating Expenses"
          value={`₹${summary.totalAmount.toLocaleString()}`}
          subtext="Fuel, tolls, insurance, parts"
          icon={DollarSign}
          color="#8b5cf6"
        />
        <StatCard
          title="Fuel Share"
          value={`₹${(summary.categoryTotals?.Fuel || 0).toLocaleString()}`}
          subtext="Pump dispense transactions"
          icon={Receipt}
          color="#06b6d4"
        />
        <StatCard
          title="Maintenance Share"
          value={`₹${((summary.categoryTotals?.Maintenance || 0) + (summary.categoryTotals?.Repair || 0)).toLocaleString()}`}
          subtext="Workshop & spare parts"
          icon={CreditCard}
          color="#f59e0b"
        />
        <StatCard
          title="Total Vouchers"
          value={summary.count}
          subtext="Audited financial records"
          icon={PieChart}
          color="#10b981"
        />
      </div>

      {/* Controls & Filter */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Fleet Operating Expenses</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Real-time ledger tracking tolls, per-diem allowances, insurance premiums, and repairs
            </p>
          </div>

          {canManage && (
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={16} /> Add Expense Voucher
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
              placeholder="Search description, rig, voucher ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <select
            className="form-control"
            style={{ width: '160px' }}
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Categories</option>
            <option value="Fuel">Fuel</option>
            <option value="Maintenance">Maintenance</option>
            <option value="Repair">Repair</option>
            <option value="Insurance">Insurance</option>
            <option value="Toll">Toll</option>
            <option value="Trip">Trip Allowance</option>
            <option value="Other">Other</option>
          </select>

          <select
            className="form-control"
            style={{ width: '170px' }}
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
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={expenses}
        loading={loading}
        emptyMessage="No expenses recorded"
        emptySubtext="Add an operating expense voucher or clear active filters."
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => setPage(p)}
      />

      {/* Add Expense Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add Fleet Operating Expense Voucher"
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
                onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
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
              <label className="form-label">Expense Category *</label>
              <select
                className="form-control"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="Toll">Toll (FASTag/Cash)</option>
                <option value="Trip">Trip Allowance / Per-diem</option>
                <option value="Fuel">Fuel Refill</option>
                <option value="Maintenance">Maintenance Service</option>
                <option value="Repair">Emergency Roadside Repair</option>
                <option value="Insurance">Insurance Policy Premium</option>
                <option value="Other">Fitness / Certificates / Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description / Purpose *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. FASTag Electronic Toll Plaza Deductions (Delhi-Ahmedabad Highway)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-control"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input
                type="date"
                className="form-control"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Payment Method</label>
              <select
                className="form-control"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
              >
                <option value="Company Card">Company Card</option>
                <option value="Fuel Card">Fuel Card</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Associated Driver (Optional)</label>
            <select
              className="form-control"
              value={formData.driverId}
              onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
            >
              <option value="">No Driver Associated</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.driverId})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Post Expense
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Expense Record"
        maxWidth="440px"
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to permanently delete this expense voucher?
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
