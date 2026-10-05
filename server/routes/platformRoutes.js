import express from 'express';
import {
  listOrganizations,
  createOrganization,
  updateOrganization
} from '../controllers/organizationController.js';
import { listAllInvoices } from '../controllers/billingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Platform owner (super admin) only
router.use(protect, authorize('super_admin'));

router.route('/organizations').get(listOrganizations).post(createOrganization);
router.put('/organizations/:id', updateOrganization);
router.get('/invoices', listAllInvoices);

export default router;
