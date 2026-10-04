import express from 'express';
import {
  registerUser,
  loginUser,
  getMe,
  updateProfile,
  forgotPassword,
  getAllUsers,
  updateUserStatus
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgot-password', forgotPassword);

router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

// Admin-only management
router.get('/users', protect, authorize('admin'), getAllUsers);
router.put('/users/:id/status', protect, authorize('admin'), updateUserStatus);

export default router;
