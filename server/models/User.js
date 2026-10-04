import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 6,
      select: false
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'fleet_manager', 'driver'],
      default: 'fleet_manager'
    },
    phone: {
      type: String,
      default: ''
    },
    // Self-service sign-ups confirm their email address; everyone else (invited users, legacy accounts) counts as verified
    emailVerified: { type: Boolean, default: true },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpires: { type: Date, default: null, select: false },
    emailVerificationSentAt: { type: Date, default: null, select: false },
    language: { type: String, enum: ['mn', 'en'], default: 'mn' },
    // Which external channels this user receives alerts on (also requires the organization to enable them)
    alertChannels: {
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false }
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

// Passwords are hashed by the controllers before they reach the model, so there is no pre-save hook
// (a second hash here would make every login fail).
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
