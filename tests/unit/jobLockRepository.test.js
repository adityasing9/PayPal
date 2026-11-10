import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JobLockRepository,
  StaleWorkerFenceError
} from '../../src/repositories/JobLockRepository.js';
import { JobLock } from '../../src/models/index.js';

describe('Step 2.4.3: JobLockRepository (Distributed Fenced Locking)', () => {
  let repository;

  beforeEach(() => {
    vi.restoreAllMocks();
    repository = new JobLockRepository();
  });

  describe('acquireLock', () => {
    it('successfully acquires unowned lock and increments fenceToken monotonically', async () => {
      vi.spyOn(JobLock, 'findOne').mockResolvedValueOnce({ jobName: 'RECONCILIATION' });

      const mockAcquired = {
        jobName: 'RECONCILIATION',
        lockedBy: 'worker-1',
        fenceToken: 1n,
        expiresAt: new Date(Date.now() + 60000)
      };

      const findOneAndUpdateSpy = vi
        .spyOn(JobLock, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockAcquired);

      const result = await repository.acquireLock({
        jobName: 'RECONCILIATION',
        workerId: 'worker-1',
        leaseDurationMs: 60000
      });

      expect(result.acquired).toBe(true);
      expect(result.fenceToken).toBe(1n);

      // Verify query condition allows acquisition ONLY if lockedBy is null OR expired
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          jobName: 'RECONCILIATION',
          $or: [
            { lockedBy: null },
            { expiresAt: { $lt: expect.any(Date) } }
          ]
        },
        {
          $set: {
            lockedBy: 'worker-1',
            acquiredAt: expect.any(Date),
            expiresAt: expect.any(Date),
            leaseDurationMs: 60000
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
    });

    it('rejects acquisition when active lease is held by another worker', async () => {
      vi.spyOn(JobLock, 'findOne')
        .mockResolvedValueOnce({ jobName: 'RECONCILIATION' }) // ensureLockDocument
        .mockResolvedValueOnce({
          // active lock lookup
          jobName: 'RECONCILIATION',
          lockedBy: 'worker-active',
          expiresAt: new Date(Date.now() + 45000)
        });

      // findOneAndUpdate returns null because $or condition (null or expired) is not met
      vi.spyOn(JobLock, 'findOneAndUpdate').mockResolvedValueOnce(null);

      const result = await repository.acquireLock({
        jobName: 'RECONCILIATION',
        workerId: 'competing-worker-2'
      });

      expect(result.acquired).toBe(false);
      expect(result.reason).toBe('LEASE_ACTIVE');
    });

    it('allows acquisition when previous lease has expired', async () => {
      vi.spyOn(JobLock, 'findOne').mockResolvedValueOnce({ jobName: 'RECONCILIATION' });

      const mockAcquired = {
        jobName: 'RECONCILIATION',
        lockedBy: 'worker-2',
        fenceToken: 2n, // incremented from 1n
        expiresAt: new Date(Date.now() + 60000)
      };

      vi.spyOn(JobLock, 'findOneAndUpdate').mockResolvedValueOnce(mockAcquired);

      const result = await repository.acquireLock({
        jobName: 'RECONCILIATION',
        workerId: 'worker-2'
      });

      expect(result.acquired).toBe(true);
      expect(result.fenceToken).toBe(2n);
    });
  });

  describe('renewLease (Heartbeat)', () => {
    it('renews lease when workerId, fenceToken match and lease has NOT expired', async () => {
      const now = new Date('2026-11-08T12:00:00Z');
      const mockRenewed = {
        jobName: 'RECONCILIATION',
        lockedBy: 'worker-1',
        fenceToken: 1n,
        expiresAt: new Date(now.getTime() + 60000)
      };

      const findOneAndUpdateSpy = vi
        .spyOn(JobLock, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockRenewed);

      const result = await repository.renewLease({
        jobName: 'RECONCILIATION',
        workerId: 'worker-1',
        fenceToken: 1n,
        now
      });

      expect(result.renewed).toBe(true);

      // Verify heartbeat condition requires expiresAt > now
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          jobName: 'RECONCILIATION',
          lockedBy: 'worker-1',
          fenceToken: 1n,
          expiresAt: { $gt: now }
        },
        {
          $set: {
            expiresAt: expect.any(Date),
            leaseDurationMs: 60000
          }
        },
        {
          new: true,
          runValidators: true
        }
      );
    });

    it('rejects renewal if lease has expired or stolen by new fence token', async () => {
      vi.spyOn(JobLock, 'findOneAndUpdate').mockResolvedValueOnce(null);

      const result = await repository.renewLease({
        jobName: 'RECONCILIATION',
        workerId: 'stale-worker',
        fenceToken: 1n
      });

      expect(result.renewed).toBe(false);
      expect(result.reason).toBe('LEASE_LOST_OR_EXPIRED');
    });
  });

  describe('releaseLock', () => {
    it('releases lock by clearing lockedBy and expiresAt while preserving the permanent document', async () => {
      const findOneAndUpdateSpy = vi
        .spyOn(JobLock, 'findOneAndUpdate')
        .mockResolvedValueOnce({ jobName: 'RECONCILIATION', lockedBy: null });

      const result = await repository.releaseLock({
        jobName: 'RECONCILIATION',
        workerId: 'worker-1',
        fenceToken: 1n
      });

      expect(result.released).toBe(true);

      // Must NOT call deleteOne or deleteMany
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          jobName: 'RECONCILIATION',
          lockedBy: 'worker-1',
          fenceToken: 1n
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
    });

    it('rejects release if lockedBy or fenceToken does not match', async () => {
      vi.spyOn(JobLock, 'findOneAndUpdate').mockResolvedValueOnce(null);

      const result = await repository.releaseLock({
        jobName: 'RECONCILIATION',
        workerId: 'worker-1',
        fenceToken: 1n
      });

      expect(result.released).toBe(false);
      expect(result.reason).toBe('OWNERSHIP_OR_FENCE_MISMATCH');
    });
  });

  describe('applyFencedMutation (Downstream Stale-Worker Protection)', () => {
    it('applies mutation when currentFenceToken is greater than lastAppliedFenceToken', async () => {
      const mockModel = {
        findOneAndUpdate: vi.fn().mockResolvedValueOnce({
          _id: 'doc_123',
          lastAppliedFenceToken: 5n
        }),
        findOne: vi.fn()
      };

      const result = await repository.applyFencedMutation({
        model: mockModel,
        filter: { _id: 'doc_123' },
        update: { $set: { status: 'RECONCILED' } },
        currentFenceToken: 5n
      });

      expect(result._id).toBe('doc_123');
      expect(result.lastAppliedFenceToken).toBe(5n);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'doc_123',
          $or: [
            { lastAppliedFenceToken: { $lt: 5n } },
            { lastAppliedFenceToken: { $exists: false } },
            { lastAppliedFenceToken: null }
          ]
        },
        {
          $set: {
            status: 'RECONCILED',
            lastAppliedFenceToken: 5n
          }
        },
        {
          new: true
        }
      );
    });

    it('rejects mutation and throws StaleWorkerFenceError if worker fenceToken is stale', async () => {
      const mockModel = {
        findOneAndUpdate: vi.fn().mockResolvedValueOnce(null),
        findOne: vi.fn().mockResolvedValueOnce({
          _id: 'doc_123',
          lastAppliedFenceToken: 7n // already updated to 7n by a newer worker
        })
      };

      // Stale worker tries to apply mutation with fenceToken 5n
      await expect(
        repository.applyFencedMutation({
          model: mockModel,
          filter: { _id: 'doc_123' },
          update: { $set: { status: 'RECONCILED' } },
          currentFenceToken: 5n
        })
      ).rejects.toThrow(StaleWorkerFenceError);
    });
  });
});
