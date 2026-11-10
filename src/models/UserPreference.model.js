import mongoose from 'mongoose';

const { Schema } = mongoose;

export const UserPreferenceSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true
    },
    defaultCurrency: {
      type: String,
      default: 'USD',
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      required: true
    },
    minorUnitExponent: {
      type: Number,
      default: 2,
      required: true
    },
    maxTransactionLimitMinor: {
      type: Schema.Types.BigInt,
      required: [true, 'Max transaction limit is required'],
      min: [0n, 'Limit must be non-negative']
    },
    dailySpendingLimitMinor: {
      type: Schema.Types.BigInt,
      required: [true, 'Daily spending limit is required'],
      min: [0n, 'Limit must be non-negative']
    },
    allowedMerchants: [
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
    ],
    requireExplicitReviewOverMinor: {
      type: Schema.Types.BigInt,
      default: 20000n,
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'user_preferences',
    strict: true
  }
);

UserPreferenceSchema.index({ userId: 1 }, { unique: true });

export const UserPreference =
  mongoose.models.UserPreference || mongoose.model('UserPreference', UserPreferenceSchema);
