import React, { useState, useEffect } from 'react';
import {
  Navigation,
  Plus,
  Search,
  Play,
  CheckCircle,
  XCircle,
  Eye,
  Calendar,
  Truck,
  User,
  AlertTriangle,
  Clock,
  ArrowRight
} from 'lucide-react';
import DataTable from '../components/DataTable.jsx';
import Modal from '../components/Modal.jsx';
import { tripApi, vehicleApi, driverApi } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Trips() {
  const { user, role } = useAuth();
  const canManage = role === 'admin' || role === 'fleet_manager';

  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [activeTripToComplete, setActiveTripToComplete] = useState(null);
  const [completeData, setCompleteData] = useState({ actualEndDate: '', fuelUsed: 0, tripExpense: 0 });
  const [selectedTripDetails, setSelectedTripDetails] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Form State
  const initialForm = {
    vehicleId: '',
    driverId: '',
    source: '',
    destination: '',
    startDate: new Date().toISOString().split('T')[0] + 'T09:00',
    expectedEndDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0] + 'T18:00',
    distance: 100,
    purpose: 'Commercial Cargo Freight',
    tripExpense: 0,
    notes: ''
  };
  const [formData, setFormData] = useState(initialForm);

  const fetchTrips = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '10',
        search,
        status: statusFilter
      });
      const res = await tripApi.getAll(params.toString());
      if (res.success) {
        setTrips(res.data);
        setTotalPages(res.totalPages || 1);
        setTotalRecords(res.totalRecords || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableRigs = async () => {
    try {
      const vRes = await vehicleApi.getAll('limit=100');
      const dRes = await driverApi.getAll('limit=100');
      if (vRes.success) setVehicles(vRes.data);
      if (dRes.success) setDrivers(dRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, [page, statusFilter]);

  useEffect(() => {
    fetchAvailableRigs();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchTrips();
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setActionError(null);
    try {
      await tripApi.create(formData);
      setCreateModalOpen(false);
      setFormData(initialForm);
      fetchTrips();
      fetchAvailableRigs();
    } catch (err) {
      setActionError(err.message || 'Failed to create trip');
    }
  };

  const handleStartTrip = async (id) => {
    try {
      await tripApi.start(id);
      fetchTrips();
      fetchAvailableRigs();
    } catch (err) {
      alert(err.message || 'Cannot start trip');
    }
  };

  const openCompleteModal = (trip) => {
    setActiveTripToComplete(trip);
    setCompleteData({
      actualEndDate: new Date().toISOString().split('T')[0] + 'T' + new Date().toTimeString().split(' ')[0].slice(0, 5),
      fuelUsed: trip.fuelUsed || 50,
      tripExpense: trip.tripExpense || 2000
    });
    setActionError(null);
    setCompleteModalOpen(true);
  };

  const handleCompleteSubmit = async (e) => {
    e.preventDefault();
    if (!activeTripToComplete) return;
    try {
      await tripApi.complete(activeTripToComplete._id, completeData);
      setCompleteModalOpen(false);
      setActiveTripToComplete(null);
      fetchTrips();
      fetchAvailableRigs();
    } catch (err) {
      setActionError(err.message || 'Failed to complete trip');
    }
  };

  const handleCancelTrip = async (id) => {
    if (!confirm('Are you sure you want to cancel this trip? Assigned vehicle and driver will be freed.')) return;
    try {
      await tripApi.cancel(id);
      fetchTrips();
      fetchAvailableRigs();
    } catch (err) {
      alert(err.message || 'Failed to cancel trip');
    }
  };

  const availableVehicles = vehicles.filter(v => v.status === 'Available');
  const availableDrivers = drivers.filter(d => d.status === 'Available');

  const columns = [
    {
      header: 'Trip ID',
      render: (t) => (
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>{t.tripId}</strong>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.purpose}</div>
        </div>
      )
    },
    {
      header: 'Route & Distance',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>{t.source}</span>
            <ArrowRight size={13} color="var(--primary)" />
            <span>{t.destination}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
            {t.distance} km
          </div>
        </div>
      )
    },
    {
      header: 'Vehicle & Driver',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {t.vehicle?.registrationNumber || 'Vehicle'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {t.driver?.name || 'Driver'}
          </div>
        </div>
      )
    },
    {
      header: 'Schedule',
      render: (t) => (
        <div style={{ fontSize: '0.8rem' }}>
          <div>Start: {new Date(t.startDate).toLocaleDateString()}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Exp: {new Date(t.expectedEndDate).toLocaleDateString()}
          </div>
        </div>
      )
    },
    {
      header: 'Status',
      render: (t) => {
        const statusClass = `badge-${t.status.toLowerCase().replace(' ', '-')}`;
        return <span className={`badge ${statusClass}`}>{t.status}</span>;
      }
    },
    {
      header: 'Actions',
      width: '180px',
      render: (t) => (
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedTripDetails(t)}
            title="View Details"
          >
            <Eye size={13} />
          </button>

          {/* Action triggers depending on trip status */}
          {t.status === 'Scheduled' && (
            <button
              className="btn btn-sm"
              onClick={() => handleStartTrip(t._id)}
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.4)' }}
              title="Start Trip (Transitions vehicle to On Trip)"
            >
              <Play size={13} /> Start
            </button>
          )}

          {t.status === 'In Progress' && (
            <button
              className="btn btn-sm"
              onClick={() => openCompleteModal(t)}
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.4)' }}
              title="Complete Delivery (Returns rig to Available)"
            >
              <CheckCircle size={13} /> Finish
            </button>
          )}

          {(t.status === 'Scheduled' || t.status === 'In Progress') && canManage && (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => handleCancelTrip(t._id)}
              title="Cancel Delivery"
            >
              <XCircle size={13} />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Controls Card */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Dispatch & Trip Management</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Schedule transit corridors, assign qualified drivers, and monitor delivery progress
            </p>
          </div>

          {canManage && (
            <button className="btn btn-primary" onClick={() => setCreateModalOpen(true)}>
              <Plus size={16} /> Schedule New Trip
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
              placeholder="Search by trip ID, source, destination, rig..."
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
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <DataTable
        columns={columns}
        data={trips}
        loading={loading}
        emptyMessage="No trips found"
        emptySubtext="Create a new trip schedule or modify your active filters."
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => setPage(p)}
      />

      {/* Schedule Trip Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Schedule Commercial Trip Dispatch"
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

        <form onSubmit={handleCreateSubmit}>
          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Select Available Vehicle *</label>
              <select
                className="form-control"
                value={formData.vehicleId}
                onChange={(e) => setFormData({ ...formData, vehicleId: e.target.value })}
                required
              >
                <option value="">-- Choose Available Rig --</option>
                {availableVehicles.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.registrationNumber} ({v.brand} {v.model}) - {v.vehicleType}
                  </option>
                ))}
              </select>
              {availableVehicles.length === 0 && (
                <span style={{ fontSize: '0.7rem', color: '#fbbf24' }}>
                  ⚠️ No vehicles currently marked 'Available'.
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Select Available Driver *</label>
              <select
                className="form-control"
                value={formData.driverId}
                onChange={(e) => setFormData({ ...formData, driverId: e.target.value })}
                required
              >
                <option value="">-- Choose Available Operator --</option>
                {availableDrivers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} ({d.driverId})
                  </option>
                ))}
              </select>
              {availableDrivers.length === 0 && (
                <span style={{ fontSize: '0.7rem', color: '#fbbf24' }}>
                  ⚠️ No drivers currently marked 'Available'.
                </span>
              )}
            </div>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Origin / Source Hub *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. New Delhi ICD"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Destination Facility *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Mundra Port, Gujarat"
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid-cols-3" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Estimated Distance (km) *</label>
              <input
                type="number"
                className="form-control"
                value={formData.distance}
                onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Start Date & Time *</label>
              <input
                type="datetime-local"
                className="form-control"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Arrival Date *</label>
              <input
                type="datetime-local"
                className="form-control"
                value={formData.expectedEndDate}
                onChange={(e) => setFormData({ ...formData, expectedEndDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Trip Cargo Purpose</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. High-tech Electronics Consignment"
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Advance Trip Allowance (₹)</label>
              <input
                type="number"
                className="form-control"
                value={formData.tripExpense}
                onChange={(e) => setFormData({ ...formData, tripExpense: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Transit Instructions</label>
            <textarea
              className="form-control"
              rows={2}
              placeholder="e.g. Mandatory temperature check every 6 hours, avoid NH-8 bypass..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={availableVehicles.length === 0 || availableDrivers.length === 0}>
              Confirm Dispatch Schedule
            </button>
          </div>
        </form>
      </Modal>

      {/* Complete Trip Modal */}
      <Modal
        isOpen={completeModalOpen}
        onClose={() => setCompleteModalOpen(false)}
        title={`Complete Delivery: ${activeTripToComplete?.tripId}`}
        maxWidth="500px"
      >
        {actionError && (
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', marginBottom: '1rem', borderRadius: 'var(--radius-md)' }}>
            {actionError}
          </div>
        )}

        <form onSubmit={handleCompleteSubmit}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Completing this trip will record final odometer distance, release the vehicle ({activeTripToComplete?.vehicle?.registrationNumber}) and return the driver ({activeTripToComplete?.driver?.name}) to <strong>AVAILABLE</strong> status.
          </p>

          <div className="form-group">
            <label className="form-label">Actual Arrival Date & Time</label>
            <input
              type="datetime-local"
              className="form-control"
              value={completeData.actualEndDate}
              onChange={(e) => setCompleteData({ ...completeData, actualEndDate: e.target.value })}
              required
            />
          </div>

          <div className="grid-cols-2" style={{ gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Total Fuel Used (Liters)</label>
              <input
                type="number"
                className="form-control"
                value={completeData.fuelUsed}
                onChange={(e) => setCompleteData({ ...completeData, fuelUsed: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Trip Incidental Expenses (₹)</label>
              <input
                type="number"
                className="form-control"
                value={completeData.tripExpense}
                onChange={(e) => setCompleteData({ ...completeData, tripExpense: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setCompleteModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#10b981' }}>
              Confirm Trip Completion
            </button>
          </div>
        </form>
      </Modal>

      {/* View Trip Details Modal */}
      {selectedTripDetails && (
        <Modal
          isOpen={!!selectedTripDetails}
          onClose={() => setSelectedTripDetails(null)}
          title={`Trip Details: ${selectedTripDetails.tripId}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
              <div>
                <span className={`badge badge-${selectedTripDetails.status.toLowerCase().replace(' ', '-')}`}>
                  {selectedTripDetails.status}
                </span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '0.35rem' }}>
                  {selectedTripDetails.source} ➔ {selectedTripDetails.destination}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                  {selectedTripDetails.distance} km
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Corridor Length</div>
              </div>
            </div>

            <div className="grid-cols-2" style={{ gap: '1rem' }}>
              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>ASSIGNED RIG</div>
                <strong>{selectedTripDetails.vehicle?.registrationNumber || 'Vehicle'}</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {selectedTripDetails.vehicle?.brand} {selectedTripDetails.vehicle?.model}
                </div>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>COMMERCIAL DRIVER</div>
                <strong>{selectedTripDetails.driver?.name || 'Driver'}</strong>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Phone: {selectedTripDetails.driver?.phone || 'N/A'}
                </div>
              </div>
            </div>

            <div className="grid-cols-2" style={{ gap: '1rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>DEPARTURE DATE</div>
                <div>{new Date(selectedTripDetails.startDate).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>EXPECTED ARRIVAL</div>
                <div>{new Date(selectedTripDetails.expectedEndDate).toLocaleString()}</div>
              </div>
            </div>

            {selectedTripDetails.notes && (
              <div style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '2px' }}>TRIP NOTES</div>
                <p>{selectedTripDetails.notes}</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedTripDetails(null)}>
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
