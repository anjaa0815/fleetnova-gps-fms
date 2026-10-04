import express from 'express';
import {
  getDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  assignVehicle
} from '../controllers/driverController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getDrivers)
  .post(protect, authorize('admin', 'fleet_manager'), createDriver);

router.route('/:id')
  .get(protect, getDriverById)
  .put(protect, authorize('admin', 'fleet_manager'), updateDriver)
  .delete(protect, authorize('admin', 'fleet_manager'), deleteDriver);

router.put('/:id/assign-vehicle', protect, authorize('admin', 'fleet_manager'), assignVehicle);

export default router;
