import express from 'express';
import {
  getMaintenanceRecords,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord
} from '../controllers/maintenanceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getMaintenanceRecords)
  .post(protect, authorize('admin', 'fleet_manager'), createMaintenanceRecord);

router.route('/:id')
  .put(protect, authorize('admin', 'fleet_manager'), updateMaintenanceRecord)
  .delete(protect, authorize('admin', 'fleet_manager'), deleteMaintenanceRecord);

export default router;
