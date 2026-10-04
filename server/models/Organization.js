import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Organization name is required'], trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    plan: { type: String, enum: ['trial', 'basic', 'pro', 'enterprise'], default: 'trial' },
    trialEndsAt: { type: Date, default: null },
    contactEmail: { type: String, default: '', trim: true },
    contactPhone: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    settings: {
      // 0 = speed alerts off
      speedLimitKmh: { type: Number, default: 0, min: 0, max: 300 }
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
