import mongoose from 'mongoose';

// One outgoing email / SMS. Created when an alert is raised, sent (and retried) by the delivery worker.
const deliverySchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },
    type: { type: String, default: '' },
    channel: { type: String, enum: ['email', 'sms'], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    to: { type: String, required: true },
    subject: { type: String, default: '' },
    text: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed', 'skipped'], default: 'queued', index: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: '' },
    simulated: { type: Boolean, default: false },
    sentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

const Delivery = mongoose.models.Delivery || mongoose.model('Delivery', deliverySchema);
export default Delivery;
