import express from 'express';
import {
  getDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  getConnectionInfo
} from '../controllers/deviceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin', 'fleet_manager'));

router.get('/connection-info', getConnectionInfo);
router.route('/').get(getDevices).post(createDevice);
router.route('/:id').put(updateDevice).delete(deleteDevice);

export default router;
