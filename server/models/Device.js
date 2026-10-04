import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    name: { type: String, required: true, trim: true },
    // The IMEI is what a tracker identifies itself with, so it is unique across the whole platform
    imei: { type: String, required: true, unique: true, trim: true },
    protocol: { type: String, enum: ['teltonika', 'osmand', 'gt06'], default: 'teltonika' },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    simNumber: { type: String, default: '', trim: true },
    // Shared secret for HTTP (OsmAnd) devices; Teltonika trackers identify with the IMEI only
    secret: { type: String, default: undefined },
    lastSeenAt: { type: Date, default: null },
    // Alert engine state: geofences the device is currently inside, consecutive over-limit reports
    alertState: {
      inside: [String],
      overLimitCount: { type: Number, default: 0 },
      speedingAlerted: { type: Boolean, default: false }
    },
    lastPosition: {
      lat: Number,
      lng: Number,
      speed: Number,
      heading: Number,
      altitude: Number,
      satellites: Number,
      ignition: Boolean,
      timestamp: Date
    }
  },
  { timestamps: true }
);

const Device = mongoose.models.Device || mongoose.model('Device', deviceSchema);
export default Device;
