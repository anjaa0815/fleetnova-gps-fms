import mongoose from 'mongoose';

// A command sent (or waiting to be sent) to a tracker. The row is the audit trail: who asked, what exactly was
// sent, what happened. Commands are never deleted by the application.
const commandSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true },
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
    type: { type: String, enum: ['locate', 'reboot', 'engine_stop', 'engine_resume'], required: true },
    protocol: { type: String, required: true },
    text: { type: String, default: '' }, // what is sent to the tracker (the device command text)
    // queued -> sending -> sent -> acknowledged | unconfirmed (no answer);  or failed / expired / cancelled
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'acknowledged', 'unconfirmed', 'failed', 'expired', 'cancelled'],
      default: 'queued',
      index: true
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdByName: { type: String, default: '' },
    expiresAt: { type: Date, required: true }, // a command that has not been sent by then is dropped
    sentAt: { type: Date, default: null },
    ackedAt: { type: Date, default: null },
    flag: { type: Number, default: null }, // GT06: matches the tracker's answer to this command
    response: { type: String, default: '' },
    error: { type: String, default: '' }
  },
  { timestamps: true }
);

commandSchema.index({ device: 1, createdAt: -1 });

const Command = mongoose.models.Command || mongoose.model('Command', commandSchema);
export default Command;
