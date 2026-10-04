import express from 'express';
import { getDeliveryConfig, getDeliveryLog, sendTestMessage } from '../controllers/deliveryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin'));

router.get('/config', getDeliveryConfig);
router.get('/log', getDeliveryLog);
router.post('/test', sendTestMessage);

export default router;
