import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { AuthorizationRepository } from '../../src/repositories/AuthorizationRepository.js';
import { JobLockRepository, StaleWorkerFenceError } from '../../src/repositories/JobLockRepository.js';
import { PaymentTransactionRepository } from '../../src/repositories/PaymentTransactionRepository.js';
import {
  AuthorizationRecord,
  JobLock,
  PaymentTransaction
} from '../../src/models/index.js';
import { hashReturnToken } from '../../src/utils/cryptoUtils.js';

describe('Step 2.4.5: Database Concurrency & Race-Condition Integration Testing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('A. 20-Worker Concurrent Authorization Nonce Claims', () => {
    it('under 20 simultaneous concurrent claims on a PENDING nonce, exactly ONE succeeds and 19 fail', async () => {
      const repository = new AuthorizationRepository();
      const nonce = 'concurrent_nonce_' + Math.random().toString(36).substring(2);
      const userId = new mongoose.Types.ObjectId();
      const snapshotHash = 'a'.repeat(64);
      const now = new Date('2026-11-08T12:00:00Z');

      // Shared in-memory document state simulating MongoDB document
      let doc = {
        _id: new mongoose.Types.ObjectId(),
        nonce,
        userId,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + 300000), // 5 min in future
        snapshotHash,
        idempotencyKey: null,
        inFlightStartedAt: null
      };

      // Atomic lock simulating MongoDB document-level write lock
      let lockPromise = Promise.resolve();

      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        return new Promise((resolve) => {
          lockPromise = lockPromise.then(async () => {
            // Atomic check of filter condition against document state
            const matches =
              doc.nonce === filter.nonce &&
              doc.userId.toString() === filter.userId.toString() &&
              doc.status === filter.status &&
              doc.expiresAt > filter.expiresAt.$gt &&
              doc.snapshotHash === filter.snapshotHash;

            if (matches) {
              // Apply $set update atomically
              doc = {
                ...doc,
                ...update.$set
              };
              resolve(doc);
            } else {
              resolve(null);
            }
          });
        });
      });

      vi.spyOn(AuthorizationRecord, 'findOne').mockImplementation(async (filter) => {
        if (filter.nonce === doc.nonce) {
          return doc;
        }
        return null;
      });

      // Launch 20 simultaneous concurrent claims with different idempotency keys
      const concurrencyLevel = 20;
      const tasks = Array.from({ length: concurrencyLevel }, (_, i) => {
        return repository
          .claimNonce({
            nonce,
            userId,
            idempotencyKey: `idem_key_worker_${i}`,
            expectedSnapshotHash: snapshotHash,
            now
          })
          .then((claimed) => ({ success: true, workerIndex: i, claimed }))
          .catch((err) => ({ success: false, workerIndex: i, error: err.name }));
      });

      const results = await Promise.all(tasks);

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      // EXACTLY ONE worker must have successfully claimed the nonce
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(19);

      // Successful worker set status to IN_FLIGHT
      expect(successes[0].claimed.status).toBe('IN_FLIGHT');

      // All 19 rejected workers received controlled conflict error
      for (const fail of failures) {
        expect(fail.error).toBe('AuthorizationConflictError');
      }

      // Final document state in database is IN_FLIGHT
      expect(doc.status).toBe('IN_FLIGHT');
      expect(doc.idempotencyKey).toBe(`idem_key_worker_${successes[0].workerIndex}`);
    });
  });

  describe('B. 10-Worker Concurrent Job Lock Acquisition', () => {
    it('under 10 simultaneous workers competing for an expired lock, exactly ONE acquires and 9 receive LEASE_ACTIVE', async () => {
      const repository = new JobLockRepository();
      const jobName = 'PAYMENT_RECONCILIATION';
      const now = new Date('2026-11-08T12:00:00Z');

      // In-memory document state simulating an expired lock document in MongoDB
      let lockDoc = {
        _id: new mongoose.Types.ObjectId(),
        jobName,
        lockedBy: 'previous-dead-worker',
        acquiredAt: new Date(now.getTime() - 120000),
        expiresAt: new Date(now.getTime() - 60000), // Expired 60s ago
        leaseDurationMs: 60000,
        fenceToken: 4n,
        lastAppliedFenceToken: 4n
      };

      vi.spyOn(JobLock, 'findOne').mockImplementation(async (filter) => {
        if (filter.jobName === lockDoc.jobName) {
          return lockDoc;
        }
        return null;
      });

      let lockMutex = Promise.resolve();

      vi.spyOn(JobLock, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        return new Promise((resolve) => {
          lockMutex = lockMutex.then(async () => {
            // Check condition: jobName matches and ($or: lockedBy is null or expiresAt < now)
            const isUnowned = lockDoc.lockedBy === null;
            const isExpired = lockDoc.expiresAt < filter.$or[1].expiresAt.$lt;
            const matches = lockDoc.jobName === filter.jobName && (isUnowned || isExpired);

            if (matches) {
              const newFenceToken = (lockDoc.fenceToken || 0n) + (update.$inc?.fenceToken || 1n);
              lockDoc = {
                ...lockDoc,
                ...update.$set,
                fenceToken: newFenceToken
              };
              resolve(lockDoc);
            } else {
              resolve(null);
            }
          });
        });
      });

      // Launch 10 simultaneous worker acquisition attempts
      const workerCount = 10;
      const tasks = Array.from({ length: workerCount }, (_, i) => {
        return repository.acquireLock({
          jobName,
          workerId: `worker_${i}`,
          leaseDurationMs: 60000,
          now
        });
      });

      const results = await Promise.all(tasks);

      const acquired = results.filter((r) => r.acquired);
      const rejected = results.filter((r) => !r.acquired);

      // EXACTLY ONE worker must have successfully acquired the lock
      expect(acquired).toHaveLength(1);
      expect(rejected).toHaveLength(9);

      // Winning worker got incremented fenceToken (from 4n to 5n)
      expect(acquired[0].fenceToken).toBe(5n);

      // All 9 losing workers received controlled LEASE_ACTIVE reason
      for (const rej of rejected) {
        expect(rej.reason).toBe('LEASE_ACTIVE');
      }

      // Final document state reflects winning worker and 5n fence token
      expect(lockDoc.fenceToken).toBe(5n);
    });
  });

  describe('C. 20-Worker Concurrent Return-Token Consumption', () => {
    it('under 20 simultaneous consumption attempts for the same return token, exactly ONE succeeds and 19 fail with 401', async () => {
      const repository = new PaymentTransactionRepository();
      const rawToken = 'b'.repeat(64);
      const tokenHash = hashReturnToken(rawToken);
      const transactionId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const paypalOrderId = 'PAYPAL_ORDER_CONCURRENT';
      const now = new Date('2026-11-08T12:00:00Z');

      // Shared in-memory document state simulating MongoDB document
      let txDoc = {
        _id: transactionId,
        userId,
        paypalOrderId,
        status: 'CREATED',
        returnSessionToken: {
          tokenHash,
          expiresAt: new Date(now.getTime() + 60000), // unexpired
          consumed: false,
          consumedAt: null
        }
      };

      let tokenMutex = Promise.resolve();

      vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
        return new Promise((resolve) => {
          tokenMutex = tokenMutex.then(async () => {
            const matches =
              txDoc._id.toString() === filter._id.toString() &&
              txDoc.userId.toString() === filter.userId.toString() &&
              txDoc.paypalOrderId === filter.paypalOrderId &&
              txDoc.returnSessionToken.tokenHash === filter['returnSessionToken.tokenHash'] &&
              txDoc.returnSessionToken.consumed === filter['returnSessionToken.consumed'] &&
              txDoc.returnSessionToken.expiresAt > filter['returnSessionToken.expiresAt'].$gt;

            if (matches) {
              txDoc = {
                ...txDoc,
                returnSessionToken: {
                  ...txDoc.returnSessionToken,
                  consumed: update.$set['returnSessionToken.consumed'],
                  consumedAt: update.$set['returnSessionToken.consumedAt']
                }
              };
              resolve(txDoc);
            } else {
              resolve(null);
            }
          });
        });
      });

      // Launch 20 simultaneous consumption requests
      const requestCount = 20;
      const tasks = Array.from({ length: requestCount }, (_, i) => {
        return repository
          .consumeReturnToken({
            returnToken: rawToken,
            transactionId,
            userId,
            paypalOrderId,
            now
          })
          .then((tx) => ({ success: true, reqIndex: i, tx }))
          .catch((err) => ({ success: false, reqIndex: i, error: err }));
      });

      const results = await Promise.all(tasks);

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      // EXACTLY ONE request must have successfully consumed the return token
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(19);

      // All 19 failures must receive 401 INVALID_OR_EXPIRED_RETURN_TOKEN
      for (const fail of failures) {
        expect(fail.error.statusCode).toBe(401);
        expect(fail.error.code).toBe('INVALID_OR_EXPIRED_RETURN_TOKEN');
      }

      // Final state: consumed is true
      expect(txDoc.returnSessionToken.consumed).toBe(true);
    });
  });

  describe('D. Stale-Worker Fencing Protection Under Race Condition', () => {
    it('blocks a stale worker from mutating data when a newer worker has already advanced the fencing token', async () => {
      const repository = new JobLockRepository();

      // Target document in database
      let targetDoc = {
        _id: 'payment_summary_doc',
        reconciledAmountMinor: 10000n,
        lastAppliedFenceToken: 10n // already updated to fenceToken 10n
      };

      const mockModel = {
        findOneAndUpdate: vi.fn().mockImplementation(async (filter, update) => {
          // Check condition: lastAppliedFenceToken < token
          const token = update.$set.lastAppliedFenceToken;
          if (targetDoc.lastAppliedFenceToken < token) {
            targetDoc = { ...targetDoc, ...update.$set };
            return targetDoc;
          }
          return null; // rejected because targetDoc.lastAppliedFenceToken >= token
        }),
        findOne: vi.fn().mockImplementation(async () => targetDoc)
      };

      // Stale worker (held fenceToken 9n) attempts mutation
      await expect(
        repository.applyFencedMutation({
          model: mockModel,
          filter: { _id: 'payment_summary_doc' },
          update: { $set: { reconciledAmountMinor: 10500n } },
          currentFenceToken: 9n // STALE! (9n < 10n)
        })
      ).rejects.toThrow(StaleWorkerFenceError);

      // Document was NOT mutated by the stale worker
      expect(targetDoc.reconciledAmountMinor).toBe(10000n);

      // Valid worker (with newer fenceToken 11n) attempts mutation
      const validResult = await repository.applyFencedMutation({
        model: mockModel,
        filter: { _id: 'payment_summary_doc' },
        update: { $set: { reconciledAmountMinor: 12000n } },
        currentFenceToken: 11n // VALID! (11n > 10n)
      });

      expect(validResult.reconciledAmountMinor).toBe(12000n);
      expect(targetDoc.lastAppliedFenceToken).toBe(11n);
    });
  });
});
