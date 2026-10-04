import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  AlertTriangle,
  Truck,
  Phone,
  Mail,
  ShieldCheck
} from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import { driverApi, vehicleApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Drivers({ onSelectDriver }) {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'fleet_manager';

  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Form State
  const initialForm = {
    name: '',
    email: '',
    phone: '',
    licenseNumber: '',
    licenseExpiry: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    dateOfJoining: new Date().toISOString().split('T')[0],
    assignedVehicle: '',
    status: 'Available',
    emergencyContact: '',
    address: '',
    notes: ''
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        status: statusFilter
      });
      const res = await driverApi.getAll(params.toString());
      if (res.success) {
        setDrivers(res.data);
        setTotalPages(res.totalPages || 1);
        setTotalRecords(res.totalRecords || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableVehicles = async () => {
    try {
      const res = await vehicleApi.getAll('limit=100');
      if (res.success) {
        setVehicles(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, [page, statusFilter]);

  useEffect(() => {
    fetchAvailableVehicles();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchDrivers();
  };

  const openAddModal = () => {
    setEditingDriver(null);
    setFormData(initialForm);
    setActionError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (driver) => {
    setEditingDriver(driver);
    setFormData({
      name: driver.name || '',
      email: driver.email || '',
      phone: driver.phone || '',
      licenseNumber: driver.licenseNumber || '',
      licenseExpiry: driver.licenseExpiry ? new Date(driver.licenseExpiry).toISOString().split('T')[0] : '',
      dateOfJoining: driver.dateOfJoining ? new Date(driver.dateOfJoining).toISOString().split('T')[0] : '',
      assignedVehicle: driver.assignedVehicle?._id || driver.assignedVehicle || '',
      status: driver.status || 'Available',
      emergencyContact: driver.emergencyContact || '',
      address: driver.address || '',
      notes: driver.notes || ''
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    try {
      if (editingDriver) {
        await driverApi.update(editingDriver._id, formData);
      } else {
        await driverApi.create(formData);
      }
      setIsModalOpen(false);
      fetchDrivers();
    } catch (err) {
      setActionError(err.message || 'Operation failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await driverApi.delete(deleteId);
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      fetchDrivers();
    } catch (err) {
      alert(err.message || 'Failed to delete driver');
    }
  };

  const columns = [
    {
      header: 'Driver Name & ID',
      render: (d) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="user-avatar-circle" style={{ width: '34px', height: '34px', fontSize: '0.8rem' }}>
            {d.name.charAt(0)}
          </div>
          <div>
            <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{d.name}</strong>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.driverId}</div>
          </div>
        </div>
      )
    },
    {
      header: 'Contact Info',
      render: (d) => (
        <div style={{ fontSize: '0.825rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-primary)' }}>
            <Phone size={13} color="var(--accent-cyan)" /> {d.phone}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            <Mail size={13} /> {d.email}
          </div>
        </div>
      )
    },
    {
      header: 'Commercial License',
      render: (d) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.825rem', fontFamily: 'var(--font-mono)' }}>
            {d.licenseNumber}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Expires: {d.licenseExpiry ? new Date(d.licenseExpiry).toLocaleDateString() : 'N/A'}
          </div>
        </div>
      )
    },
    {
      header: 'Assigned Rig',
      render: (d) => (
        <div>
          {d.assignedVehicle?.registrationNumber ? (
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
              {d.assignedVehicle.registrationNumber}
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Unassigned
            </span>
          )}
        </div>
      )
    },
    {
      header: 'Status',
      render: (d) => {
        const statusClass = `badge-${d.status.toLowerCase().replace(' ', '-')}`;
        return <span className={`badge ${statusClass}`}>{d.status}</span>;
      }
    },
    {
      header: 'Actions',
      width: '160px',
      render: (d) => (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onSelectDriver(d._id)}
            title="View Details"
          >
            <Eye size={14} /> View
          </button>
          {canManage && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => openEditModal(d)}
                title="Edit Driver"
              >
                <Edit size={14} />
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setDeleteId(d._id);
                  setDeleteConfirmOpen(true);
                }}
                disabled={d.status === 'On Trip'}
                title={d.status === 'On Trip' ? 'Cannot delete driver on active trip' : 'Delete Driver'}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header and Controls */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Driver Personnel Directory</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Commercial licensed operators, vehicle assignments, and compliance status
            </p>
          </div>

          {canManage && (
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={16} /> Register New Driver
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
              placeholder="Search driver by name, phone, license..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>

          <select
            className="form-control"
            style={{ width: '150px' }}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All Statuses</option>
            <option value="Available">Available</option>
            <option value="On Trip">On Trip</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Main Drivers Table */}
      <DataTable
        columns={columns}
        data={drivers}
        loading={loading}
        emptyMessage="No drivers match your criteria"
        emptySubtext="Add a new driver or refine your search filters."
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(newPage) => setPage(newPage)}
      />

      {/* Add / Edit Driver Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingDriver ? `Edit Driver (${editingDriver.name})` : 'Register New Fleet Driver'}
      >
        {actionError && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fb7185',
              fontSize: '0.85rem',
              marginBottom: '1rem'
            }}
          >
            {actionError}
          </div>
        )}

        <form onSubmit={handleFormSubmit}>
          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Suresh Patel"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Official Email *</label>
              <input
                type="email"
                className="form-control"
                placeholder="suresh@fleetnova.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="text"
                className="form-control"
                placeholder="+91 98250 33441"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Contact (Name & Phone)</label>
              <input
                type="text"
                className="form-control"
                placeholder="+91 98250 99887 (Brother)"
                value={formData.emergencyContact}
                onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
              />
            </div>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Commercial License Number *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. DL-1420110012345"
                value={formData.licenseNumber}
                onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">License Expiry Date *</label>
              <input
                type="date"
                className="form-control"
                value={formData.licenseExpiry}
                onChange={(e) => setFormData({ ...formData, licenseExpiry: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-control"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Available">Available</option>
                <option value="On Trip">On Trip</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Date of Joining</label>
              <input
                type="date"
                className="form-control"
                value={formData.dateOfJoining}
                onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Assign Vehicle</label>
              <select
                className="form-control"
                value={formData.assignedVehicle}
                onChange={(e) => setFormData({ ...formData, assignedVehicle: e.target.value })}
              >
                <option value="">No Vehicle Assigned</option>
                {vehicles.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.registrationNumber} ({v.brand} {v.model})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Residential Address</label>
            <input
              type="text"
              className="form-control"
              placeholder="Full permanent or residential address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Driver Qualifications & Notes</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="e.g. Hazardous chemical cargo certified, cold-chain experienced..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingDriver ? 'Save Changes' : 'Register Driver'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Confirm Driver Removal"
        maxWidth="440px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
          <AlertTriangle size={48} color="#fb7185" style={{ margin: '0 auto' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Are you sure you want to delete this driver from the fleet directory? This will remove all vehicle allocations.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirmDelete}>
              Yes, Delete Driver
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
