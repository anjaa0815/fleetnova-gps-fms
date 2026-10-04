import { DataEngine } from '../models/dataEngine.js';

// @desc Get all maintenance records with filters & pagination
// @route GET /api/maintenance
export const getMaintenanceRecords = async (req, res, next) => {
  try {
    const { vehicle, status, maintenanceType, search, page = 1, limit = 10 } = req.query;

    let records = await DataEngine.find('maintenances', {}, {
      populate: 'vehicle'
    });

    if (vehicle && vehicle !== 'All') {
      records = records.filter(m => (m.vehicle?._id || m.vehicle) === vehicle);
    }

    if (status && status !== 'All') {
      records = records.filter(m => m.status === status);
    }

    if (maintenanceType && maintenanceType !== 'All') {
      records = records.filter(m => m.maintenanceType === maintenanceType);
    }

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      records = records.filter(m =>
        (m.maintenanceId && m.maintenanceId.toLowerCase().includes(q)) ||
        (m.vehicle?.registrationNumber && m.vehicle.registrationNumber.toLowerCase().includes(q)) ||
        (m.description && m.description.toLowerCase().includes(q)) ||
        (m.serviceCenter && m.serviceCenter.toLowerCase().includes(q))
      );
    }

    records.sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate));

    // Summary calculations
    const totalCost = records.reduce((acc, m) => acc + (m.cost || 0), 0);
    const activeRepairs = records.filter(m => m.status === 'In Progress' || m.status === 'Scheduled').length;
    const completedServices = records.filter(m => m.status === 'Completed').length;

    // Check overdue and due soon
    const now = new Date();
    const fifteenDays = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    let overdueCount = 0;
    let dueSoonCount = 0;

    records.forEach(r => {
      if (r.nextServiceDate && r.status !== 'Completed') {
        const nextDate = new Date(r.nextServiceDate);
        if (nextDate < now) overdueCount++;
        else if (nextDate <= fifteenDays) dueSoonCount++;
      }
    });

    const totalRecords = records.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = records.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      data: paginated,
      summary: {
        totalCost,
        activeRepairs,
        completedServices,
        overdueCount,
        dueSoonCount
      },
      totalRecords,
      totalPages,
      currentPage: pageNum
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create maintenance record
// @route POST /api/maintenance
export const createMaintenanceRecord = async (req, res, next) => {
  try {
    const {
      vehicleId,
      maintenanceType,
      description,
      serviceDate,
      nextServiceDate,
      cost,
      serviceCenter,
      status = 'Scheduled',
      notes = ''
    } = req.body;

    if (!vehicleId || !maintenanceType || !description || !serviceDate || cost === undefined || !serviceCenter) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle, maintenance type, description, service date, cost, and service center are required'
      });
    }

    const vehicle = await DataEngine.findById('vehicles', vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const count = await DataEngine.countDocuments('maintenances');
    const maintenanceId = `MNT-${1000 + count + 1}`;

    const newRecord = await DataEngine.create('maintenances', {
      maintenanceId,
      vehicle: vehicle._id,
      maintenanceType,
      description: description.trim(),
      serviceDate: new Date(serviceDate),
      nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : null,
      cost: Number(cost) || 0,
      serviceCenter: serviceCenter.trim(),
      status,
      notes
    });

    // Enforce Business Logic: If In Progress or Scheduled and vehicle is Available, change to Maintenance
    if (status === 'In Progress' || status === 'Scheduled') {
      await DataEngine.findByIdAndUpdate('vehicles', vehicle._id, {
        status: 'Maintenance',
        lastServiceDate: new Date(serviceDate),
        nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : vehicle.nextServiceDate
      });
    }

    // Automatically record in Expenses
    const expCount = await DataEngine.countDocuments('expenses');
    await DataEngine.create('expenses', {
      expenseId: `EXP-${1000 + expCount + 1}`,
      vehicle: vehicle._id,
      category: 'Maintenance',
      amount: Number(cost) || 0,
      date: new Date(serviceDate),
      description: `${maintenanceType}: ${description} at ${serviceCenter}`,
      paymentMethod: 'Company Card'
    });

    // Create Notification
    await DataEngine.create('notifications', {
      type: 'maintenance_due',
      title: 'Vehicle Service Scheduled',
      message: `${maintenanceType} booked for ${vehicle.registrationNumber} at ${serviceCenter} (₹${cost})`,
      relatedEntity: 'Maintenance',
      relatedEntityId: newRecord._id
    });

    return res.status(201).json({
      success: true,
      message: 'Maintenance record created',
      data: newRecord
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update maintenance record
// @route PUT /api/maintenance/:id
export const updateMaintenanceRecord = async (req, res, next) => {
  try {
    const existing = await DataEngine.findById('maintenances', req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    const updated = await DataEngine.findByIdAndUpdate('maintenances', req.params.id, req.body);

    // Business Logic: If updated to Completed, return vehicle to Available
    if (req.body.status === 'Completed') {
      const vehicleId = existing.vehicle?._id || existing.vehicle;
      if (vehicleId) {
        await DataEngine.findByIdAndUpdate('vehicles', vehicleId, {
          status: 'Available',
          lastServiceDate: existing.serviceDate,
          nextServiceDate: req.body.nextServiceDate ? new Date(req.body.nextServiceDate) : existing.nextServiceDate
        });
      }
    } else if (req.body.status === 'In Progress') {
      const vehicleId = existing.vehicle?._id || existing.vehicle;
      if (vehicleId) {
        await DataEngine.findByIdAndUpdate('vehicles', vehicleId, {
          status: 'Maintenance'
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Maintenance record updated',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete maintenance record
// @route DELETE /api/maintenance/:id
export const deleteMaintenanceRecord = async (req, res, next) => {
  try {
    const record = await DataEngine.findById('maintenances', req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    await DataEngine.findByIdAndDelete('maintenances', req.params.id);

    // If vehicle was under maintenance, check if other active maintenance exists
    const vehicleId = record.vehicle?._id || record.vehicle;
    if (vehicleId) {
      const allMaint = await DataEngine.find('maintenances');
      const otherActive = allMaint.find(
        m => (m.vehicle?._id || m.vehicle) === vehicleId && m.status !== 'Completed' && m._id !== record._id
      );
      if (!otherActive) {
        await DataEngine.findByIdAndUpdate('vehicles', vehicleId, { status: 'Available' });
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Maintenance record deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
