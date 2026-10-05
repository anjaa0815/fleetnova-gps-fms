import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Organization name is required'], trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    plan: { type: String, enum: ['trial', 'basic', 'pro', 'enterprise'], default: 'trial' },
    trialEndsAt: { type: Date, default: null },
    // end of the paid period (null = no expiry, e.g. enterprise / plans set by the platform owner)
    planExpiresAt: { type: Date, default: null },
    // invoices already turned into subscription time (keeps applying a paid invoice exactly-once)
    // bumped on every subscription change: the compare-and-set that keeps concurrent payments from overwriting each other
    subscriptionVersion: { type: Number, default: 0, select: false },
    appliedInvoiceIds: { type: [String], default: [], select: false },
    contactEmail: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    settings: {
      // 0 = speed alerts off
      speedLimitKmh: { type: Number, default: 0, min: 0, max: 300 },
      // External delivery (email / SMS) of alerts
      delivery: {
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        types: { type: [String], default: ['speeding', 'geofence_enter', 'geofence_exit'] },
        language: { type: String, enum: ['mn', 'en'], default: 'mn' }
      }
    },
    branding: {
      logoUrl: { type: String, default: '' },
      primaryColor: { type: String, default: '#2563eb' }
    }
  },
  { timestamps: true }
);

const Organization = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);
export default Organization;
