import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    driverId: {
      type: String,
      required: true,
      unique: true,
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
      unique: true,
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

const Driver = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
export default Driver;
