import mongoose from 'mongoose';

const positionSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    speed: { type: Number, default: 0 }, // km/h
    heading: { type: Number, default: 0 }, // degrees
    altitude: { type: Number, default: 0 }, // metres
    satellites: { type: Number, default: 0 },
    ignition: { type: Boolean, default: null },
    odometer: { type: Number, default: null }, // metres, when reported by the device
    timestamp: { type: Date, required: true }, // device time
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// History queries: one device (or vehicle) over a time range, inside one organization
positionSchema.index({ orgId: 1, device: 1, timestamp: -1 });
positionSchema.index({ orgId: 1, vehicle: 1, timestamp: -1 });

const Position = mongoose.models.Position || mongoose.model('Position', positionSchema);
export default Position;
