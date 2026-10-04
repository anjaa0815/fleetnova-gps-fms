import express from 'express';
import {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle
} from '../controllers/vehicleController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getVehicles)
  .post(protect, authorize('admin', 'fleet_manager'), createVehicle);

router.route('/:id')
  .get(protect, getVehicleById)
  .put(protect, authorize('admin', 'fleet_manager'), updateVehicle)
  .delete(protect, authorize('admin', 'fleet_manager'), deleteVehicle);

export default router;
