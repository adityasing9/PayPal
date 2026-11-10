import mongoose from 'mongoose';

const { Schema } = mongoose;

export const SecurityPolicySchema = new Schema(
  {
    policyCode: {
      type: String,
      required: [true, 'Policy code is required'],
      unique: true,
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Policy name is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      enum: ['BUDGET', 'MERCHANT', 'RECURRING', 'SPECIFICATION', 'CONTENT'],
      required: [true, 'Policy category is required']
    },
    actionOnFailure: {
      type: String,
      enum: ['BLOCK', 'REVIEW'],
      required: [true, 'Action on failure is required']
    },
    isEnabled: {
      type: Boolean,
      default: true,
      required: true
    },
    configuration: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'security_policies',
    strict: true
  }
);

SecurityPolicySchema.index({ policyCode: 1 }, { unique: true });
SecurityPolicySchema.index({ isEnabled: 1 });

export const SecurityPolicy =
  mongoose.models.SecurityPolicy || mongoose.model('SecurityPolicy', SecurityPolicySchema);
