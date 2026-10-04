import express from 'express';
import { getLivePositions, getHistory } from '../controllers/trackingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'fleet_manager'));

router.get('/live', getLivePositions);
router.get('/history', getHistory);

export default router;
