import express from 'express';
import {
  getFuelRecords,
  createFuelRecord,
  updateFuelRecord,
  deleteFuelRecord
} from '../controllers/fuelController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getFuelRecords)
  .post(protect, authorize('admin', 'fleet_manager'), createFuelRecord);

router.route('/:id')
  .put(protect, authorize('admin', 'fleet_manager'), updateFuelRecord)
  .delete(protect, authorize('admin', 'fleet_manager'), deleteFuelRecord);

export default router;
