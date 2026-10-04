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
import { useT } from '../i18n/LanguageContext.jsx';

export default function Expenses() {
  const { tr } = useT();
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
      alert(tr(err.message || 'Failed to delete expense'));
    }
  };

  const columns = [
    {
      header: tr("Expense ID & Date"),
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
      header: tr("Category & Details"),
      render: (e) => (
        <div>
          <span className="badge badge-ontrip" style={{ marginBottom: '2px' }}>
            {tr(e.category)}
          </span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {e.description}
          </div>
        </div>
      )
    },
    {
      header: tr("Vehicle & Driver"),
      render: (e) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {e.vehicle?.registrationNumber || tr("Vehicle")}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {e.driver?.name || tr("Unassigned")}
          </div>
        </div>
      )
    },
    {
      header: tr("Payment Mode"),
      render: (e) => (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {tr(e.paymentMethod)}
        </span>
      )
    },
    {
      header: tr("Amount"),
      render: (e) => (
        <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          ₹{e.amount?.toLocaleString()}
        </strong>
      )
    },
    {
      header: tr("Actions"),
      width: '80px',
      render: (e) => (
        canManage && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setDeleteId(e._id);
              setDeleteConfirmOpen(true);
            }}
            title={tr("Delete Expense")}
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
          title={tr("Gross Operating Expenses")}
          value={`₹${summary.totalAmount.toLocaleString()}`}
          subtext={tr("Fuel, tolls, insurance, parts")}
          icon={DollarSign}
          color="#8b5cf6"
        />
        <StatCard
          title={tr("Fuel Share")}
          value={`₹${(summary.categoryTotals?.Fuel || 0).toLocaleString()}`}
          subtext={tr("Pump dispense transactions")}
          icon={Receipt}
          color="#06b6d4"
        />
        <StatCard
          title={tr("Maintenance Share")}
          value={`₹${((summary.categoryTotals?.Maintenance || 0) + (summary.categoryTotals?.Repair || 0)).toLocaleString()}`}
          subtext={tr("Workshop & spare parts")}
          icon={CreditCard}
          color="#f59e0b"
        />
        <StatCard
          title={tr("Total Vouchers")}
          value={summary.count}
          subtext={tr("Audited financial records")}
          icon={PieChart}
          color="#10b981"
        />
      </div>

      {/* Controls & Filter */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{tr("Fleet Operating Expenses")}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {tr("Real-time ledger tracking tolls, per-diem allowances, insurance premiums, and repairs")}
            </p>
          </div>

          {canManage && (
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={16} /> {tr("Add Expense Voucher")}
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
              placeholder={tr("Search description, rig, voucher ID...")}
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
            <option value="All">{tr("All Categories")}</option>
            <option value="Fuel">{tr("Fuel")}</option>
            <option value="Maintenance">{tr("Maintenance")}</option>
            <option value="Repair">{tr("Repair")}</option>
            <option value="Insurance">{tr("Insurance")}</option>
            <option value="Toll">{tr("Toll")}</option>
            <option value="Trip">{tr("Trip Allowance")}</option>
            <option value="Other">{tr("Other")}</option>
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
            <option value="All">{tr("All Vehicles")}</option>
            {vehicles.map((v) => (
              <option key={v._id} value={v._id}>
                {tr(v.registrationNumber)}
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
        emptyMessage={tr("No expenses recorded")}
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
        title={tr("Add Fleet Operating Expense Voucher")}
      >
        {actionError && (
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
            {actionError}
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Vehicle Rig *")}</label>
              <select
                className="form-control"
                value={formData.vehicleId}
                onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                required
              >
                <option value="">{tr("-- Choose Rig --")}</option>
                {vehicles.map((v) => (
                  <option key={v._id} value={v._id}>
                    {tr(v.registrationNumber)} ({tr(v.brand)} {tr(v.model)})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{tr("Expense Category *")}</label>
              <select
                className="form-control"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="Toll">{tr("Toll (FASTag/Cash)")}</option>
                <option value="Trip">{tr("Trip Allowance / Per-diem")}</option>
                <option value="Fuel">{tr("Fuel Refill")}</option>
                <option value="Maintenance">{tr("Maintenance Service")}</option>
                <option value="Repair">{tr("Emergency Roadside Repair")}</option>
                <option value="Insurance">{tr("Insurance Policy Premium")}</option>
                <option value="Other">{tr("Fitness / Certificates / Other")}</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{tr("Description / Purpose *")}</label>
            <input
              type="text"
              className="form-control"
              placeholder={tr("e.g. FASTag Electronic Toll Plaza Deductions (Delhi-Ahmedabad Highway)")}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Amount (₹) *")}</label>
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
              <label className="form-label">{tr("Date *")}</label>
              <input
                type="date"
                className="form-control"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Payment Method")}</label>
              <select
                className="form-control"
                value={formData.paymentMethod}
                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
              >
                <option value="Company Card">{tr("Company Card")}</option>
                <option value="Fuel Card">{tr("Fuel Card")}</option>
                <option value="UPI">{tr("UPI")}</option>
                <option value="Bank Transfer">{tr("Bank Transfer")}</option>
                <option value="Cash">{tr("Cash")}</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{tr("Associated Driver (Optional)")}</label>
            <select
              className="form-control"
              value={formData.driverId}
              onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
            >
              <option value="">{tr("No Driver Associated")}</option>
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {tr(d.name)} ({tr(d.driverId)})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              {tr("Cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {tr("Post Expense")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={tr("Delete Expense Record")}
        maxWidth="440px"
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            {tr("Are you sure you want to permanently delete this expense voucher?")}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              {tr("Cancel")}
            </button>
            <button className="btn btn-danger" onClick={confirmDelete}>
              {tr("Yes, Delete")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
