import mongoose from 'mongoose';

const { Schema } = mongoose;

export const WebhookEventSchema = new Schema(
  {
    paypalEventId: {
      type: String,
      required: [true, 'PayPal event ID is required'],
      unique: true
    },
    eventType: {
      type: String,
      required: [true, 'Event type is required']
    },
    resourceType: {
      type: String,
      required: [true, 'Resource type is required']
    },
    summary: {
      type: String
    },
    payload: {
      type: Schema.Types.Mixed,
      required: [true, 'Webhook payload is required']
    },
    signatureVerified: {
      type: Boolean,
      required: [true, 'Signature verification flag is required']
    },
    processedStatus: {
      type: String,
      enum: ['PROCESSING', 'PROCESSED', 'IGNORED', 'UNSUPPORTED', 'FAILED'],
      default: 'PROCESSING',
      required: true
    },
    processingStartedAt: {
      type: Date,
      default: null
    },
    processedTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentTransaction',
      default: null
    },
    failureReason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'webhook_events',
    strict: true
  }
);

WebhookEventSchema.index({ paypalEventId: 1 }, { unique: true });

export const WebhookEvent =
  mongoose.models.WebhookEvent || mongoose.model('WebhookEvent', WebhookEventSchema);
