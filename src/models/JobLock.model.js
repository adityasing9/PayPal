import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * JobLock Schema.
 *
 * CRITICAL DISTRIBUTED LOCKING INVARIANTS:
 * 1. One permanent document per jobName. Never delete documents to release a lease.
 * 2. NO TTL deletion: expireAfterSeconds must NEVER be set.
 * 3. fenceToken: monotonically increasing counter incremented on every new lease acquisition.
 * 4. lastAppliedFenceToken: downstream mutations assert lastAppliedFenceToken < fenceToken.
 */
export const JobLockSchema = new Schema(
  {
    jobName: {
      type: String,
      required: [true, 'Job name is required'],
      unique: true,
      trim: true
    },
    lockedBy: {
      type: String,
      default: null
    },
    leaseDurationMs: {
      type: Number,
      default: 60000,
      required: true
    },
    acquiredAt: {
      type: Date,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true // Standard query index ONLY - NEVER TTL
    },
    fenceToken: {
      type: Schema.Types.BigInt,
      default: 0n,
      required: true
    },
    lastAppliedFenceToken: {
      type: Schema.Types.BigInt,
      default: 0n,
      required: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'job_locks',
    strict: true
  }
);

JobLockSchema.index({ jobName: 1 }, { unique: true });
JobLockSchema.index({ expiresAt: 1 });

export const JobLock = mongoose.models.JobLock || mongoose.model('JobLock', JobLockSchema);
