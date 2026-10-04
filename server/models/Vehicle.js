import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema(
  {
    vehicleId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    registrationNumber: {
      type: String,
      required: [true, 'Registration number is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    vehicleType: {
      type: String,
      required: true,
      enum: ['Truck', 'Van', 'Bus', 'Sedan', 'SUV', 'Pickup']
    },
    brand: {
      type: String,
      required: true,
      trim: true
    },
    model: {
      type: String,
      required: true,
      trim: true
    },
    manufacturingYear: {
      type: Number,
      required: true
    },
    fuelType: {
      type: String,
      required: true,
      enum: ['Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid']
    },
    fuelCapacity: {
      type: Number,
      required: true
    },
    currentMileage: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['Available', 'On Trip', 'Maintenance', 'Inactive'],
      default: 'Available'
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null
    },
    purchaseDate: {
      type: Date
    },
    insuranceExpiry: {
      type: Date,
      required: true
    },
    registrationExpiry: {
      type: Date,
      required: true
    },
    lastServiceDate: {
      type: Date
    },
    nextServiceDate: {
      type: Date
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

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
export default Vehicle;
