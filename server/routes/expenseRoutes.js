import express from 'express';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense
} from '../controllers/expenseController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getExpenses)
  .post(protect, authorize('admin', 'fleet_manager'), createExpense);

router.route('/:id')
  .put(protect, authorize('admin', 'fleet_manager'), updateExpense)
  .delete(protect, authorize('admin', 'fleet_manager'), deleteExpense);

export default router;
