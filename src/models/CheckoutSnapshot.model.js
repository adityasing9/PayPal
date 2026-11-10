import mongoose from 'mongoose';

const { Schema } = mongoose;

export const CheckoutSnapshotSchema = new Schema(
  {
    proposalId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductProposal',
      required: [true, 'Proposal ID is required'],
      unique: true
    },
    intentId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentIntent',
      required: [true, 'Intent ID is required']
    },
    snapshotPayload: {
      productId: { type: String, required: true },
      variantSku: { type: String, required: true },
      merchantId: { type: String, required: true },
      paypalMerchantId: { type: String, required: true },
      lineItems: [
        {
          sku: { type: String, required: true },
          name: { type: String, required: true },
          quantity: { type: Number, required: true, min: 1 },
          unitPriceMinor: { type: Schema.Types.BigInt, required: true }
        }
      ],
      pricing: {
        basePriceMinor: { type: Schema.Types.BigInt, required: true },
        shippingMinor: { type: Schema.Types.BigInt, required: true },
        taxMinor: { type: Schema.Types.BigInt, required: true },
        discountMinor: { type: Schema.Types.BigInt, required: true },
        totalPriceMinor: { type: Schema.Types.BigInt, required: true },
        currency: { type: String, required: true },
        minorUnitExponent: { type: Number, required: true }
      },
      recurring: {
        isRecurring: { type: Boolean, required: true },
        billingInterval: { type: String, default: null },
        billingCycles: { type: Number, default: 0 }
      },
      specifications: {
        type: Map,
        of: Schema.Types.Mixed,
        required: true
      },
      rawDescription: {
        type: String
      }
    },
    snapshotHash: {
      type: String,
      required: [true, 'RFC 8785 snapshot hash is required']
    },
    capturedAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  {
    timestamps: false,
    collection: 'checkout_snapshots',
    strict: true
  }
);

CheckoutSnapshotSchema.index({ proposalId: 1 }, { unique: true });
CheckoutSnapshotSchema.index({ snapshotHash: 1 });

export const CheckoutSnapshot =
  mongoose.models.CheckoutSnapshot || mongoose.model('CheckoutSnapshot', CheckoutSnapshotSchema);
