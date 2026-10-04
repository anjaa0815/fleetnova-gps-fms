import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Fuel,
  Gauge
} from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import LiveMap from '../components/LiveMap.jsx';
import { vehicleApi, driverApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useT } from '../i18n/LanguageContext.jsx';

export default function Vehicles({ onSelectVehicle }) {
  const { tr } = useT();
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'fleet_manager';

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fuelFilter, setFuelFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Form State
  const initialForm = {
    registrationNumber: '',
    vehicleType: 'Truck',
    brand: '',
    model: '',
    manufacturingYear: new Date().getFullYear(),
    fuelType: 'Diesel',
    fuelCapacity: 100,
    currentMileage: 0,
    status: 'Available',
    assignedDriver: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    insuranceExpiry: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
    registrationExpiry: new Date(Date.now() + 10 * 365 * 86400000).toISOString().split('T')[0],
    lastServiceDate: '',
    nextServiceDate: '',
    notes: ''
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        status: statusFilter,
        fuelType: fuelFilter,
        vehicleType: typeFilter
      });
      const res = await vehicleApi.getAll(params.toString());
      if (res.success) {
        setVehicles(res.data);
        setTotalPages(res.totalPages || 1);
        setTotalRecords(res.totalRecords || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await driverApi.getAll('limit=100');
      if (res.success) {
        setDrivers(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, [page, statusFilter, fuelFilter, typeFilter]);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchVehicles();
  };

  const openAddModal = () => {
    setEditingVehicle(null);
    setFormData(initialForm);
    setActionError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (vehicle) => {
    setEditingVehicle(vehicle);
    setFormData({
      registrationNumber: vehicle.registrationNumber || '',
      vehicleType: vehicle.vehicleType || 'Truck',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      manufacturingYear: vehicle.manufacturingYear || new Date().getFullYear(),
      fuelType: vehicle.fuelType || 'Diesel',
      fuelCapacity: vehicle.fuelCapacity || 100,
      currentMileage: vehicle.currentMileage || 0,
      status: vehicle.status || 'Available',
      assignedDriver: vehicle.assignedDriver?._id || vehicle.assignedDriver || '',
      purchaseDate: vehicle.purchaseDate ? new Date(vehicle.purchaseDate).toISOString().split('T')[0] : '',
      insuranceExpiry: vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toISOString().split('T')[0] : '',
      registrationExpiry: vehicle.registrationExpiry ? new Date(vehicle.registrationExpiry).toISOString().split('T')[0] : '',
      lastServiceDate: vehicle.lastServiceDate ? new Date(vehicle.lastServiceDate).toISOString().split('T')[0] : '',
      nextServiceDate: vehicle.nextServiceDate ? new Date(vehicle.nextServiceDate).toISOString().split('T')[0] : '',
      notes: vehicle.notes || ''
    });
    setActionError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    try {
      if (editingVehicle) {
        await vehicleApi.update(editingVehicle._id, formData);
      } else {
        await vehicleApi.create(formData);
      }
      setIsModalOpen(false);
      fetchVehicles();
    } catch (err) {
      setActionError(err.message || 'Operation failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await vehicleApi.delete(deleteId);
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      fetchVehicles();
    } catch (err) {
      alert(tr(err.message || 'Failed to delete vehicle'));
    }
  };

  // Table Columns
  const columns = [
    {
      header: tr("Vehicle ID & Reg"),
      render: (v) => (
        <div>
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            {v.registrationNumber}
          </strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.vehicleId}</div>
        </div>
      )
    },
    {
      header: tr("Make & Model"),
      render: (v) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v.brand} {v.model}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {tr(v.vehicleType)} • {v.manufacturingYear}
          </div>
        </div>
      )
    },
    {
      header: tr("Fuel & Odometer"),
      render: (v) => (
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
            {tr(v.fuelType)}
          </span>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {v.currentMileage?.toLocaleString()} {tr("km")}
          </div>
        </div>
      )
    },
    {
      header: tr("Assigned Driver"),
      render: (v) => (
        <div>
          {v.assignedDriver?.name ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
              {v.assignedDriver.name}
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {tr("Unassigned")}
            </span>
          )}
        </div>
      )
    },
    {
      header: tr("Status"),
      render: (v) => {
        const statusClass = `badge-${v.status.toLowerCase().replace(' ', '-')}`;
        return <span className={`badge ${statusClass}`}>{tr(v.status)}</span>;
      }
    },
    {
      header: tr("Actions"),
      width: '160px',
      render: (v) => (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => onSelectVehicle(v._id)}
            title={tr("View Details")}
          >
            <Eye size={14} /> {tr("View")}
          </button>
          {canManage && (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => openEditModal(v)}
                title={tr("Edit Vehicle")}
              >
                <Edit size={14} />
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setDeleteId(v._id);
                  setDeleteConfirmOpen(true);
                }}
                disabled={v.status === 'On Trip'}
                title={v.status === 'On Trip' ? 'Cannot delete vehicle currently on trip' : 'Delete Vehicle'}
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
      {/* Action Header & Filters */}
      <div
        className="card"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>{tr("Fleet Vehicle Inventory")}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {tr("Manage commercial trucks, vans, buses, and fuel configurations")}
            </p>
          </div>

          {canManage && (
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={16} /> {tr("Register New Vehicle")}
            </button>
          )}
        </div>

        {/* Filter Controls Row */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              style={{ paddingLeft: '36px' }}
              placeholder={tr("Search registration, brand, model...")}
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
            <option value="All">{tr("All Statuses")}</option>
            <option value="Available">{tr("Available")}</option>
            <option value="On Trip">{tr("On Trip")}</option>
            <option value="Maintenance">{tr("Maintenance")}</option>
            <option value="Inactive">{tr("Inactive")}</option>
          </select>

          <select
            className="form-control"
            style={{ width: '140px' }}
            value={fuelFilter}
            onChange={(e) => {
              setFuelFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">{tr("All Fuels")}</option>
            <option value="Diesel">{tr("Diesel")}</option>
            <option value="Electric">{tr("Electric")}</option>
            <option value="CNG">{tr("CNG")}</option>
            <option value="Petrol">{tr("Petrol")}</option>
            <option value="Hybrid">{tr("Hybrid")}</option>
          </select>

          <select
            className="form-control"
            style={{ width: '140px' }}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">{tr("All Types")}</option>
            <option value="Truck">{tr("Truck")}</option>
            <option value="Van">{tr("Van")}</option>
            <option value="Bus">{tr("Bus")}</option>
            <option value="Sedan">{tr("Sedan")}</option>
            <option value="SUV">{tr("SUV")}</option>
            <option value="Pickup">{tr("Pickup")}</option>
          </select>
        </div>
      </div>

      {/* Real-Time GPS Tracking Map */}
      <LiveMap vehicles={vehicles} />

      {/* Main Data Table */}
      <DataTable
        columns={columns}
        data={vehicles}
        loading={loading}
        emptyMessage={tr("No vehicles match your search or filter")}
        emptySubtext="Try adjusting the filters or register a new commercial vehicle."
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(newPage) => setPage(newPage)}
      />

      {/* Add / Edit Vehicle Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingVehicle ? `Edit Vehicle (${editingVehicle.registrationNumber})` : 'Register New Vehicle'}
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
              <label className="form-label">{tr("Registration Number *")}</label>
              <input
                type="text"
                className="form-control"
                placeholder={tr("e.g. DL-01-AX-9920")}
                value={formData.registrationNumber}
                onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Vehicle Type *")}</label>
              <select
                className="form-control"
                value={formData.vehicleType}
                onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
              >
                <option value="Truck">{tr("Truck")}</option>
                <option value="Van">{tr("Van")}</option>
                <option value="Bus">{tr("Bus")}</option>
                <option value="Sedan">{tr("Sedan")}</option>
                <option value="SUV">{tr("SUV")}</option>
                <option value="Pickup">{tr("Pickup")}</option>
              </select>
            </div>
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Brand / Manufacturer *")}</label>
              <input
                type="text"
                className="form-control"
                placeholder={tr("e.g. Tata Motors")}
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Model *")}</label>
              <input
                type="text"
                className="form-control"
                placeholder={tr("e.g. Prima 5530.S")}
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Year")}</label>
              <input
                type="number"
                className="form-control"
                value={formData.manufacturingYear}
                onChange={(e) => setFormData({ ...formData, manufacturingYear: e.target.value })}
              />
            </div>
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Fuel Type *")}</label>
              <select
                className="form-control"
                value={formData.fuelType}
                onChange={(e) => setFormData({ ...formData, fuelType: e.target.value })}
              >
                <option value="Diesel">{tr("Diesel")}</option>
                <option value="Petrol">{tr("Petrol")}</option>
                <option value="Electric">{tr("Electric")}</option>
                <option value="CNG">{tr("CNG")}</option>
                <option value="Hybrid">{tr("Hybrid")}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Fuel/Battery Tank (L/kWh)")}</label>
              <input
                type="number"
                className="form-control"
                value={formData.fuelCapacity}
                onChange={(e) => setFormData({ ...formData, fuelCapacity: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Current Odometer (km)")}</label>
              <input
                type="number"
                className="form-control"
                value={formData.currentMileage}
                onChange={(e) => setFormData({ ...formData, currentMileage: e.target.value })}
              />
            </div>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Operational Status")}</label>
              <select
                className="form-control"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="Available">{tr("Available")}</option>
                <option value="On Trip">{tr("On Trip")}</option>
                <option value="Maintenance">{tr("Maintenance")}</option>
                <option value="Inactive">{tr("Inactive")}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Assigned Driver")}</label>
              <select
                className="form-control"
                value={formData.assignedDriver}
                onChange={(e) => setFormData({ ...formData, assignedDriver: e.target.value })}
              >
                <option value="">{tr("No Driver Assigned")}</option>
                {drivers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {tr(d.name)} ({tr(d.driverId)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">{tr("Insurance Expiry Date *")}</label>
              <input
                type="date"
                className="form-control"
                value={formData.insuranceExpiry}
                onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">{tr("Registration Expiry Date *")}</label>
              <input
                type="date"
                className="form-control"
                value={formData.registrationExpiry}
                onChange={(e) => setFormData({ ...formData, registrationExpiry: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{tr("Operational Notes")}</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder={tr("e.g. Telematics unit installed, speed governor tested...")}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              {tr("Cancel")}
            </button>
            <button type="submit" className="btn btn-primary">
              {editingVehicle ? tr("Update Vehicle") : tr("Register Vehicle")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={tr("Confirm Vehicle Deletion")}
        maxWidth="440px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', textAlign: 'center' }}>
          <AlertTriangle size={48} color="#fb7185" style={{ margin: '0 auto' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {tr("Are you sure you want to permanently delete this vehicle from the fleet registry? All associated telemetry and historical records will be archived.")}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              {tr("Cancel")}
            </button>
            <button className="btn btn-danger" onClick={confirmDelete}>
              {tr("Yes, Delete Vehicle")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}