import { DataEngine } from '../models/dataEngine.js';

// @desc Get comprehensive live dashboard data
// @route GET /api/dashboard
export const getDashboardData = async (req, res, next) => {
  try {
    const vehicles = await DataEngine.find('vehicles', {}, { populate: 'assignedDriver' });
    const drivers = await DataEngine.find('drivers');
    const trips = await DataEngine.find('trips', {}, { populate: ['vehicle', 'driver'] });
    const fuels = await DataEngine.find('fuels', {}, { populate: ['vehicle', 'driver'] });
    const maintenances = await DataEngine.find('maintenances', {}, { populate: 'vehicle' });
    const expenses = await DataEngine.find('expenses', {}, { populate: ['vehicle', 'driver'] });

    // Vehicle counts
    const totalVehicles = vehicles.length;
    const activeVehicles = vehicles.filter(v => v.status === 'On Trip').length;
    const availableVehicles = vehicles.filter(v => v.status === 'Available').length;
    const maintenanceVehicles = vehicles.filter(v => v.status === 'Maintenance').length;
    const inactiveVehicles = vehicles.filter(v => v.status === 'Inactive').length;

    // Driver counts
    const totalDrivers = drivers.length;
    const availableDrivers = drivers.filter(d => d.status === 'Available').length;
    const onTripDrivers = drivers.filter(d => d.status === 'On Trip').length;

    // Trip counts
    const activeTrips = trips.filter(t => t.status === 'In Progress').length;
    const scheduledTrips = trips.filter(t => t.status === 'Scheduled').length;
    const completedTrips = trips.filter(t => t.status === 'Completed').length;
    const cancelledTrips = trips.filter(t => t.status === 'Cancelled').length;

    // Financial totals
    const totalFuelCost = fuels.reduce((acc, f) => acc + (f.totalCost || 0), 0);
    const totalMaintenanceCost = maintenances.reduce((acc, m) => acc + (m.cost || 0), 0);
    const totalExpenses = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const totalFuelConsumed = fuels.reduce((acc, f) => acc + (f.quantity || 0), 0);

    // Vehicle Status Distribution
    const vehicleStatusBreakdown = [
      { status: 'Available', count: availableVehicles, percentage: totalVehicles ? Math.round((availableVehicles / totalVehicles) * 100) : 0, color: '#10b981' },
      { status: 'On Trip', count: activeVehicles, percentage: totalVehicles ? Math.round((activeVehicles / totalVehicles) * 100) : 0, color: '#3b82f6' },
      { status: 'Maintenance', count: maintenanceVehicles, percentage: totalVehicles ? Math.round((maintenanceVehicles / totalVehicles) * 100) : 0, color: '#f59e0b' },
      { status: 'Inactive', count: inactiveVehicles, percentage: totalVehicles ? Math.round((inactiveVehicles / totalVehicles) * 100) : 0, color: '#ef4444' }
    ];

    // Recent Trips (last 5)
    const recentTrips = [...trips]
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
      .slice(0, 6);

    // Upcoming / Overdue Maintenance
    const now = new Date();
    const upcomingMaintenance = maintenances
      .filter(m => m.status !== 'Completed')
      .map(m => {
        const isOverdue = m.nextServiceDate ? new Date(m.nextServiceDate) < now : false;
        const isDueSoon = m.nextServiceDate ? (new Date(m.nextServiceDate) >= now && new Date(m.nextServiceDate) <= new Date(now.getTime() + 15 * 86400000)) : false;
        return {
          ...m,
          isOverdue,
          isDueSoon
        };
      })
      .slice(0, 6);

    // Expense Categories Overview
    const expenseCategories = {
      Fuel: expenses.filter(e => e.category === 'Fuel').reduce((a, b) => a + (b.amount || 0), 0),
      Maintenance: expenses.filter(e => e.category === 'Maintenance' || e.category === 'Repair').reduce((a, b) => a + (b.amount || 0), 0),
      Trip: expenses.filter(e => e.category === 'Trip' || e.category === 'Toll').reduce((a, b) => a + (b.amount || 0), 0),
      Insurance: expenses.filter(e => e.category === 'Insurance').reduce((a, b) => a + (b.amount || 0), 0),
      Other: expenses.filter(e => e.category === 'Other').reduce((a, b) => a + (b.amount || 0), 0)
    };

    // Fuel Overview
    const vehicleFuelUsage = {};
    fuels.forEach(f => {
      const reg = f.vehicle?.registrationNumber || 'Unknown';
      vehicleFuelUsage[reg] = (vehicleFuelUsage[reg] || 0) + (f.quantity || 0);
    });

    let highestFuelVehicle = { registration: 'N/A', quantity: 0 };
    Object.entries(vehicleFuelUsage).forEach(([reg, qty]) => {
      if (qty > highestFuelVehicle.quantity) {
        highestFuelVehicle = { registration: reg, quantity: Math.round(qty) };
      }
    });

    const totalDistanceCompleted = trips
      .filter(t => t.status === 'Completed')
      .reduce((a, b) => a + (b.distance || 0), 0);

    const avgFuelEfficiency = totalFuelConsumed > 0 && totalDistanceCompleted > 0
      ? Math.round((totalDistanceCompleted / totalFuelConsumed) * 10) / 10
      : 11.8;

    // Monthly Aggregates for Charts (Last 6 Months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIndex = now.getMonth();
    const monthlyData = [];

    for (let i = 5; i >= 0; i--) {
      const monthIdx = (currentMonthIndex - i + 12) % 12;
      const monthName = monthNames[monthIdx];

      // Filter expenses for this month
      const monthFuelExpenses = fuels
        .filter(f => new Date(f.date).getMonth() === monthIdx)
        .reduce((a, b) => a + (b.totalCost || 0), 0);

      const monthMaintExpenses = maintenances
        .filter(m => new Date(m.serviceDate).getMonth() === monthIdx)
        .reduce((a, b) => a + (b.cost || 0), 0);

      const monthTotalExpenses = expenses
        .filter(e => new Date(e.date).getMonth() === monthIdx)
        .reduce((a, b) => a + (b.amount || 0), 0);

      monthlyData.push({
        month: monthName,
        fuelExpense: Math.round(monthFuelExpenses),
        maintenanceExpense: Math.round(monthMaintExpenses),
        totalExpense: Math.round(monthTotalExpenses)
      });
    }

    // Top Fuel Consuming Vehicles Chart Data
    const fuelByVehicleData = Object.entries(vehicleFuelUsage)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    return res.status(200).json({
      success: true,
      data: {
        cards: {
          totalVehicles,
          activeVehicles,
          availableVehicles,
          maintenanceVehicles,
          totalDrivers,
          availableDrivers,
          activeTrips,
          scheduledTrips,
          completedTrips,
          cancelledTrips,
          totalFuelCost: Math.round(totalFuelCost),
          totalMaintenanceCost: Math.round(totalMaintenanceCost),
          totalExpenses: Math.round(totalExpenses),
          totalFuelConsumed: Math.round(totalFuelConsumed),
          avgFuelEfficiency
        },
        vehicleStatusBreakdown,
        recentTrips,
        upcomingMaintenance,
        expenseCategories,
        fuelOverview: {
          totalConsumed: Math.round(totalFuelConsumed),
          totalCost: Math.round(totalFuelCost),
          avgEfficiency: avgFuelEfficiency,
          highestFuelVehicle
        },
        charts: {
          monthlyData,
          fuelByVehicleData,
          tripStatusDistribution: [
            { name: 'Completed', value: completedTrips, color: '#10b981' },
            { name: 'In Progress', value: activeTrips, color: '#3b82f6' },
            { name: 'Scheduled', value: scheduledTrips, color: '#f59e0b' },
            { name: 'Cancelled', value: cancelledTrips, color: '#ef4444' }
          ],
          expenseCategoryDistribution: Object.entries(expenseCategories).map(([name, value]) => ({
            name,
            value: Math.round(value)
          }))
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
