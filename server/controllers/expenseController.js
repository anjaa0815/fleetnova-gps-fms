import { DataEngine } from '../models/dataEngine.js';

// @desc Get all expenses with filtering, search, pagination, and breakdowns
// @route GET /api/expenses
export const getExpenses = async (req, res, next) => {
  try {
    const { category, vehicle, driver, search, page = 1, limit = 10 } = req.query;

    let expenses = await DataEngine.find('expenses', {}, {
      populate: ['vehicle', 'driver', 'trip']
    });

    if (category && category !== 'All') {
      expenses = expenses.filter(e => e.category === category);
    }

    if (vehicle && vehicle !== 'All') {
      expenses = expenses.filter(e => (e.vehicle?._id || e.vehicle) === vehicle);
    }

    if (driver && driver !== 'All') {
      expenses = expenses.filter(e => (e.driver?._id || e.driver) === driver);
    }

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      expenses = expenses.filter(e =>
        (e.expenseId && e.expenseId.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q)) ||
        (e.vehicle?.registrationNumber && e.vehicle.registrationNumber.toLowerCase().includes(q)) ||
        (e.driver?.name && e.driver.name.toLowerCase().includes(q))
      );
    }

    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate totals & category breakdowns
    const totalAmount = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
    const categoryTotals = {};
    expenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + (e.amount || 0);
    });

    const totalRecords = expenses.length;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = expenses.slice(startIndex, startIndex + limitNum);

    return res.status(200).json({
      success: true,
      data: paginated,
      summary: {
        totalAmount,
        categoryTotals,
        count: totalRecords
      },
      totalRecords,
      totalPages,
      currentPage: pageNum
    });
  } catch (error) {
    next(error);
  }
};

// @desc Create new expense
// @route POST /api/expenses
export const createExpense = async (req, res, next) => {
  try {
    const {
      vehicleId,
      category,
      amount,
      date = new Date(),
      description,
      driverId = null,
      tripId = null,
      paymentMethod = 'Company Card'
    } = req.body;

    if (!vehicleId || !category || amount === undefined || !description) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle, category, amount, and description are required'
      });
    }

    const vehicle = await DataEngine.findById('vehicles', vehicleId);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    const count = await DataEngine.countDocuments('expenses');
    const expenseId = `EXP-${1000 + count + 1}`;

    const newExpense = await DataEngine.create('expenses', {
      expenseId,
      vehicle: vehicle._id,
      category,
      amount: Number(amount),
      date: new Date(date),
      description: description.trim(),
      driver: driverId || vehicle.assignedDriver?._id || null,
      trip: tripId || null,
      paymentMethod
    });

    return res.status(201).json({
      success: true,
      message: 'Expense added successfully',
      data: newExpense
    });
  } catch (error) {
    next(error);
  }
};

// @desc Update expense
// @route PUT /api/expenses/:id
export const updateExpense = async (req, res, next) => {
  try {
    const updated = await DataEngine.findByIdAndUpdate('expenses', req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

// @desc Delete expense
// @route DELETE /api/expenses/:id
export const deleteExpense = async (req, res, next) => {
  try {
    const deleted = await DataEngine.findByIdAndDelete('expenses', req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    return res.status(200).json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    next(error);
  }
};
