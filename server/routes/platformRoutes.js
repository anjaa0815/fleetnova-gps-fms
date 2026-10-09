import express from 'express';
import {
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization
} from '../controllers/organizationController.js';
import { listAdmins, createAdmin, updateAdmin } from '../controllers/platformAdminController.js';
import { listOrgUsers, createUserInOrg, updateOrgUser, listAuditLog } from '../controllers/platformUserController.js';
import { listAllInvoices } from '../controllers/billingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { serializeCreates } from '../middleware/serializeCreates.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Platform owner (super admin) only
router.use(protect, authorize('super_admin'));

router.route('/organizations').get(listOrganizations).post(createOrganization);
router.route('/organizations/:id').put(updateOrganization).delete(deleteOrganization);
router.route('/organizations/:id/users').get(listOrgUsers).post(serializeCreates('users', (req) => req.params.id), createUserInOrg);
router.put('/organizations/:id/users/:userId', updateOrgUser);
router.get('/invoices', listAllInvoices);
router.route('/admins').get(listAdmins).post(createAdmin);
router.put('/admins/:id', updateAdmin);
router.get('/audit', listAuditLog);

export default router;
