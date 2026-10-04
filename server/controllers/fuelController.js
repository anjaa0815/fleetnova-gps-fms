import { DataEngine } from '../models/dataEngine.js';

// @desc Get all fuel records with filter & pagination
// @route GET /api/fuel
export const getFuelRecords = async (req, res, next) => {
  try {
    const { vehicle, fuelType, search, page = 1, limit = 10 } = req.query;

    let records = await DataEngine.find('fuels', {}, {
      populate: ['vehicle', 'driver']
    });

    if (vehicle && vehicle !== 'All') {
      records = records.filter(r => (r.vehicle?._id || r.vehicle) === vehicle);
    }

    if (fuelType && fuelType !== 'All') {
      records = records.filter(r => r.fuelType === fuelType);
    }

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      records = records.filter(r =>
        (r.fuelRecordId && r.fuelRecordId.toLowerCase().includes(q)) ||
        (r.vehicle?.registrationNumber && r.vehicle.registrationNumber.toLowerCase().includes(q)) ||
        (r.fuelStation && r.fuelStation.toLowerCase().includes(q)) ||
        (r.driver?.name && r.driver.name.toLowerCase().includes(q))
      );
    }

    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Summary calculations
    const totalConsumed = records.reduce((acc, r) => acc + (r.quantity || 0), 0);
    const totalCost = records.reduce((acc, r) => acc + (r.totalCost || 0), 0);
    const avgPricePerLiter = records.length > 0 ? (totalCost / (totalConsumed || 1)) : 0;

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
        totalConsumed: Math.round(totalConsumed * 10) / 10,
        totalCost: Math.round(totalCost),
        avgPricePerLiter: Math.round(avgPricePerLiter * 100) / 100,
        recordCount: totalRecords
      },
      totalRecords,
      totalPages,
      currentPage: pageNum
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create fuel log
// @route POST /api/fuel
export const createFuelRecord = async (req, res, next) => {
  try {
    const {
      vehicleId,
      date = new Date(),
      fuelType,
      quantity,
      pricePerLiter,
      odometerReading,
      fuelStation = 'Authorized Pump',
      driverId = null,
      notes = ''
    } = req.body;

    if (!vehicleId || !fuelType || !quantity || !pricePerLiter || odometerReading === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle, fuel type, quantity, price per liter and odometer reading are required'
      });
    }

    const vehicle = await DataEngine.findById('vehicles', vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const calculatedCost = Math.round(Number(quantity) * Number(pricePerLiter) * 100) / 100;
    const count = await DataEngine.countDocuments('fuels');
    const fuelRecordId = `FUEL-${1000 + count + 1}`;

    const newRecord = await DataEngine.create('fuels', {
      fuelRecordId,
      vehicle: vehicle._id,
      date: new Date(date),
      fuelType,
      quantity: Number(quantity),
      pricePerLiter: Number(pricePerLiter),
      totalCost: calculatedCost,
      odometerReading: Number(odometerReading),
      fuelStation,
      driver: driverId || vehicle.assignedDriver?._id || null,
      notes
    });

    // Update vehicle current mileage if higher
    if (Number(odometerReading) > (vehicle.currentMileage || 0)) {
      await DataEngine.findByIdAndUpdate('vehicles', vehicle._id, {
        currentMileage: Number(odometerReading)
      });
    }

    // Automatically sync as Expense under 'Fuel'
    const expCount = await DataEngine.countDocuments('expenses');
    await DataEngine.create('expenses', {
      expenseId: `EXP-${1000 + expCount + 1}`,
      vehicle: vehicle._id,
      category: 'Fuel',
      amount: calculatedCost,
      date: new Date(date),
      description: `Fuel refill ${quantity}L (${fuelType}) at ${fuelStation}`,
      driver: driverId || vehicle.assignedDriver?._id || null,
      paymentMethod: 'Fuel Card'
    });

    return res.status(201).json({
      success: true,
      message: 'Fuel log recorded successfully',
      data: newRecord
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update fuel log
// @route PUT /api/fuel/:id
export const updateFuelRecord = async (req, res, next) => {
  try {
    const updateData = { ...req.body };
    if (updateData.quantity && updateData.pricePerLiter) {
      updateData.totalCost = Math.round(Number(updateData.quantity) * Number(updateData.pricePerLiter) * 100) / 100;
    }

    const updated = await DataEngine.findByIdAndUpdate('fuels', req.params.id, updateData);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc Delete fuel log
// @route DELETE /api/fuel/:id
export const deleteFuelRecord = async (req, res, next) => {
  try {
    const deleted = await DataEngine.findByIdAndDelete('fuels', req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    return res.status(200).json({ success: true, message: 'Fuel record deleted successfully' });
  } catch (error) {
    next(error);
  }
};
