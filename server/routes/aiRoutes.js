import express from 'express';
import { chatWithFleetAI } from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.post('/chat', protect, authorize('admin', 'fleet_manager'), chatWithFleetAI);

export default router;
