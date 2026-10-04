import express from 'express';
import {
  registerUser,
  verifyEmail,
  resendVerification,
  loginUser,
  getMe,
  updateProfile,
  forgotPassword,
  getAllUsers,
  createOrgUser,
  updateAlertChannels,
  updateUserStatus
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import {
  registerLimiter,
  loginAccountLimiter,
  loginIpLimiter,
  passwordResetLimiter,
  verifyIpLimiter,
  resendIpLimiter,
  resendEmailLimiter
} from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/register', registerLimiter, registerUser);
router.post('/login', loginIpLimiter, loginAccountLimiter, loginUser);
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/verify-email', verifyIpLimiter, verifyEmail);
router.post('/resend-verification', resendIpLimiter, resendEmailLimiter, resendVerification);

router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

// Admin-only management
router.get('/users', protect, authorize('admin'), getAllUsers);
router.post('/users', protect, authorize('admin'), createOrgUser);
router.put('/users/:id/alert-channels', protect, authorize('admin'), updateAlertChannels);
router.put('/users/:id/status', protect, authorize('admin'), updateUserStatus);

export default router;
