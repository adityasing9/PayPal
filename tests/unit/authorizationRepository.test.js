import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import {
  AuthorizationRepository,
  AuthorizationNotFoundError,
  DuplicateNonceError,
  AuthorizationConflictError,
  AuthorizationAlreadyConsumedError,
  AuthorizationExpiredError,
  SnapshotMismatchError,
  AuthorizationUserMismatchError,
  InvalidAuthorizationStateError
} from '../../src/repositories/AuthorizationRepository.js';
import { AuthorizationRecord } from '../../src/models/index.js';

describe('Step 2.4.2: AuthorizationRepository (Atomic Nonce Management)', () => {
  let repository;

  beforeEach(() => {
    vi.restoreAllMocks();
    repository = new AuthorizationRepository();
  });

  describe('createAuthorization', () => {
    it('successfully saves a new authorization record in PENDING state', async () => {
      const mockRecordData = {
        authorizationId: 'auth_test_123',
        paypalMerchantId: 'PPM_TEST_123',
        snapshotId: new mongoose.Types.ObjectId(),
        issuedAt: new Date(),
        proposalId: new mongoose.Types.ObjectId(),
        intentId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        snapshotHash: 'a'.repeat(64),
        algorithm: 'Ed25519',
        publicKey: 'pub_test',
        nonce: 'nonce_123',
        canonicalJsonHash: 'b'.repeat(64),
        authorizedAmountMinor: 11790n,
        signature: 'sig_test',
        expiresAt: new Date(Date.now() + 300000)
      };

      vi.spyOn(AuthorizationRecord.prototype, 'save').mockResolvedValueOnce({
        ...mockRecordData,
        status: 'PENDING',
        _id: new mongoose.Types.ObjectId()
      });

      const result = await repository.createAuthorization(mockRecordData);
      expect(result.status).toBe('PENDING');
      expect(result.nonce).toBe('nonce_123');
      expect(result.authorizationId).toBe('auth_test_123');
    });

    it('throws DuplicateNonceError when nonce already exists (E11000)', async () => {
      const duplicateErr = new Error('Duplicate key error');
      duplicateErr.code = 11000;

      vi.spyOn(AuthorizationRecord.prototype, 'save').mockRejectedValueOnce(duplicateErr);

      await expect(
        repository.createAuthorization({ nonce: 'duplicate_nonce' })
      ).rejects.toThrow(DuplicateNonceError);
    });
  });

  describe('findByAuthorizationId', () => {
    it('returns null if authorizationId is falsy', async () => {
      const result = await repository.findByAuthorizationId(null);
      expect(result).toBeNull();
    });

    it('queries by MongoDB _id and authorizationId string', async () => {
      const mockDoc = { authorizationId: 'auth_custom_string' };
      const findOneSpy = vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce(mockDoc);

      const result = await repository.findByAuthorizationId('auth_custom_string');
      expect(result).toEqual(mockDoc);
      expect(findOneSpy).toHaveBeenCalledWith({
        $or: [{ _id: null }, { authorizationId: 'auth_custom_string' }]
      });
    });

    it('queries with valid 24-hex ObjectId in _id branch', async () => {
      const hex24 = '672d1a2b8e34f190ab78c0aa';
      const mockDoc = { _id: hex24, authorizationId: 'auth_abc' };
      const findOneSpy = vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce(mockDoc);

      const result = await repository.findByAuthorizationId(hex24);
      expect(result).toEqual(mockDoc);
      expect(findOneSpy).toHaveBeenCalledWith({
        $or: [{ _id: hex24 }, { authorizationId: hex24 }]
      });
    });
  });

  describe('claimNonce (Atomic Conditional Operation)', () => {
    const validParams = {
      nonce: 'nonce_claim_test',
      userId: new mongoose.Types.ObjectId(),
      idempotencyKey: 'idem_key_uuid',
      expectedSnapshotHash: 's'.repeat(64),
      now: new Date('2026-11-08T12:00:00Z')
    };

    it('claims nonce atomically: transitions PENDING to IN_FLIGHT with idempotencyKey', async () => {
      const mockUpdated = {
        nonce: validParams.nonce,
        userId: validParams.userId,
        status: 'IN_FLIGHT',
        idempotencyKey: validParams.idempotencyKey,
        inFlightStartedAt: validParams.now
      };

      const findOneAndUpdateSpy = vi
        .spyOn(AuthorizationRecord, 'findOneAndUpdate')
        .mockResolvedValueOnce(mockUpdated);

      const result = await repository.claimNonce(validParams);
      expect(result.status).toBe('IN_FLIGHT');
      expect(result.idempotencyKey).toBe(validParams.idempotencyKey);

      // Verify atomic query structure: condition must include nonce, userId, status, unexpired, snapshotHash
      expect(findOneAndUpdateSpy).toHaveBeenCalledWith(
        {
          nonce: validParams.nonce,
          userId: validParams.userId,
          status: 'PENDING',
          expiresAt: { $gt: validParams.now },
          snapshotHash: validParams.expectedSnapshotHash
        },
        {
          $set: {
            status: 'IN_FLIGHT',
            idempotencyKey: validParams.idempotencyKey,
            inFlightStartedAt: validParams.now
          }
        },
        {
          new: true,
          runValidators: true
        }
      );
    });

    it('supports idempotent retry: returns existing record if already IN_FLIGHT with same idempotencyKey', async () => {
      // findOneAndUpdate returns null (not in PENDING)
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);

      // findOne returns document that is already IN_FLIGHT with matching idempotencyKey
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: validParams.nonce,
        status: 'IN_FLIGHT',
        idempotencyKey: validParams.idempotencyKey
      });

      const result = await repository.claimNonce(validParams);
      expect(result.status).toBe('IN_FLIGHT');
      expect(result.idempotencyKey).toBe(validParams.idempotencyKey);
    });

    it('throws AuthorizationNotFoundError if nonce does not exist', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce(null);

      await expect(repository.claimNonce(validParams)).rejects.toThrow(
        AuthorizationNotFoundError
      );
    });

    it('rejects claim if already IN_FLIGHT under a different idempotencyKey (AuthorizationConflictError)', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: validParams.nonce,
        status: 'IN_FLIGHT',
        idempotencyKey: 'different_idempotency_key'
      });

      await expect(repository.claimNonce(validParams)).rejects.toThrow(
        AuthorizationConflictError
      );
    });

    it('rejects claim if nonce is already CONSUMED (AuthorizationAlreadyConsumedError)', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: validParams.nonce,
        status: 'CONSUMED'
      });

      await expect(repository.claimNonce(validParams)).rejects.toThrow(
        AuthorizationAlreadyConsumedError
      );
    });

    it('rejects claim if authorization validity has expired (AuthorizationExpiredError)', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: validParams.nonce,
        status: 'PENDING',
        expiresAt: new Date(validParams.now.getTime() - 1000) // 1 second in the past
      });

      await expect(repository.claimNonce(validParams)).rejects.toThrow(
        AuthorizationExpiredError
      );
    });

    it('rejects claim if snapshot hash does not match (SnapshotMismatchError)', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: validParams.nonce,
        status: 'PENDING',
        expiresAt: new Date(validParams.now.getTime() + 100000),
        snapshotHash: 'tampered_hash_value'
      });

      await expect(repository.claimNonce(validParams)).rejects.toThrow(SnapshotMismatchError);
    });

    it('rejects claim if userId does not match (AuthorizationUserMismatchError)', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: validParams.nonce,
        status: 'PENDING',
        expiresAt: new Date(validParams.now.getTime() + 100000),
        snapshotHash: validParams.expectedSnapshotHash,
        userId: new mongoose.Types.ObjectId() // Different user ID
      });

      await expect(repository.claimNonce(validParams)).rejects.toThrow(
        AuthorizationUserMismatchError
      );
    });
  });

  describe('markConsumed (IN_FLIGHT -> CONSUMED)', () => {
    it('atomically transitions IN_FLIGHT to CONSUMED with matching idempotencyKey', async () => {
      const mockConsumed = {
        nonce: 'nonce_consume_test',
        status: 'CONSUMED',
        idempotencyKey: 'idem_key_1',
        consumedAt: new Date()
      };

      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(mockConsumed);

      const result = await repository.markConsumed({
        nonce: 'nonce_consume_test',
        idempotencyKey: 'idem_key_1'
      });

      expect(result.status).toBe('CONSUMED');
    });

    it('idempotently returns already-consumed record if idempotencyKey matches', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: 'nonce_consume_test',
        status: 'CONSUMED',
        idempotencyKey: 'idem_key_1'
      });

      const result = await repository.markConsumed({
        nonce: 'nonce_consume_test',
        idempotencyKey: 'idem_key_1'
      });

      expect(result.status).toBe('CONSUMED');
    });

    it('throws InvalidAuthorizationStateError if record was not IN_FLIGHT', async () => {
      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(null);
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValueOnce({
        nonce: 'nonce_consume_test',
        status: 'PENDING',
        idempotencyKey: null
      });

      await expect(
        repository.markConsumed({
          nonce: 'nonce_consume_test',
          idempotencyKey: 'idem_key_1'
        })
      ).rejects.toThrow(InvalidAuthorizationStateError);
    });
  });

  describe('transitionToRecovering and transitionToFailedManualReview', () => {
    it('transitions IN_FLIGHT to RECOVERING during ambiguous network failure', async () => {
      const mockRecovering = {
        nonce: 'nonce_rec_test',
        status: 'RECOVERING',
        metadata: { recoveryReason: 'PAYPAL_TIMEOUT' }
      };

      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(mockRecovering);

      const result = await repository.transitionToRecovering({
        nonce: 'nonce_rec_test',
        idempotencyKey: 'idem_key_1',
        reason: 'PAYPAL_TIMEOUT'
      });

      expect(result.status).toBe('RECOVERING');
    });

    it('quarantines to FAILED_MANUAL_REVIEW permanently preserving diagnostics', async () => {
      const mockQuarantined = {
        nonce: 'nonce_failed_test',
        status: 'FAILED_MANUAL_REVIEW',
        metadata: { failureReason: 'EXCEEDED_6H_RETENTION_WINDOW' }
      };

      vi.spyOn(AuthorizationRecord, 'findOneAndUpdate').mockResolvedValueOnce(mockQuarantined);

      const result = await repository.transitionToFailedManualReview({
        nonce: 'nonce_failed_test',
        reason: 'EXCEEDED_6H_RETENTION_WINDOW',
        diagnostics: { attemptCount: 5 }
      });

      expect(result.status).toBe('FAILED_MANUAL_REVIEW');
    });
  });
});
