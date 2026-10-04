import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Plus,
  Search,
  Calendar,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Clock,
  DollarSign
} from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import StatCard from '../components/StatCard.jsx';
import { maintenanceApi, vehicleApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Maintenance() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'fleet_manager';

  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState({ totalCost: 0, activeRepairs: 0, completedServices: 0, overdueCount: 0, dueSoonCount: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Form State
  const initialForm = {
    vehicleId: '',
    maintenanceType: 'Regular Service',
    description: '',
    serviceDate: new Date().toISOString().split('T')[0],
    nextServiceDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
    cost: 5000,
    serviceCenter: '',
    status: 'Scheduled',
    notes: ''
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchMaintenance = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        status: statusFilter,
        maintenanceType: typeFilter
      });
      const res = await maintenanceApi.getAll(params.toString());
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

  const fetchVehiclesList = async () => {
    try {
      const res = await vehicleApi.getAll('limit=100');
      if (res.success) setVehicles(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchMaintenance();
  }, [page, statusFilter, typeFilter]);

  useEffect(() => {
    fetchVehiclesList();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchMaintenance();
  };

  const openAddModal = () => {
    setEditingRecord(null);
    setFormData(initialForm);
    setActionError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (rec) => {
    setEditingRecord(rec);
    setFormData({
      vehicleId: rec.vehicle?._id || rec.vehicle || '',
      maintenanceType: rec.maintenanceType || 'Regular Service',
      description: rec.description || '',
      serviceDate: rec.serviceDate ? new Date(rec.serviceDate).toISOString().split('T')[0] : '',
      nextServiceDate: rec.nextServiceDate ? new Date(rec.nextServiceDate).toISOString().split('T')[0] : '',
      cost: rec.cost || 0,
      serviceCenter: rec.serviceCenter || '',
      status: rec.status || 'Scheduled',
      notes: rec.notes || ''
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    try {
      if (editingRecord) {
        await maintenanceApi.update(editingRecord._id, formData);
      } else {
        await maintenanceApi.create(formData);
      }
      setIsModalOpen(false);
      fetchMaintenance();
    } catch (err) {
      setActionError(err.message || 'Operation failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await maintenanceApi.delete(deleteId);
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      fetchMaintenance();
    } catch (err) {
      alert(err.message || 'Failed to delete record');
    }
  };

  const columns = [
    {
      header: 'Job ID & Type',
      render: (m) => (
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>{m.maintenanceId}</strong>
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {m.maintenanceType}
          </div>
        </div>
      )
    },
    {
      header: 'Rig Registration',
      render: (m) => (
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>
            {m.vehicle?.registrationNumber || 'Vehicle'}
          </strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {m.vehicle?.brand} {m.vehicle?.model}
          </div>
        </div>
      )
    },
    {
      header: 'Service Center & Scope',
      render: (m) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{m.serviceCenter}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.description}
          </div>
        </div>
      )
    },
    {
      header: 'Dates',
      render: (m) => {
        const now = new Date();
        const nextDate = m.nextServiceDate ? new Date(m.nextServiceDate) : null;
        const isOverdue = nextDate && nextDate < now && m.status !== 'Completed';

        return (
          <div style={{ fontSize: '0.8rem' }}>
            <div>Service: {new Date(m.serviceDate).toLocaleDateString()}</div>
            {nextDate && (
              <div style={{ fontSize: '0.75rem', color: isOverdue ? '#fb7185' : 'var(--text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                Next: {nextDate.toLocaleDateString()} {isOverdue && '(OVERDUE)'}
              </div>
            )}
          </div>
        );
      }
    },
    {
      header: 'Cost',
      render: (m) => (
        <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
          ₹{m.cost?.toLocaleString()}
        </strong>
      )
    },
    {
      header: 'Status',
      render: (m) => {
        const statusClass = `badge-${m.status.toLowerCase().replace(' ', '-')}`;
        return <span className={`badge ${statusClass}`}>{m.status}</span>;
      }
    },
    {
      header: 'Actions',
      width: '120px',
      render: (m) => (
        canManage && (
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => openEditModal(m)}
              title="Edit / Update Status"
            >
              Update
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => {
                setDeleteId(m._id);
                setDeleteConfirmOpen(true);
              }}
              title="Delete Record"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Metric Cards */}
      <div className="grid-cols-4">
        <StatCard
          title="Total Maintenance Cost"
          value={`₹${summary.totalCost.toLocaleString()}`}
          subtext="Parts and labor expenditure"
          icon={DollarSign}
          color="#f59e0b"
        />
        <StatCard
          title="Active Workshop Jobs"
          value={summary.activeRepairs}
          subtext="In progress or scheduled"
          icon={Wrench}
          color="#3b82f6"
        />
        <StatCard
          title="Completed Services"
          value={summary.completedServices}
          subtext="Certified safe rigs"
          icon={CheckCircle2}
          color="#10b981"
        />
        <StatCard
          title="Overdue / Due Soon"
          value={`${summary.overdueCount + summary.dueSoonCount}`}
          subtext={`${summary.overdueCount} overdue | ${summary.dueSoonCount} due soon`}
          icon={AlertTriangle}
          color={summary.overdueCount > 0 ? '#fb7185' : '#fbbf24'}
        />
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Preventive Maintenance & Repairs</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Schedule oil changes, tire replacement, engine diagnostics, and workshop jobs
            </p>
          </div>

          {canManage && (
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={16} /> Book Service / Repair
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
              placeholder="Search by job ID, rig, workshop center..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <select
            className="form-control"
            style={{ width: '160px' }}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>

          <select
            className="form-control"
            style={{ width: '180px' }}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Service Types</option>
            <option value="Regular Service">Regular Service</option>
            <option value="Oil Change">Oil Change</option>
            <option value="Tire Replacement">Tire Replacement</option>
            <option value="Brake Service">Brake Service</option>
            <option value="Engine Service">Engine Service</option>
            <option value="Repair">Repair</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={records}
        loading={loading}
        emptyMessage="No maintenance records found"
        emptySubtext="Schedule a routine inspection or log a service repair job."
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => setPage(p)}
      />

      {/* Add / Edit Maintenance Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRecord ? `Update Service Job: ${editingRecord.maintenanceId}` : 'Schedule Vehicle Maintenance'}
      >
        {actionError && (
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
            {actionError}
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Select Vehicle *</label>
              <select
                className="form-control"
                value={formData.vehicleId}
                onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                required
              >
                <option value="">-- Choose Vehicle --</option>
                {vehicles.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.registrationNumber} ({v.brand} {v.model}) - {v.status}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Maintenance Category *</label>
              <select
                className="form-control"
                value={formData.maintenanceType}
                onChange={(e) => setFormData({ ...formData, maintenanceType: e.target.value })}
              >
                <option value="Regular Service">Regular Service</option>
                <option value="Oil Change">Oil Change</option>
                <option value="Tire Replacement">Tire Replacement</option>
                <option value="Brake Service">Brake Service</option>
                <option value="Engine Service">Engine Service</option>
                <option value="Repair">Repair</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Service Description / Scope *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Brake pad replacement & ABS diagnostic check"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Service Date *</label>
              <input
                type="date"
                className="form-control"
                value={formData.serviceDate}
                onChange={(e) => setFormData({ ...formData, serviceDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Next Service Date</label>
              <input
                type="date"
                className="form-control"
                value={formData.nextServiceDate}
                onChange={(e) => setFormData({ ...formData, nextServiceDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Service Cost (₹) *</label>
              <input
                type="number"
                className="form-control"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Authorized Service Center *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Tata Motors Commercial Workshop, Okhla"
                value={formData.serviceCenter}
                onChange={(e) => setFormData({ ...formData, serviceCenter: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Job Status *</label>
              <select
                className="form-control"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Scheduled">Scheduled (Locks rig to Maintenance)</option>
                <option value="In Progress">In Progress (Under active repair)</option>
                <option value="Completed">Completed (Returns rig to Available)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Technician Notes & Part Numbers</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="e.g. Part invoice #8920, oil sample test passed..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingRecord ? 'Save Changes' : 'Confirm Service Booking'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Maintenance Record"
        maxWidth="440px"
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to delete this maintenance job record?
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
