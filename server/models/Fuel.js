import mongoose from 'mongoose';

const fuelSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    fuelRecordId: {
      type: String,
      required: true,
      trim: true
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle is required']
    },
    date: {
      type: Date,
      default: Date.now
    },
    fuelType: {
      type: String,
      required: true,
      enum: ['Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity in Liters/Units is required'],
      min: 0.1
    },
    pricePerLiter: {
      type: Number,
      required: [true, 'Price per Liter is required'],
      min: 0.1
    },
    totalCost: {
      type: Number,
      required: true
    },
    odometerReading: {
      type: Number,
      required: true,
      min: 0
    },
    fuelStation: {
      type: String,
      trim: true,
      default: 'Authorized Station'
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver'
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

// Mongoose 9: synchronous hooks take no `next` callback
fuelSchema.pre('validate', function () {
  if (this.quantity && this.pricePerLiter) {
    this.totalCost = Math.round(this.quantity * this.pricePerLiter * 100) / 100;
  }
});

// Identifiers are unique per organization, not globally
fuelSchema.index({ orgId: 1, fuelRecordId: 1 }, { unique: true });

const Fuel = mongoose.models.Fuel || mongoose.model('Fuel', fuelSchema);
export default Fuel;
