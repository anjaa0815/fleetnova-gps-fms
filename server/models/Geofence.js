import mongoose from 'mongoose';

const geofenceSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    name: { type: String, required: true, trim: true },
    shape: { type: String, enum: ['circle', 'polygon'], required: true },
    center: { lat: Number, lng: Number },
    radiusM: { type: Number, default: null },
    polygon: { type: [[Number]], default: undefined }, // [[lat, lng], ...]
    alertOnEnter: { type: Boolean, default: true },
    alertOnExit: { type: Boolean, default: true },
    // Empty = applies to every vehicle of the organization
    vehicles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' }],
    color: { type: String, default: '#2563eb' },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const Geofence = mongoose.models.Geofence || mongoose.model('Geofence', geofenceSchema);
export default Geofence;
