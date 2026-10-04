import express from 'express';
import { chatWithFleetAI } from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/chat', protect, chatWithFleetAI);

export default router;
