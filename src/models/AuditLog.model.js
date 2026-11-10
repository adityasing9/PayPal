import mongoose from 'mongoose';

const { Schema } = mongoose;

export const AuditLogSchema = new Schema(
  {
    eventType: {
      type: String,
      enum: [
        'INTENT_CREATED',
        'PROPOSAL_GENERATED',
        'SECURITY_EVALUATION',
        'AUTHORIZATION_ISSUED',
        'NONCE_LOCKED_IN_FLIGHT',
        'NONCE_CONSUMED',
        'PAYMENT_ORDER_CREATED',
        'PAYMENT_CAPTURED',
        'REPLAY_ATTACK_BLOCKED',
        'REVIEW_ACKNOWLEDGED',
        'WEBHOOK_PROCESSED',
        'AUDIT_ANCHOR_PUBLISHED',
        'RATE_LIMIT_EXCEEDED'
      ],
      required: [true, 'Audit event type is required']
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    referenceId: {
      type: String,
      required: [true, 'Reference ID is required'],
      index: true
    },
    details: {
      type: Schema.Types.Mixed,
      required: [true, 'Audit log details are required']
    },
    actor: {
      type: String,
      required: [true, 'Actor is required']
    },
    ipAddress: {
      type: String,
      default: null
    },
    previousLogHash: {
      type: String,
      default: null
    },
    logHash: {
      type: String,
      required: [true, 'Cryptographic logHash is required']
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only immutable log
    collection: 'audit_logs',
    strict: true
  }
);

AuditLogSchema.index({ eventType: 1, createdAt: -1 });
AuditLogSchema.index({ referenceId: 1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
