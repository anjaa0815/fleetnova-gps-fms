import express from 'express';
import { getGpsReport, exportGpsReport } from '../controllers/gpsReportController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'fleet_manager'));

router.get('/gps', getGpsReport);
router.get('/gps.csv', exportGpsReport);

export default router;
