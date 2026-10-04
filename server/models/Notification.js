import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    type: {
      type: String,
      required: true,
      enum: [
        'maintenance_due',
        'maintenance_overdue',
        'insurance_expiry',
        'registration_expiry',
        'license_expiry',
        'trip_assigned',
        'trip_started',
        'trip_completed',
        'vehicle_status_change',
        'alert',
        'speeding',
        'geofence_enter',
        'geofence_exit'
      ]
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false
    },
    // Untranslated templates + values so the UI can show the alert in the viewer's language
    titleKey: { type: String, default: null },
    messageKey: { type: String, default: null },
    params: { type: mongoose.Schema.Types.Mixed, default: null },
    relatedEntity: {
      type: String,
      default: null
    },
    relatedEntityId: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export default Notification;
