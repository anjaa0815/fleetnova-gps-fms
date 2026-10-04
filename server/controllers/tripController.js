import { DataEngine } from '../models/dataEngine.js';

// @desc Get all trips with filtering, search, pagination
// @route GET /api/trips
export const getTrips = async (req, res, next) => {
  try {
    const { search, status, vehicle, driver, sort = 'createdAt', order = 'desc', page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status && status !== 'All') filter.status = status;

    let trips = await DataEngine.find('trips', filter, {
      populate: ['vehicle', 'driver']
    });

    // If logged in as driver, only see own trips
    if (req.user && req.user.role === 'driver') {
      const allDrivers = await DataEngine.find('drivers');
      const driverProfile = allDrivers.find(d => d.email === req.user.email);
      if (driverProfile) {
        trips = trips.filter(t => (t.driver?._id || t.driver) === driverProfile._id);
      }
    }

    if (vehicle && vehicle !== 'All') {
      trips = trips.filter(t => (t.vehicle?._id || t.vehicle) === vehicle);
    }

    if (driver && driver !== 'All') {
      trips = trips.filter(t => (t.driver?._id || t.driver) === driver);
    }

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      trips = trips.filter(t =>
        (t.tripId && t.tripId.toLowerCase().includes(q)) ||
        (t.source && t.source.toLowerCase().includes(q)) ||
        (t.destination && t.destination.toLowerCase().includes(q)) ||
        (t.vehicle?.registrationNumber && t.vehicle.registrationNumber.toLowerCase().includes(q)) ||
        (t.driver?.name && t.driver.name.toLowerCase().includes(q))
      );
    }

    const sortField = sort;
    const sortDirection = order === 'asc' ? 1 : -1;
    trips.sort((a, b) => {
      if (a[sortField] < b[sortField]) return -1 * sortDirection;
      if (a[sortField] > b[sortField]) return 1 * sortDirection;
      return 0;
    });

    const totalRecords = trips.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = trips.slice(startIndex, startIndex + limitNum);

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

// @desc Get single trip
// @route GET /api/trips/:id
export const getTripById = async (req, res, next) => {
  try {
    const trip = await DataEngine.findById('trips', req.params.id, {
      populate: ['vehicle', 'driver']
    });

    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    return res.status(200).json({ success: true, data: trip });
  } catch (error) {
    next(error);
  }
};

// @desc Create new trip with strict business validation
// @route POST /api/trips
export const createTrip = async (req, res, next) => {
  try {
    const {
      vehicleId,
      driverId,
      source,
      destination,
      startDate,
      expectedEndDate,
      distance,
      purpose = 'Cargo Delivery',
      tripExpense = 0,
      notes = ''
    } = req.body;

    if (!vehicleId || !driverId || !source || !destination || !startDate || !expectedEndDate || distance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle, driver, source, destination, start date, expected end date and distance are required'
      });
    }

    // Verify Vehicle Business Rules
    const vehicle = await DataEngine.findById('vehicles', vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    if (vehicle.status === 'Maintenance') {
      return res.status(400).json({
        success: false,
        message: `Vehicle ${vehicle.registrationNumber} is currently under Maintenance and cannot be assigned to a trip.`
      });
    }

    if (vehicle.status === 'On Trip') {
      return res.status(400).json({
        success: false,
        message: `Vehicle ${vehicle.registrationNumber} is currently on another active trip.`
      });
    }

    if (vehicle.status === 'Inactive') {
      return res.status(400).json({
        success: false,
        message: `Vehicle ${vehicle.registrationNumber} is inactive and cannot be scheduled.`
      });
    }

    // Verify Driver Business Rules
    const driver = await DataEngine.findById('drivers', driverId);
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Driver not found' });
    }

    if (driver.status === 'Inactive') {
      return res.status(400).json({
        success: false,
        message: `Driver ${driver.name} is marked as Inactive and cannot be assigned.`
      });
    }

    // Check if driver is already on an active trip
    const allTrips = await DataEngine.find('trips');
    const driverActiveTrip = allTrips.find(
      t => (t.driver?._id || t.driver) === driverId && (t.status === 'In Progress' || t.status === 'Scheduled')
    );

    if (driver.status === 'On Trip' || driverActiveTrip) {
      return res.status(400).json({
        success: false,
        message: `Driver ${driver.name} is already assigned to active trip ${driverActiveTrip?.tripId || ''}.`
      });
    }

    const count = await DataEngine.countDocuments('trips');
    const tripId = `TRIP-${1000 + count + 1}`;

    const newTrip = await DataEngine.create('trips', {
      tripId,
      vehicle: vehicle._id,
      driver: driver._id,
      source: source.trim(),
      destination: destination.trim(),
      startDate: new Date(startDate),
      expectedEndDate: new Date(expectedEndDate),
      distance: Number(distance) || 0,
      purpose: purpose.trim(),
      fuelUsed: 0,
      tripExpense: Number(tripExpense) || 0,
      status: 'Scheduled',
      notes
    });

    // Create Notification
    await DataEngine.create('notifications', {
      type: 'trip_assigned',
      title: 'New Trip Scheduled',
      message: `Trip ${tripId} scheduled: ${vehicle.registrationNumber} assigned to ${driver.name} (${source} -> ${destination})`,
      relatedEntity: 'Trip',
      relatedEntityId: newTrip._id
    });

    return res.status(201).json({
      success: true,
      message: 'Trip scheduled successfully',
      data: newTrip
    });
  } catch (error) {
    next(error);
  }
};

// @desc Start trip (Transitions vehicle and driver to ON TRIP)
// @route PUT /api/trips/:id/start
export const startTrip = async (req, res, next) => {
  try {
    const trip = await DataEngine.findById('trips', req.params.id);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    if (trip.status === 'Completed' || trip.status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot start a trip that is already ${trip.status}`
      });
    }

    const updatedTrip = await DataEngine.findByIdAndUpdate('trips', req.params.id, {
      status: 'In Progress'
    });

    // Transition Vehicle to On Trip
    const vehicleId = trip.vehicle?._id || trip.vehicle;
    if (vehicleId) {
      await DataEngine.findByIdAndUpdate('vehicles', vehicleId, { status: 'On Trip' });
    }

    // Transition Driver to On Trip
    const driverId = trip.driver?._id || trip.driver;
    if (driverId) {
      await DataEngine.findByIdAndUpdate('drivers', driverId, { status: 'On Trip' });
    }

    // Create Notification
    await DataEngine.create('notifications', {
      type: 'trip_started',
      title: 'Trip Commenced',
      message: `Trip ${trip.tripId} has departed for ${trip.destination}`,
      relatedEntity: 'Trip',
      relatedEntityId: trip._id
    });

    return res.status(200).json({
      success: true,
      message: 'Trip is now In Progress',
      data: updatedTrip
    });
  } catch (error) {
    next(error);
  }
};

// @desc Complete trip (Transitions vehicle and driver to AVAILABLE)
// @route PUT /api/trips/:id/complete
export const completeTrip = async (req, res, next) => {
  try {
    const { actualEndDate = new Date(), fuelUsed = 0, tripExpense = 0 } = req.body;
    const trip = await DataEngine.findById('trips', req.params.id);

    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const updatedTrip = await DataEngine.findByIdAndUpdate('trips', req.params.id, {
      status: 'Completed',
      actualEndDate: new Date(actualEndDate),
      fuelUsed: Number(fuelUsed) || trip.fuelUsed || 0,
      tripExpense: Number(tripExpense) || trip.tripExpense || 0
    });

    // Return Vehicle to Available & update mileage
    const vehicleId = trip.vehicle?._id || trip.vehicle;
    if (vehicleId) {
      const v = await DataEngine.findById('vehicles', vehicleId);
      const newMileage = (v?.currentMileage || 0) + (trip.distance || 0);
      await DataEngine.findByIdAndUpdate('vehicles', vehicleId, {
        status: 'Available',
        currentMileage: newMileage
      });
    }

    // Return Driver to Available
    const driverId = trip.driver?._id || trip.driver;
    if (driverId) {
      await DataEngine.findByIdAndUpdate('drivers', driverId, { status: 'Available' });
    }

    // Create Notification
    await DataEngine.create('notifications', {
      type: 'trip_completed',
      title: 'Trip Completed',
      message: `Trip ${trip.tripId} arrived successfully at ${trip.destination} (${trip.distance} km).`,
      relatedEntity: 'Trip',
      relatedEntityId: trip._id
    });

    return res.status(200).json({
      success: true,
      message: 'Trip completed successfully',
      data: updatedTrip
    });
  } catch (error) {
    next(error);
  }
};

// @desc Cancel trip (Frees up vehicle and driver)
// @route PUT /api/trips/:id/cancel
export const cancelTrip = async (req, res, next) => {
  try {
    const trip = await DataEngine.findById('trips', req.params.id);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    const updatedTrip = await DataEngine.findByIdAndUpdate('trips', req.params.id, {
      status: 'Cancelled'
    });

    // Free vehicle and driver
    const vehicleId = trip.vehicle?._id || trip.vehicle;
    if (vehicleId) {
      await DataEngine.findByIdAndUpdate('vehicles', vehicleId, { status: 'Available' });
    }

    const driverId = trip.driver?._id || trip.driver;
    if (driverId) {
      await DataEngine.findByIdAndUpdate('drivers', driverId, { status: 'Available' });
    }

    return res.status(200).json({
      success: true,
      message: 'Trip cancelled',
      data: updatedTrip
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update trip
// @route PUT /api/trips/:id
export const updateTrip = async (req, res, next) => {
  try {
    const updated = await DataEngine.findByIdAndUpdate('trips', req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc Delete trip
// @route DELETE /api/trips/:id
export const deleteTrip = async (req, res, next) => {
  try {
    const trip = await DataEngine.findById('trips', req.params.id);
    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found' });
    }

    if (trip.status === 'In Progress') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete an active In Progress trip'
      });
    }

    await DataEngine.findByIdAndDelete('trips', req.params.id);
    return res.status(200).json({ success: true, message: 'Trip deleted successfully' });
  } catch (error) {
    next(error);
  }
};
