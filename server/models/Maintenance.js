import mongoose from 'mongoose';

const maintenanceSchema = new mongoose.Schema(
  {
    maintenanceId: {
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
    maintenanceType: {
      type: String,
      required: true,
      enum: [
        'Regular Service',
        'Oil Change',
        'Tire Replacement',
        'Brake Service',
        'Engine Service',
        'Repair',
        'Other'
      ]
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true
    },
    serviceDate: {
      type: Date,
      required: true
    },
    nextServiceDate: {
      type: Date
    },
    cost: {
      type: Number,
      required: [true, 'Maintenance cost is required'],
      min: 0
    },
    serviceCenter: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['Scheduled', 'In Progress', 'Completed'],
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

const Maintenance =
  mongoose.models.Maintenance || mongoose.model('Maintenance', maintenanceSchema);
export default Maintenance;
