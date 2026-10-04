import { DataEngine } from '../models/dataEngine.js';

// @desc Get all drivers with filtering, search, pagination
// @route GET /api/drivers
export const getDrivers = async (req, res, next) => {
  try {
    const { search, status, sort = 'createdAt', order = 'desc', page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status && status !== 'All') filter.status = status;

    let drivers = await DataEngine.find('drivers', filter, {
      populate: 'assignedVehicle'
    });

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      drivers = drivers.filter(d =>
        (d.name && d.name.toLowerCase().includes(q)) ||
        (d.licenseNumber && d.licenseNumber.toLowerCase().includes(q)) ||
        (d.phone && d.phone.includes(q)) ||
        (d.driverId && d.driverId.toLowerCase().includes(q))
      );
    }

    const sortField = sort;
    const sortDirection = order === 'asc' ? 1 : -1;
    drivers.sort((a, b) => {
      if (a[sortField] < b[sortField]) return -1 * sortDirection;
      if (a[sortField] > b[sortField]) return 1 * sortDirection;
      return 0;
    });

    const totalRecords = drivers.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = drivers.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      data: paginated,
      totalRecords,
      totalPages,
      currentPage: pageNum
    });
  } catch (error) {
    next(error);
  }
};

// @desc Get single driver profile with trips & performance
// @route GET /api/drivers/:id
export const getDriverById = async (req, res, next) => {
  try {
    const driver = await DataEngine.findById('drivers', req.params.id, {
      populate: 'assignedVehicle'
    });

    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const driverId = driver._id;

    // Related trips
    const allTrips = await DataEngine.find('trips');
    const driverTrips = allTrips.filter(t => (t.driver?._id || t.driver) === driverId);

    // Performance metrics
    const completedTrips = driverTrips.filter(t => t.status === 'Completed');
    const totalDistance = completedTrips.reduce((acc, t) => acc + (t.distance || 0), 0);
    const activeTrip = driverTrips.find(t => t.status === 'In Progress');

    // License warnings
    const warnings = [];
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (driver.licenseExpiry) {
      const expDate = new Date(driver.licenseExpiry);
      if (expDate < now) {
        warnings.push({ type: 'danger', message: 'Driver commercial license has EXPIRED!' });
      } else if (expDate <= thirtyDays) {
        const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
        warnings.push({ type: 'warning', message: `License expires in ${daysLeft} days.` });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ...driver,
        trips: driverTrips,
        activeTrip: activeTrip || null,
        performance: {
          totalTrips: driverTrips.length,
          completedTrips: completedTrips.length,
          totalDistanceKm: totalDistance,
          completionRate: driverTrips.length > 0 ? Math.round((completedTrips.length / driverTrips.length) * 100) : 100
        },
        warnings
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create new driver
// @route POST /api/drivers
export const createDriver = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      licenseNumber,
      licenseExpiry,
      dateOfJoining,
      assignedVehicle = null,
      status = 'Available',
      emergencyContact = '',
      address = '',
      notes = ''
    } = req.body;

    if (!name || !email || !phone || !licenseNumber || !licenseExpiry) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, license number, and license expiry are required'
      });
    }

    const licenseUpper = licenseNumber.trim().toUpperCase();
    const existing = await DataEngine.findOne('drivers', { licenseNumber: licenseUpper });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A driver with this license number already exists'
      });
    }

    const count = await DataEngine.countDocuments('drivers');
    const driverId = `DRV-${1000 + count + 1}`;

    const newDriver = await DataEngine.create('drivers', {
      driverId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      licenseNumber: licenseUpper,
      licenseExpiry: new Date(licenseExpiry),
      dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
      assignedVehicle: assignedVehicle || null,
      status,
      emergencyContact,
      address,
      notes
    });

    if (assignedVehicle) {
      await DataEngine.findByIdAndUpdate('vehicles', assignedVehicle, {
        assignedDriver: newDriver._id
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Driver profile created successfully',
      data: newDriver
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update driver
// @route PUT /api/drivers/:id
export const updateDriver = async (req, res, next) => {
  try {
    const existing = await DataEngine.findById('drivers', req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    const updateData = { ...req.body };
    if (updateData.licenseNumber) {
      updateData.licenseNumber = updateData.licenseNumber.trim().toUpperCase();
    }

    const updated = await DataEngine.findByIdAndUpdate('drivers', req.params.id, updateData);

    return res.status(200).json({
      success: true,
      message: 'Driver updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete driver
// @route DELETE /api/drivers/:id
export const deleteDriver = async (req, res, next) => {
  try {
    const driver = await DataEngine.findById('drivers', req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    if (driver.status === 'On Trip') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete driver currently assigned to an active trip'
      });
    }

    await DataEngine.findByIdAndDelete('drivers', req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Driver deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc Assign vehicle to driver
// @route PUT /api/drivers/:id/assign-vehicle
export const assignVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.body;
    const driver = await DataEngine.findById('drivers', req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    if (vehicleId) {
      const vehicle = await DataEngine.findById('vehicles', vehicleId);
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'Vehicle not found' });
      }
      await DataEngine.findByIdAndUpdate('vehicles', vehicleId, { assignedDriver: driver._id });
    }

    const updatedDriver = await DataEngine.findByIdAndUpdate('drivers', req.params.id, {
      assignedVehicle: vehicleId || null
    });

    return res.status(200).json({
      success: true,
      message: 'Vehicle assigned successfully',
      data: updatedDriver
    });
  } catch (error) {
    next(error);
  }
};
