import mongoose from 'mongoose';

const { Schema } = mongoose;

export const PaymentIntentSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    version: {
      type: Number,
      default: 1,
      required: true
    },
    prompt: {
      type: String,
      required: [true, 'Prompt is required'],
      trim: true
    },
    maxBudgetMinor: {
      type: Schema.Types.BigInt,
      required: [true, 'Max budget is required'],
      min: [1n, 'Budget must be at least 1 minor unit']
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: 'USD'
    },
    minorUnitExponent: {
      type: Number,
      default: 2,
      required: true
    },
    category: {
      type: String,
      enum: ['Keyboards', 'Headphones', 'Monitors', 'General'],
      default: 'General',
      required: true
    },
    constraints: {
      requiredSpecs: {
        type: Map,
        of: Schema.Types.Mixed,
        default: {}
      },
      preferredMerchants: [
        {
          type: String,
          trim: true
        }
      ],
      blockedMerchants: [
        {
          type: String,
          trim: true
        }
      ]
    },
    status: {
      type: String,
      enum: ['INITIALIZED', 'SEARCHING', 'PROPOSED', 'APPROVED', 'CANCELLED', 'EXPIRED'],
      default: 'INITIALIZED',
      required: true
    },
    previousVersionId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentIntent',
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'payment_intents',
    strict: true
  }
);

PaymentIntentSchema.index({ userId: 1, createdAt: -1 });
PaymentIntentSchema.index({ userId: 1, version: 1 });

export const PaymentIntent =
  mongoose.models.PaymentIntent || mongoose.model('PaymentIntent', PaymentIntentSchema);
