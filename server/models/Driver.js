import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    driverId: {
      type: String,
      required: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Driver name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
      uppercase: true,
      trim: true
    },
    licenseExpiry: {
      type: Date,
      required: true
    },
    dateOfJoining: {
      type: Date,
      default: Date.now
    },
    assignedVehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      default: null
    },
    status: {
      type: String,
      enum: ['Available', 'On Trip', 'Inactive'],
      default: 'Available'
    },
    emergencyContact: {
      type: String,
      default: ''
    },
    address: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Identifiers are unique per organization, not globally
driverSchema.index({ orgId: 1, driverId: 1 }, { unique: true });
driverSchema.index({ orgId: 1, licenseNumber: 1 }, { unique: true });

const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
export default Driver;
