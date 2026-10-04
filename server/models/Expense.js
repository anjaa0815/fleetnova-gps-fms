import mongoose from 'mongoose';

const expenseSchema = new mongoose.Schema(
  {
    expenseId: {
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
    category: {
      type: String,
      required: true,
      enum: ['Fuel', 'Maintenance', 'Repair', 'Insurance', 'Toll', 'Trip', 'Other']
    },
    amount: {
      type: Number,
      required: [true, 'Expense amount is required'],
      min: 0.01
    },
    date: {
      type: Date,
      default: Date.now
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver'
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip'
    },
    paymentMethod: {
      type: String,
      enum: ['Company Card', 'Cash', 'Fuel Card', 'Bank Transfer', 'UPI'],
      default: 'Company Card'
    }
  },
  {
    timestamps: true
  }
);

const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
export default Expense;
