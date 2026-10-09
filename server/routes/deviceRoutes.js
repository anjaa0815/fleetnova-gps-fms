import express from 'express';
import {
  getDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  getConnectionInfo
} from '../controllers/deviceController.js';
import { sendCommand, listCommands, cancelPendingCommand } from '../controllers/deviceCommandController.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { serializeCreates } from '../middleware/serializeCreates.js';

const router = express.Router();

router.use(protect, authorize('admin', 'fleet_manager'));

router.get('/connection-info', getConnectionInfo);
router.route('/').get(getDevices).post(serializeCreates('devices'), createDevice);
router.route('/:id').put(updateDevice).delete(deleteDevice);

// Commands to a tracker. The role rules per command type are enforced in the service (engine commands: admin only).
const commandLimiter = rateLimit({
  name: 'device_command', windowMs: 60 * 1000, max: 30,
  key: (req) => String(req.user?.orgId || req.ip),
  message: 'Too many commands. Please wait a moment.'
});
router.route('/:id/commands').get(listCommands).post(commandLimiter, sendCommand);
router.post('/:id/commands/:commandId/cancel', cancelPendingCommand);

export default router;
