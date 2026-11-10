import mongoose from 'mongoose';

const { Schema } = mongoose;

export const RiskAssessmentSchema = new Schema(
  {
    proposalId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductProposal',
      required: [true, 'Proposal ID is required'],
      index: true
    },
    snapshotHash: {
      type: String,
      required: [true, 'Snapshot hash is required']
    },
    decision: {
      type: String,
      enum: ['PASS', 'REVIEW', 'BLOCK'],
      required: [true, 'Decision is required']
    },
    riskScore: {
      type: Number,
      required: [true, 'Risk score is required'],
      min: 0,
      max: 1
    },
    failedRuleCodes: [
      {
        type: String
      }
    ],
    specDifferences: [
      {
        attribute: { type: String, required: true },
        requested: { type: String, required: true },
        proposed: { type: String, required: true },
        criticality: {
          type: String,
          enum: ['CRITICAL', 'NON_CRITICAL'],
          default: 'NON_CRITICAL'
        }
      }
    ],
    ruleEvaluationResults: {
      type: Schema.Types.Mixed,
      required: true
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
      required: true
    }
  },
  {
    timestamps: true,
    collection: 'risk_assessments',
    strict: true
  }
);

RiskAssessmentSchema.index({ proposalId: 1 });
RiskAssessmentSchema.index({ decision: 1 });

export const RiskAssessment =
  mongoose.models.RiskAssessment || mongoose.model('RiskAssessment', RiskAssessmentSchema);
