import mongoose from 'mongoose';

// A request to pay for a subscription period (paid through QPay)
const invoiceSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    // the organization's name when the invoice was made (the invoice outlives the organization)
    orgName: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    plan: { type: String, enum: ['basic', 'pro', 'gps'], required: true },
    // GPS devices the invoice pays for (per-GPS plan)
    devices: { type: Number, default: 0 },
    months: { type: Number, required: true },
    amount: { type: Number, required: true }, // MNT
    description: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'paid', 'expired', 'cancelled'], default: 'pending', index: true },
    // the paid invoice has been turned into subscription time (a worker repeats this if a crash interrupted it)
    applied: { type: Boolean, default: false },
    // the number we send to QPay as sender_invoice_no (unique) and the unguessable part of the callback address
    senderInvoiceNo: { type: String, required: true, unique: true },
    callbackToken: { type: String, required: true },
    provider: { type: String, enum: ['qpay', 'simulated'], default: 'qpay' },
    qpayInvoiceId: { type: String, default: '' },
    qrText: { type: String, default: '' },
    qrImage: { type: String, default: '' }, // base64 PNG from QPay
    shortUrl: { type: String, default: '' },
    urls: { type: [mongoose.Schema.Types.Mixed], default: [] }, // bank app deep links
    paymentId: { type: String, default: '' },
    paidAmount: { type: Number, default: 0 },
    paidAt: { type: Date, default: null },
    lastCheckedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

invoiceSchema.index({ orgId: 1, createdAt: -1 });

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
export default Invoice;
