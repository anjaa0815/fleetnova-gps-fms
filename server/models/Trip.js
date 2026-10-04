import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema(
  {
    tripId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle is required']
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: [true, 'Driver is required']
    },
    source: {
      type: String,
      required: [true, 'Source location is required'],
      trim: true
    },
    destination: {
      type: String,
      required: [true, 'Destination location is required'],
      trim: true
    },
    startDate: {
      type: Date,
      required: true
    },
    expectedEndDate: {
      type: Date,
      required: true
    },
    actualEndDate: {
      type: Date
    },
    distance: {
      type: Number,
      required: [true, 'Distance in km is required'],
      min: 0
    },
    purpose: {
      type: String,
      default: 'Cargo Delivery'
    },
    fuelUsed: {
      type: Number,
      default: 0
    },
    tripExpense: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'],
      default: 'Scheduled'
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

const Trip = mongoose.models.Trip || mongoose.model('Trip', tripSchema);
export default Trip;
