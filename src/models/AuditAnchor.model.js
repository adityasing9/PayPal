import mongoose from 'mongoose';

const { Schema } = mongoose;

export const AuditAnchorSchema = new Schema(
  {
    anchorTipLogId: {
      type: Schema.Types.ObjectId,
      ref: 'AuditLog',
      required: [true, 'Anchor tip log ID is required']
    },
    anchorHash: {
      type: String,
      required: [true, 'Cryptographic anchor root hash is required']
    },
    triggerType: {
      type: String,
      enum: ['SCHEDULED_60_MIN', 'HIGH_VALUE_TRANSACTION'],
      required: [true, 'Trigger type is required']
    },
    transactionAmountMinor: {
      type: Schema.Types.BigInt,
      default: null
    },
    externalTarget: {
      type: String,
      enum: ['WORM_STORAGE', 'RFC3161_TSA', 'PUBLIC_LEDGER'],
      required: [true, 'External anchor target is required']
    },
    externalReceiptId: {
      type: String,
      required: [true, 'External anchor receipt is required']
    },
    anchoredAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  {
    timestamps: false,
    collection: 'audit_anchors',
    strict: true
  }
);

AuditAnchorSchema.index({ anchoredAt: -1 });
AuditAnchorSchema.index({ triggerType: 1 });

export const AuditAnchor =
  mongoose.models.AuditAnchor || mongoose.model('AuditAnchor', AuditAnchorSchema);
