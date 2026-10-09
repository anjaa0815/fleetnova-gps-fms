import express from 'express';
import {
  listOrganizations,
  createOrganization,
  updateOrganization
} from '../controllers/organizationController.js';
import { listOrgUsers, createUserInOrg, updateOrgUser, listAuditLog } from '../controllers/platformUserController.js';
import { listAllInvoices } from '../controllers/billingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { serializeCreates } from '../middleware/serializeCreates.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Platform owner (super admin) only
router.use(protect, authorize('super_admin'));

router.route('/organizations').get(listOrganizations).post(createOrganization);
router.put('/organizations/:id', updateOrganization);
router.route('/organizations/:id/users').get(listOrgUsers).post(serializeCreates('users', (req) => req.params.id), createUserInOrg);
router.put('/organizations/:id/users/:userId', updateOrgUser);
router.get('/invoices', listAllInvoices);
router.get('/audit', listAuditLog);

export default router;
