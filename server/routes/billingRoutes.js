import express from 'express';
import {
  getBilling,
  createInvoiceRequest,
  getInvoice,
  cancelInvoice,
  simulatePay,
  qpayCallback
} from '../controllers/billingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const callbackLimiter = rateLimit({ name: 'qpay_callback', windowMs: 60 * 1000, max: 120 });
const invoiceLimiter = rateLimit({
  name: 'billing_invoice', windowMs: 60 * 60 * 1000, max: 30,
  key: (req) => String(req.user?.orgId || req.ip),
  message: 'Too many payment requests. Please try again later.'
});

// Called by QPay (no login); protected by the token in the address and by checking the payment with QPay
router.route('/qpay/callback/:id/:token').get(callbackLimiter, qpayCallback).post(callbackLimiter, qpayCallback);

// Organization administrators only
router.use(protect, authorize('admin'));
router.get('/', getBilling);
router.post('/invoices', invoiceLimiter, createInvoiceRequest);
router.get('/invoices/:id', getInvoice);
router.post('/invoices/:id/cancel', cancelInvoice);
router.post('/invoices/:id/simulate-pay', simulatePay);

export default router;
