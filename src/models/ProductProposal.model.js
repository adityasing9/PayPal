import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ProductProposalSchema = new Schema(
  {
    intentId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentIntent',
      required: [true, 'Intent ID is required'],
      index: true
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product ID is required']
    },
    variantSku: {
      type: String,
      required: [true, 'Variant SKU is required'],
      trim: true
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    merchantId: {
      type: String,
      required: [true, 'Merchant ID is required'],
      trim: true
    },
    paypalMerchantId: {
      type: String,
      required: [true, 'PayPal merchant ID is required'],
      trim: true
    },
    lineItems: [
      {
        name: { type: String, required: true },
        sku: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1, default: 1 },
        unitPriceMinor: { type: Schema.Types.BigInt, required: true, min: 0n }
      }
    ],
    pricing: {
      basePriceMinor: { type: Schema.Types.BigInt, required: true, min: 0n },
      shippingMinor: { type: Schema.Types.BigInt, default: 0n, required: true },
      taxMinor: { type: Schema.Types.BigInt, default: 0n, required: true },
      discountMinor: { type: Schema.Types.BigInt, default: 0n, required: true },
      totalPriceMinor: { type: Schema.Types.BigInt, required: true, min: 0n },
      currency: { type: String, required: true, uppercase: true, default: 'USD' },
      minorUnitExponent: { type: Number, default: 2, required: true }
    },
    recurring: {
      isRecurring: { type: Boolean, default: false, required: true },
      billingInterval: {
        type: String,
        enum: ['DAY', 'WEEK', 'MONTH', 'YEAR', null],
        default: null
      },
      billingCycles: { type: Number, default: 0 }
    },
    recommendationRank: {
      type: Number,
      default: 1,
      required: true
    },
    agentRationale: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      enum: ['PENDING_VERIFICATION', 'VERIFIED_PASS', 'VERIFIED_REVIEW', 'BLOCKED', 'SELECTED', 'REJECTED'],
      default: 'PENDING_VERIFICATION',
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'product_proposals',
    strict: true
  }
);

ProductProposalSchema.index({ intentId: 1, createdAt: -1 });

export const ProductProposal =
  mongoose.models.ProductProposal || mongoose.model('ProductProposal', ProductProposalSchema);
