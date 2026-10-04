import { DataEngine } from '../models/dataEngine.js';

// @desc Get all vehicles with filtering, search, pagination
// @route GET /api/vehicles
export const getVehicles = async (req, res, next) => {
  try {
    const { search, status, fuelType, vehicleType, sort = 'createdAt', order = 'desc', page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status && status !== 'All') filter.status = status;
    if (fuelType && fuelType !== 'All') filter.fuelType = fuelType;
    if (vehicleType && vehicleType !== 'All') filter.vehicleType = vehicleType;

    let vehicles = await DataEngine.find('vehicles', filter, {
      populate: 'assignedDriver'
    });

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      vehicles = vehicles.filter(v =>
        (v.registrationNumber && v.registrationNumber.toLowerCase().includes(q)) ||
        (v.brand && v.brand.toLowerCase().includes(q)) ||
        (v.model && v.model.toLowerCase().includes(q)) ||
        (v.vehicleId && v.vehicleId.toLowerCase().includes(q))
      );
    }

    // Sort
    const sortField = sort;
    const sortDirection = order === 'asc' ? 1 : -1;
    vehicles.sort((a, b) => {
      if (a[sortField] < b[sortField]) return -1 * sortDirection;
      if (a[sortField] > b[sortField]) return 1 * sortDirection;
      return 0;
    });

    const totalRecords = vehicles.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = vehicles.slice(startIndex, startIndex + limitNum);

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

// @desc Get single vehicle with full related history
// @route GET /api/vehicles/:id
export const getVehicleById = async (req, res, next) => {
  try {
    const vehicle = await DataEngine.findById('vehicles', req.params.id, {
      populate: 'assignedDriver'
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const vehicleId = vehicle._id;

    // Fetch related records
    const allTrips = await DataEngine.find('trips');
    const vehicleTrips = allTrips.filter(t => (t.vehicle?._id || t.vehicle) === vehicleId);

    const allFuels = await DataEngine.find('fuels');
    const vehicleFuels = allFuels.filter(f => (f.vehicle?._id || f.vehicle) === vehicleId);

    const allMaint = await DataEngine.find('maintenances');
    const vehicleMaintenance = allMaint.filter(m => (m.vehicle?._id || m.vehicle) === vehicleId);

    const allExp = await DataEngine.find('expenses');
    const vehicleExpenses = allExp.filter(e => (e.vehicle?._id || e.vehicle) === vehicleId);

    // Compute warnings
    const warnings = [];
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (vehicle.insuranceExpiry) {
      const insDate = new Date(vehicle.insuranceExpiry);
      if (insDate < now) {
        warnings.push({ type: 'danger', message: 'Insurance has expired! Immediate renewal required.' });
      } else if (insDate <= thirtyDaysFromNow) {
        const daysLeft = Math.ceil((insDate - now) / (1000 * 60 * 60 * 24));
        warnings.push({ type: 'warning', message: `Insurance expires in ${daysLeft} days.` });
      }
    }

    if (vehicle.registrationExpiry) {
      const regDate = new Date(vehicle.registrationExpiry);
      if (regDate < now) {
        warnings.push({ type: 'danger', message: 'Registration certificate has expired!' });
      } else if (regDate <= thirtyDaysFromNow) {
        const daysLeft = Math.ceil((regDate - now) / (1000 * 60 * 60 * 24));
        warnings.push({ type: 'warning', message: `Registration expires in ${daysLeft} days.` });
      }
    }

    if (vehicle.nextServiceDate) {
      const srvDate = new Date(vehicle.nextServiceDate);
      if (srvDate < now && vehicle.status !== 'Maintenance') {
        warnings.push({ type: 'warning', message: 'Maintenance service is overdue.' });
      }
    }

    // Analytics calculation
    const totalDistance = vehicleTrips.reduce((acc, t) => acc + (t.distance || 0), 0);
    const totalFuelUsed = vehicleFuels.reduce((acc, f) => acc + (f.quantity || 0), 0);
    const totalFuelCost = vehicleFuels.reduce((acc, f) => acc + (f.totalCost || 0), 0);
    const totalMaintenanceCost = vehicleMaintenance.reduce((acc, m) => acc + (m.cost || 0), 0);
    const totalExpenses = vehicleExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        ...vehicle,
        trips: vehicleTrips,
        fuels: vehicleFuels,
        maintenance: vehicleMaintenance,
        expenses: vehicleExpenses,
        warnings,
        analytics: {
          totalTrips: vehicleTrips.length,
          totalDistance,
          totalFuelUsed,
          totalFuelCost,
          totalMaintenanceCost,
          totalExpenses
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create new vehicle
// @route POST /api/vehicles
export const createVehicle = async (req, res, next) => {
  try {
    const {
      registrationNumber,
      vehicleType,
      brand,
      model,
      manufacturingYear,
      fuelType,
      fuelCapacity,
      currentMileage = 0,
      status = 'Available',
      assignedDriver = null,
      purchaseDate,
      insuranceExpiry,
      registrationExpiry,
      lastServiceDate,
      nextServiceDate,
      notes = ''
    } = req.body;

    if (!registrationNumber || !brand || !model || !vehicleType || !fuelType) {
      return res.status(400).json({
        success: false,
        message: 'Registration number, vehicle type, brand, model, and fuel type are required'
      });
    }

    const regUpper = registrationNumber.trim().toUpperCase();
    const existing = await DataEngine.findOne('vehicles', { registrationNumber: regUpper });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A vehicle with this registration number already exists'
      });
    }

    const count = await DataEngine.countDocuments('vehicles');
    const vehicleId = `VEH-${1000 + count + 1}`;

    const newVehicle = await DataEngine.create('vehicles', {
      vehicleId,
      registrationNumber: regUpper,
      vehicleType,
      brand: brand.trim(),
      model: model.trim(),
      manufacturingYear: Number(manufacturingYear) || new Date().getFullYear(),
      fuelType,
      fuelCapacity: Number(fuelCapacity) || 60,
      currentMileage: Number(currentMileage) || 0,
      status,
      assignedDriver: assignedDriver || null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      registrationExpiry: registrationExpiry ? new Date(registrationExpiry) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : null,
      nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : null,
      notes
    });

    // If driver assigned, update driver's assignedVehicle
    if (assignedDriver) {
      await DataEngine.findByIdAndUpdate('drivers', assignedDriver, {
        assignedVehicle: newVehicle._id
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Vehicle registered successfully',
      data: newVehicle
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update vehicle
// @route PUT /api/vehicles/:id
export const updateVehicle = async (req, res, next) => {
  try {
    const existing = await DataEngine.findById('vehicles', req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const updateData = { ...req.body };
    if (updateData.registrationNumber) {
      updateData.registrationNumber = updateData.registrationNumber.trim().toUpperCase();
    }

    const updated = await DataEngine.findByIdAndUpdate('vehicles', req.params.id, updateData);

    if (updateData.assignedDriver && updateData.assignedDriver !== existing.assignedDriver?._id) {
      await DataEngine.findByIdAndUpdate('drivers', updateData.assignedDriver, {
        assignedVehicle: updated._id
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Vehicle updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc Delete vehicle
// @route DELETE /api/vehicles/:id
export const deleteVehicle = async (req, res, next) => {
  try {
    const vehicle = await DataEngine.findById('vehicles', req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    if (vehicle.status === 'On Trip') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a vehicle that is currently on an active trip'
      });
    }

    await DataEngine.findByIdAndDelete('vehicles', req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Vehicle deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
