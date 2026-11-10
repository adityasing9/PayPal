import { JobLock } from '../models/index.js';

/**
 * Custom Domain Errors for Distributed Job Locking
 */
export class JobLockAcquisitionError extends Error {
  constructor(message = 'Failed to acquire job lock') {
    super(message);
    this.name = 'JobLockAcquisitionError';
    this.code = 'JOB_LOCK_ACQUISITION_FAILED';
  }
}

export class StaleWorkerFenceError extends Error {
  constructor(message = 'Downstream mutation blocked by stale fencing token') {
    super(message);
    this.name = 'StaleWorkerFenceError';
    this.code = 'STALE_WORKER_FENCE_ERROR';
  }
}

/**
 * Repository for distributed job locks with lease management and stale-worker fencing.
 *
 * CRITICAL INVARIANTS:
 * 1. Exactly one permanent document per jobName. Documents are NEVER deleted to release locks.
 * 2. Atomic acquisition via conditional findOneAndUpdate.
 * 3. Monotonically increasing fenceToken on each new lease acquisition.
 * 4. Lease renewal asserts: jobName, lockedBy, fenceToken, and (expiresAt > now).
 * 5. Downstream mutations assert: lastAppliedFenceToken < currentFenceToken.
 * 6. Zero TTL deletion.
 */
export class JobLockRepository {
  /**
   * Ensures that a permanent lock document exists for the given jobName.
   * Handles first-time initialization and duplicate-key races safely.
   *
   * @param {string} jobName
   * @returns {Promise<import('mongoose').Document>}
   */
  async ensureLockDocument(jobName) {
    if (!jobName || typeof jobName !== 'string') {
      throw new TypeError('jobName is required');
    }

    let doc = await JobLock.findOne({ jobName });
    if (!doc) {
      try {
        doc = await JobLock.create({
          jobName,
          lockedBy: null,
          acquiredAt: null,
          expiresAt: null,
          fenceToken: 0n,
          lastAppliedFenceToken: 0n,
          leaseDurationMs: 60000
        });
      } catch (err) {
        if (err.code === 11000) {
          // Handled concurrent initialization race: fetch the created document
          doc = await JobLock.findOne({ jobName });
        } else {
          throw err;
        }
      }
    }
    return doc;
  }

  /**
   * Atomically acquires a lease on a job lock.
   *
   * Acquisition succeeds ONLY IF:
   * 1. The lock is currently unowned (lockedBy === null), OR
   * 2. The previous lease has expired (expiresAt < now).
   *
   * Increments fenceToken monotonically upon each successful acquisition.
   *
   * @param {{
   *   jobName: string,
   *   workerId: string,
   *   leaseDurationMs?: number,
   *   now?: Date
   * }} params
   * @returns {Promise<{ acquired: boolean, lock?: import('mongoose').Document, fenceToken?: bigint, reason?: string }>}
   */
  async acquireLock({ jobName, workerId, leaseDurationMs = 60000, now = new Date() }) {
    if (!jobName || !workerId) {
      throw new TypeError('jobName and workerId are required');
    }

    // Ensure permanent document exists first
    await this.ensureLockDocument(jobName);

    const expiresAt = new Date(now.getTime() + leaseDurationMs);

    const lock = await JobLock.findOneAndUpdate(
      {
        jobName,
        $or: [
          { lockedBy: null },
          { expiresAt: { $lt: now } }
        ]
      },
      {
        $set: {
          lockedBy: workerId,
          acquiredAt: now,
          expiresAt,
          leaseDurationMs
        },
        $inc: {
          fenceToken: 1n
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (lock) {
      return {
        acquired: true,
        lock,
        fenceToken: lock.fenceToken
      };
    }

    // Acquisition rejected: active lease held by another worker
    const currentLock = await JobLock.findOne({ jobName });
    return {
      acquired: false,
      reason: 'LEASE_ACTIVE',
      lock: currentLock
    };
  }

  /**
   * Renews an existing lease (heartbeat).
   *
   * Heartbeat requirement (Phase 2.6 invariant):
   * MUST assert:
   * 1. jobName matches.
   * 2. lockedBy matches workerId.
   * 3. fenceToken matches current lease fenceToken.
   * 4. Existing lease has NOT expired (expiresAt > now).
   *
   * @param {{
   *   jobName: string,
   *   workerId: string,
   *   fenceToken: bigint | string | number,
   *   leaseDurationMs?: number,
   *   now?: Date
   * }} params
   * @returns {Promise<{ renewed: boolean, lock?: import('mongoose').Document, reason?: string }>}
   */
  async renewLease({ jobName, workerId, fenceToken, leaseDurationMs = 60000, now = new Date() }) {
    if (!jobName || !workerId || fenceToken === undefined) {
      throw new TypeError('jobName, workerId, and fenceToken are required');
    }

    const token = typeof fenceToken === 'bigint' ? fenceToken : BigInt(fenceToken);
    const newExpiresAt = new Date(now.getTime() + leaseDurationMs);

    const lock = await JobLock.findOneAndUpdate(
      {
        jobName,
        lockedBy: workerId,
        fenceToken: token,
        expiresAt: { $gt: now } // MUST be unexpired
      },
      {
        $set: {
          expiresAt: newExpiresAt,
          leaseDurationMs
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (lock) {
      return {
        renewed: true,
        lock
      };
    }

    return {
      renewed: false,
      reason: 'LEASE_LOST_OR_EXPIRED'
    };
  }

  /**
   * Releases an active lease on a job lock.
   *
   * Clears lockedBy, acquiredAt, and expiresAt while preserving the permanent document.
   * Asserts jobName, lockedBy, and fenceToken.
   *
   * @param {{
   *   jobName: string,
   *   workerId: string,
   *   fenceToken: bigint | string | number
   * }} params
   * @returns {Promise<{ released: boolean, reason?: string }>}
   */
  async releaseLock({ jobName, workerId, fenceToken }) {
    if (!jobName || !workerId || fenceToken === undefined) {
      throw new TypeError('jobName, workerId, and fenceToken are required');
    }

    const token = typeof fenceToken === 'bigint' ? fenceToken : BigInt(fenceToken);

    const lock = await JobLock.findOneAndUpdate(
      {
        jobName,
        lockedBy: workerId,
        fenceToken: token
      },
      {
        $set: {
          lockedBy: null,
          acquiredAt: null,
          expiresAt: null
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (lock) {
      return { released: true };
    }

    return {
      released: false,
      reason: 'OWNERSHIP_OR_FENCE_MISMATCH'
    };
  }

  /**
   * Checks whether a worker currently holds an unexpired lease on a job.
   *
   * @param {{
   *   jobName: string,
   *   workerId: string,
   *   now?: Date
   * }} params
   * @returns {Promise<boolean>}
   */
  async checkOwnership({ jobName, workerId, now = new Date() }) {
    const lock = await JobLock.findOne({
      jobName,
      lockedBy: workerId,
      expiresAt: { $gt: now }
    });
    return !!lock;
  }

  /**
   * Protects a downstream mutation against stale workers using fencing token validation.
   *
   * Enforces in a single atomic update:
   * lastAppliedFenceToken < currentFenceToken (or does not exist yet).
   * Simultaneously updates lastAppliedFenceToken to currentFenceToken.
   *
   * @param {{
   *   model: import('mongoose').Model,
   *   filter: object,
   *   update: object,
   *   currentFenceToken: bigint | string | number,
   *   options?: object
   * }} params
   * @returns {Promise<import('mongoose').Document>}
   * @throws {StaleWorkerFenceError} If the mutation was rejected due to a stale fencing token.
   */
  async applyFencedMutation({ model, filter, update, currentFenceToken, options = {} }) {
    const token = typeof currentFenceToken === 'bigint' ? currentFenceToken : BigInt(currentFenceToken);

    const fencedFilter = {
      ...filter,
      $or: [
        { lastAppliedFenceToken: { $lt: token } },
        { lastAppliedFenceToken: { $exists: false } },
        { lastAppliedFenceToken: null }
      ]
    };

    const fencedUpdate = {
      ...update,
      $set: {
        ...(update.$set || {}),
        lastAppliedFenceToken: token
      }
    };

    const result = await model.findOneAndUpdate(fencedFilter, fencedUpdate, {
      new: true,
      ...options
    });

    if (!result) {
      // Check if document exists with equal or greater fencing token
      const doc = await model.findOne(filter);
      if (doc && doc.lastAppliedFenceToken !== undefined && doc.lastAppliedFenceToken >= token) {
        throw new StaleWorkerFenceError(
          `Mutation rejected: document lastAppliedFenceToken (${doc.lastAppliedFenceToken}) >= worker fenceToken (${token}). Worker is stale.`
        );
      }
      return null;
    }

    return result;
  }
}

export const jobLockRepository = new JobLockRepository();
