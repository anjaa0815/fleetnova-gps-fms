import express from 'express';
import { getPublicOrganization } from '../controllers/organizationController.js';
import { publicLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.get('/organizations/:slug', publicLimiter, getPublicOrganization);

export default router;
