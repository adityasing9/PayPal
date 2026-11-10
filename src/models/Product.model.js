import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ProductSchema = new Schema(
  {
    externalId: {
      type: String,
      required: [true, 'External product ID is required'],
      unique: true,
      index: true,
      trim: true
    },
    title: {
      type: String,
      required: [true, 'Product title is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true // Untrusted passive data
    },
    category: {
      type: String,
      enum: ['Keyboards', 'Headphones', 'Monitors'],
      required: [true, 'Product category is required']
    },
    merchantId: {
      type: String,
      required: [true, 'Merchant ID is required'],
      index: true,
      trim: true
    },
    merchantName: {
      type: String,
      required: [true, 'Merchant name is required'],
      trim: true
    },
    paypalMerchantId: {
      type: String,
      required: [true, 'PayPal merchant ID is required'],
      trim: true
    },
    basePriceMinor: {
      type: Schema.Types.BigInt,
      required: [true, 'Base price minor units required'],
      min: [0n, 'Base price must be non-negative']
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
    specifications: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    },
    specHash: {
      type: String,
      required: [true, 'Deterministic specHash is required']
    },
    productUrl: {
      type: String,
      required: [true, 'Product URL is required']
    },
    catalogSource: {
      type: String,
      enum: ['CHANNEL3_OFFLINE_FIXTURE', 'CHANNEL3_API', 'MOCK'],
      default: 'CHANNEL3_OFFLINE_FIXTURE',
      required: true
    },
    isVerified: {
      type: Boolean,
      default: false,
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'products',
    strict: true
  }
);

ProductSchema.index({ externalId: 1 }, { unique: true });
ProductSchema.index({ merchantId: 1 });
ProductSchema.index({ category: 1 });

export const Product = mongoose.models.Product || mongoose.model('Product', ProductSchema);
