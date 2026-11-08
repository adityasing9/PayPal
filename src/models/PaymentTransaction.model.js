import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PaymentTransactionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    authorizationId: {
      type: Schema.Types.ObjectId,
      ref: 'AuthorizationRecord',
      required: [true, 'Authorization ID is required'],
      unique: true
    },
    proposalId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductProposal',
      required: [true, 'Proposal ID is required']
    },
    paypalOrderId: {
      type: String,
      required: [true, 'PayPal order ID is required'],
      unique: true
    },
    paypalCaptureId: {
      type: String,
      default: null,
      index: true
    },
    idempotencyKey: {
      type: String,
      required: [true, 'Client idempotency key is required'],
      unique: true
    },
    amountMinor: {
      type: Schema.Types.BigInt,
      required: [true, 'Payment minor units required'],
      min: [0n, 'Amount must be non-negative']
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: 'USD'
    },
    minorUnitExponent: {
      type: Number,
      default: 2,
      required: true
    },
    status: {
      type: String,
      enum: ['CREATED', 'APPROVED_BY_USER', 'CAPTURING', 'COMPLETED', 'FAILED', 'REFUNDED'],
      default: 'CREATED',
      required: true
    },
    returnSessionToken: {
      tokenHash: { type: String, default: null, index: true },
      expiresAt: { type: Date, default: null },
      consumed: { type: Boolean, default: false },
      consumedAt: { type: Date, default: null }
    },
    payerEmail: {
      type: String
    },
    sellerProtectionStatus: {
      type: String
    },
    failureReason: {
      type: String
    }
  },
  {
    timestamps: true,
    collection: 'payment_transactions',
    strict: true
  }
);

PaymentTransactionSchema.index({ paypalOrderId: 1 }, { unique: true });
PaymentTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
PaymentTransactionSchema.index({ authorizationId: 1 }, { unique: true });
PaymentTransactionSchema.index({ 'returnSessionToken.tokenHash': 1 });

export const PaymentTransaction =
  mongoose.models.PaymentTransaction ||
  mongoose.model('PaymentTransaction', PaymentTransactionSchema);
