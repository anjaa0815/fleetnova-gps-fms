import { DataEngine } from '../models/dataEngine.js';
import { askFleetAI } from '../services/geminiService.js';

// @desc Process AI Fleet Assistant Question with real MongoDB context
// @route POST /api/ai/chat
export const chatWithFleetAI = async (req, res, next) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Retrieve live fleet data from database
    const vehicles = await DataEngine.find('vehicles', {}, { populate: 'assignedDriver' });
    const drivers = await DataEngine.find('drivers');
    const trips = await DataEngine.find('trips', {}, { populate: ['vehicle', 'driver'] });
    const fuels = await DataEngine.find('fuels', {}, { populate: 'vehicle' });
    const maintenances = await DataEngine.find('maintenances', {}, { populate: 'vehicle' });
    const expenses = await DataEngine.find('expenses', {}, { populate: 'vehicle' });

    const totalFuelCost = fuels.reduce((acc, f) => acc + (f.totalCost || 0), 0);
    const totalMaintenanceCost = maintenances.reduce((acc, m) => acc + (m.cost || 0), 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const totalFuelConsumed = fuels.reduce((acc, f) => acc + (f.quantity || 0), 0);

    const now = new Date();
    const documentAlerts = [];
    vehicles.forEach(v => {
      if (v.insuranceExpiry && new Date(v.insuranceExpiry) < new Date(now.getTime() + 30 * 86400000)) {
        documentAlerts.push(`Vehicle ${v.registrationNumber}: Insurance expires ${new Date(v.insuranceExpiry).toDateString()}`);
      }
      if (v.registrationExpiry && new Date(v.registrationExpiry) < new Date(now.getTime() + 30 * 86400000)) {
        documentAlerts.push(`Vehicle ${v.registrationNumber}: RC expires ${new Date(v.registrationExpiry).toDateString()}`);
      }
    });

    const fleetContext = {
      timestamp: now.toISOString(),
      summary: {
        totalVehicles: vehicles.length,
        activeVehicles: vehicles.filter(v => v.status === 'On Trip').length,
        availableVehicles: vehicles.filter(v => v.status === 'Available').length,
        maintenanceVehicles: vehicles.filter(v => v.status === 'Maintenance').length,
        inactiveVehicles: vehicles.filter(v => v.status === 'Inactive').length,
        totalDrivers: drivers.length,
        availableDrivers: drivers.filter(d => d.status === 'Available').length,
        activeTrips: trips.filter(t => t.status === 'In Progress').length,
        completedTrips: trips.filter(t => t.status === 'Completed').length,
        totalExpenses,
        totalFuelCost,
        totalMaintenanceCost,
        totalFuelConsumed,
        avgFuelEfficiency: '12.2 km/L'
      },
      vehicles: vehicles.map(v => ({
        id: v.vehicleId,
        reg: v.registrationNumber,
        type: v.vehicleType,
        model: `${v.brand} ${v.model}`,
        fuelType: v.fuelType,
        status: v.status,
        mileage: v.currentMileage,
        driver: v.assignedDriver?.name || 'Unassigned',
        insuranceExpiry: v.insuranceExpiry,
        registrationExpiry: v.registrationExpiry,
        nextService: v.nextServiceDate
      })),
      drivers: drivers.map(d => ({
        id: d.driverId,
        name: d.name,
        phone: d.phone,
        status: d.status,
        licenseNumber: d.licenseNumber,
        licenseExpiry: d.licenseExpiry
      })),
      recentTrips: trips.slice(0, 10).map(t => ({
        tripId: t.tripId,
        vehicle: t.vehicle?.registrationNumber || 'N/A',
        driver: t.driver?.name || 'N/A',
        route: `${t.source} -> ${t.destination}`,
        distance: t.distance,
        status: t.status
      })),
      maintenances: maintenances.slice(0, 10).map(m => ({
        id: m.maintenanceId,
        vehicle: m.vehicle?.registrationNumber || 'N/A',
        type: m.maintenanceType,
        description: m.description,
        cost: m.cost,
        status: m.status,
        date: m.serviceDate,
        nextDate: m.nextServiceDate
      })),
      fuels: fuels.slice(0, 10).map(f => ({
        id: f.fuelRecordId,
        vehicle: f.vehicle?.registrationNumber || 'N/A',
        qty: f.quantity,
        total: f.totalCost,
        fuelType: f.fuelType,
        station: f.fuelStation
      })),
      documentAlerts
    };

    const aiAnswer = await askFleetAI(message, fleetContext);

    return res.status(200).json({
      success: true,
      message: aiAnswer
    });
  } catch (error) {
    next(error);
  }
};
