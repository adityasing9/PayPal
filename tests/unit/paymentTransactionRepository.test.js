import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  PaymentTransactionRepository,
  InvalidReturnTokenError,
  TransactionNotFoundError
} from '../../src/repositories/PaymentTransactionRepository.js';
import { PaymentTransaction } from '../../src/models/index.js';
import { hashReturnToken } from '../../src/utils/cryptoUtils.js';

describe('Step 2.4.4: PaymentTransactionRepository (Return-Token & Session Recovery)', () => {
  let repository;

  beforeEach(() => {
    vi.restoreAllMocks();
    repository = new PaymentTransactionRepository();
  });

  describe('attachReturnToken', () => {
    it('generates a 256-bit random return token and persists ONLY the SHA-256 hash', async () => {
      const transactionId = new mongoose.Types.ObjectId();
      const findByIdAndUpdateSpy = vi
        .spyOn(PaymentTransaction, 'findByIdAndUpdate')
        .mockResolvedValueOnce({
          _id: transactionId,
          status: 'CREATED'
        });

      const result = await repository.attachReturnToken({
        transactionId,
        ttlMs: 60000
      });

      expect(result.plaintextToken).toMatch(/^[a-f0-9]{64}$/);
      expect(result.expiresAt).toBeInstanceOf(Date);

      // Verify findByIdAndUpdate was called with the SHA-256 hash, NOT the plaintext token
      const expectedHash = hashReturnToken(result.plaintextToken);
      expect(findByIdAndUpdateSpy).toHaveBeenCalledWith(
        transactionId,
        {
          $set: {
            returnSessionToken: {
              tokenHash: expectedHash,
              expiresAt: result.expiresAt,
              consumed: false,
              consumedAt: null
            }
          }
        },
        {
          new: true,
          runValidators: true
        }
      );
    });

    it('throws TransactionNotFoundError if transaction does not exist', async () => {
      vi.spyOn(PaymentTransaction, 'findByIdAndUpdate').mockResolvedValueOnce(null);

      await expect(
        repository.attachReturnToken({
          transactionId: new mongoose.Types.ObjectId()
        })
      ).rejects.toThrow(TransactionNotFoundError);
    });
  });

  describe('consumeReturnToken (Atomic 5-Field Verification)', () => {
    const rawToken = 'a'.repeat(64);
    const tokenHash = hashReturnToken(rawToken);
    const transactionId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const paypalOrderId = 'ORDER_TEST_999';
    const now = new Date('2026-11-08T12:00:00Z');

    it('atomically consumes return token with 5-field query check', async () => {
      const mockConsumed = {
        _id: transactionId,
        userId,
        paypalOrderId,
        returnSessionToken: {
          tokenHash,
          consumed: true,
          consumedAt: now
        }
      };

      const findOneAndUpdateSpy = vi
        .spyOn(PaymentTransaction, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockConsumed);

      const result = await repository.consumeReturnToken({
        returnToken: rawToken,
        transactionId,
        userId,
        paypalOrderId,
        now
      });

      expect(result.returnSessionToken.consumed).toBe(true);

      // Verify exact 5-field atomic query
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          _id: transactionId,
          userId,
          paypalOrderId,
          'returnSessionToken.tokenHash': tokenHash,
          'returnSessionToken.consumed': false,
          'returnSessionToken.expiresAt': { $gt: now }
        },
        {
          $set: {
            'returnSessionToken.consumed': true,
            'returnSessionToken.consumedAt': now
          }
        },
        {
          new: true,
          runValidators: true
        }
      );
    });

    it('throws generic 401 INVALID_OR_EXPIRED_RETURN_TOKEN on failure (prevents enumeration)', async () => {
      // Returns null when query condition (hash, unconsumed, unexpired, user, order) fails
      vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockResolvedValueOnce(null);

      try {
        await repository.consumeReturnToken({
          returnToken: rawToken,
          transactionId,
          userId,
          paypalOrderId,
          now
        });
        expect.fail('Should have thrown InvalidReturnTokenError');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidReturnTokenError);
        expect(err.code).toBe('INVALID_OR_EXPIRED_RETURN_TOKEN');
        expect(err.statusCode).toBe(401);
      }
    });

    it('rejects missing parameters with generic 401 error', async () => {
      await expect(
        repository.consumeReturnToken({
          returnToken: '',
          transactionId,
          userId,
          paypalOrderId
        })
      ).rejects.toThrow(InvalidReturnTokenError);
    });
  });

  describe('claimCaptureLease (SEC-06 & SEC-10)', () => {
    const transactionId = new mongoose.Types.ObjectId();
    const attemptId = 'att_claim_123';
    const now = new Date('2026-11-10T12:00:00Z');

    it('claims lease on CREATED transaction and increments attemptVersion', async () => {
      const mockClaimed = {
        _id: transactionId,
        status: 'CAPTURING',
        attemptVersion: 1,
        captureAttemptId: attemptId,
        leaseOwner: 'worker_1',
        leaseExpiresAt: new Date(now.getTime() + 15000)
      };

      const findOneAndUpdateSpy = vi
        .spyOn(PaymentTransaction, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockClaimed);

      const result = await repository.claimCaptureLease({
        transactionId,
        attemptId,
        leaseDurationMs: 15000,
        workerId: 'worker_1',
        now
      });

      expect(result).toBe(mockClaimed);
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          _id: transactionId,
          $or: [
            { status: { $in: ['CREATED', 'APPROVED_BY_USER'] } },
            { status: 'CAPTURING', leaseExpiresAt: { $lt: now } }
          ]
        },
        {
          $set: {
            status: 'CAPTURING',
            captureAttemptId: attemptId,
            leaseOwner: 'worker_1',
            leaseExpiresAt: new Date(now.getTime() + 15000),
            capturingStartedAt: now
          },
          $inc: { attemptVersion: 1 }
        },
        {
          new: true,
          runValidators: true
        }
      );
    });

    it('returns null if lease claim fails (e.g. concurrent active lease)', async () => {
      vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockResolvedValueOnce(null);

      const result = await repository.claimCaptureLease({
        transactionId,
        attemptId,
        now
      });

      expect(result).toBeNull();
    });
  });

  describe('settleCapture (SEC-10 Fencing Token Verification)', () => {
    const transactionId = new mongoose.Types.ObjectId();
    const attemptId = 'att_settle_456';
    const now = new Date('2026-11-10T12:00:00Z');

    it('settles capture when attemptVersion matches fencing token', async () => {
      const mockSettled = {
        _id: transactionId,
        status: 'COMPLETED',
        paypalCaptureId: 'CAP_SUCCESS_999',
        settledAt: now
      };

      const findOneAndUpdateSpy = vi
        .spyOn(PaymentTransaction, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockSettled);

      const result = await repository.settleCapture({
        transactionId,
        attemptId,
        attemptVersion: 1,
        paypalCaptureId: 'CAP_SUCCESS_999',
        payerEmail: 'buyer@example.com',
        sellerProtectionStatus: 'ELIGIBLE',
        now
      });

      expect(result).toBe(mockSettled);
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          _id: transactionId,
          captureAttemptId: attemptId,
          attemptVersion: 1,
          status: 'CAPTURING'
        },
        {
          $set: {
            status: 'COMPLETED',
            paypalCaptureId: 'CAP_SUCCESS_999',
            payerEmail: 'buyer@example.com',
            sellerProtectionStatus: 'ELIGIBLE',
            settledAt: now
          }
        },
        {
          new: true,
          runValidators: true
        }
      );
    });

    it('returns null if fencing token does not match (stale worker rejected)', async () => {
      vi.spyOn(PaymentTransaction, 'findOneAndUpdate').mockResolvedValueOnce(null);

      const result = await repository.settleCapture({
        transactionId,
        attemptId,
        attemptVersion: 1, // Stale version
        paypalCaptureId: 'CAP_LATE_ARRIVING',
        now
      });

      expect(result).toBeNull();
    });
  });
});
