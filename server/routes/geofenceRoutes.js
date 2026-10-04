import express from 'express';
import {
  getGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence
} from '../controllers/geofenceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'fleet_manager'));

router.route('/').get(getGeofences).post(createGeofence);
router.route('/:id').put(updateGeofence).delete(deleteGeofence);

export default router;
