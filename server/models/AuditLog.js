import mongoose from 'mongoose';

// What the platform owner did inside a customer organization ("acting as" that organization): one row per
// change request. Only the request line and the result are kept, never the request body (it can hold passwords).
// Rows are never edited or deleted by the application.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmail: { type: String, default: '' },
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    orgName: { type: String, default: '' },
    method: { type: String, required: true },
    path: { type: String, required: true },
    status: { type: Number, default: 0 },
    ip: { type: String, default: '' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ orgId: 1, createdAt: -1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
