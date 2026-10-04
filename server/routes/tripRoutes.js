import express from 'express';
import {
  getTrips,
  getTripById,
  createTrip,
  updateTrip,
  deleteTrip,
  startTrip,
  completeTrip,
  cancelTrip
} from '../controllers/tripController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.route('/')
  .get(protect, getTrips)
  .post(protect, authorize('admin', 'fleet_manager'), createTrip);

router.route('/:id')
  .get(protect, getTripById)
  .put(protect, authorize('admin', 'fleet_manager'), updateTrip)
  .delete(protect, authorize('admin', 'fleet_manager'), deleteTrip);

router.put('/:id/start', protect, startTrip);
router.put('/:id/complete', protect, completeTrip);
router.put('/:id/cancel', protect, authorize('admin', 'fleet_manager'), cancelTrip);

export default router;
