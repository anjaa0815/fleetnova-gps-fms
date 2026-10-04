import express from 'express';
import { getMyOrganization, updateMyOrganization } from '../controllers/organizationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.get('/', protect, getMyOrganization);
router.put('/', protect, authorize('admin'), updateMyOrganization);

export default router;
