import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/models/User.model.js';
import { AuthorizationRecord } from '../../src/models/AuthorizationRecord.model.js';
import { AuditLog } from '../../src/models/AuditLog.model.js';
import { authorizationRepository } from '../../src/repositories/AuthorizationRepository.js';
import { paymentTransactionRepository } from '../../src/repositories/PaymentTransactionRepository.js';
import { PayPalService } from '../../src/services/PayPalService.js';
import {
  generateCsrfToken,
  generateEd25519KeyPair,
  signEd25519,
  generateNonce
} from '../../src/utils/cryptoUtils.js';
import { hashCanonicalJson } from '../../src/utils/canonicalJson.js';
import { trustedKeyRegistry } from '../../src/services/TrustedKeyRegistry.js';
import { dispatchRequest } from '../helpers/testClient.js';

describe('Stage 3 Security Remediation: SEC-03, SEC-04, SEC-05, SEC-06, SEC-10', () => {
  let userA;
  let userB;
  let sessionCookieA;
  let sessionCookieB;
  let csrfTokenA;
  let csrfTokenB;
  let keyPair;
  let authRecordA;
  let payPalService;

  function prepareCaptureFixture(tx) {
    tx.proposalId ??= authRecordA.proposalId;
    tx.minorUnitExponent ??= authRecordA.minorUnitExponent ?? 2;
    tx.idempotencyKey ??= `test_capture_${tx.paypalOrderId || 'order'}`;
    authRecordA.status = 'IN_FLIGHT';
    authRecordA.idempotencyKey = tx.idempotencyKey;
  }

  function approvedPayPalOrder(id) {
    return {
      id,
      status: 'APPROVED',
      purchase_units: [{
        amount: { currency_code: authRecordA.currency, value: '117.90' },
        payee: { merchant_id: authRecordA.paypalMerchantId }
      }]
    };
  }

  function completedPayPalOrder(id, captureId) {
    return {
      id,
      status: 'COMPLETED',
      purchase_units: [{
        amount: { currency_code: authRecordA.currency, value: '117.90' },
        payee: { merchant_id: authRecordA.paypalMerchantId },
        payments: {
          captures: [{
            id: captureId,
            status: 'COMPLETED',
            amount: { currency_code: authRecordA.currency, value: '117.90' }
          }]
        }
      }],
      payer: { email_address: 'buyer@sandbox.paypal.com' }
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    payPalService = new PayPalService();

    // User A Setup
    const userAId = new mongoose.Types.ObjectId();
    userA = {
      _id: userAId,
      email: 'buyer.a@example.com',
      name: 'Buyer A',
      role: 'USER',
      isActive: true,
      sessionVersion: 1
    };

    const tokenA = jwt.sign(
      { sub: userAId.toString(), email: userA.email, sessionVersion: 1 },
      env.SESSION_SECRET
    );
    sessionCookieA = { [env.COOKIE_NAME]: tokenA };
    csrfTokenA = generateCsrfToken({
      userId: userAId.toString(),
      sessionVersion: 1,
      secret: env.CSRF_SECRET
    });

    // User B Setup
    const userBId = new mongoose.Types.ObjectId();
    userB = {
      _id: userBId,
      email: 'attacker.b@example.com',
      name: 'Attacker B',
      role: 'USER',
      isActive: true,
      sessionVersion: 1
    };

    const tokenB = jwt.sign(
      { sub: userBId.toString(), email: userB.email, sessionVersion: 1 },
      env.SESSION_SECRET
    );
    sessionCookieB = { [env.COOKIE_NAME]: tokenB };
    csrfTokenB = generateCsrfToken({
      userId: userBId.toString(),
      sessionVersion: 1,
      secret: env.CSRF_SECRET
    });

    vi.spyOn(User, 'findById').mockImplementation(async (id) => {
      if (id.toString() === userAId.toString()) return userA;
      if (id.toString() === userBId.toString()) return userB;
      return null;
    });

    // Key Registry & Valid Authorization Record for User A
    keyPair = generateEd25519KeyPair();
    const nonce = generateNonce(32);
    const authorizationId = `auth_${generateNonce(8)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 300000);

    const canonicalPayload = {
      authorizationId,
      intentId: 'int_stage3_001',
      intentVersion: 1,
      proposalId: 'prop_stage3_001',
      snapshotId: 'snap_stage3_001',
      snapshotHash: 'a'.repeat(64),
      userId: userAId.toString(),
      paypalMerchantId: 'MERCHANT_PPM_001',
      totalPriceMinor: '11790',
      currency: 'USD',
      nonce,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      authMode: 'LIVE_FIREWALL'
    };

    const canonicalJsonHash = hashCanonicalJson(canonicalPayload);
    const signature = signEd25519(canonicalJsonHash, keyPair.privateKey);

    trustedKeyRegistry.registerKey({
      keyId: env.ED25519_KEY_ID,
      publicKeyHex: keyPair.publicKeyHex,
      status: 'ACTIVE'
    });

    authRecordA = {
      _id: new mongoose.Types.ObjectId(),
      authorizationId,
      intentId: 'int_stage3_001',
      intentVersion: 1,
      proposalId: 'prop_stage3_001',
      snapshotId: 'snap_stage3_001',
      issuedAt: now,
      keyId: env.ED25519_KEY_ID,
      nonce,
      userId: userAId,
      snapshotHash: 'a'.repeat(64),
      authorizedAmountMinor: 11790n,
      currency: 'USD',
      minorUnitExponent: 2,
      paypalMerchantId: 'MERCHANT_PPM_001',
      canonicalJsonHash,
      signature,
      publicKey: keyPair.publicKeyHex,
      authMode: 'LIVE_FIREWALL',
      status: 'PENDING',
      expiresAt
    };

    vi.spyOn(AuditLog, 'create').mockResolvedValue({});
  });

  // ===========================================================================
  // SEC-03: 3-Gate Buyer Consent Verification
  // ===========================================================================
  describe('SEC-03: Server-Enforced Buyer Consent Lifecycle (3 Gates)', () => {
    it('Gate 3: Rejects capture when userConsent is missing from request body', async () => {
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        cookies: sessionCookieA,
        headers: {
          'x-csrf-token': csrfTokenA,
          'idempotency-key': 'idem_consent_missing'
        },
        body: {
          orderId: 'ORDER_CONSENT_1',
          authorizationId: authRecordA.authorizationId
          // userConsent missing
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Gate 3: Rejects capture when userConsent is explicitly false', async () => {
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        cookies: sessionCookieA,
        headers: {
          'x-csrf-token': csrfTokenA,
          'idempotency-key': 'idem_consent_false'
        },
        body: {
          orderId: 'ORDER_CONSENT_2',
          authorizationId: authRecordA.authorizationId,
          userConsent: false
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Gate 3 Invariant: Possession of bearer challenge/token alone cannot bypass user consent', async () => {
      // Even if attacker possesses an HMAC or challenge token, missing userConsent must fail
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        cookies: sessionCookieA,
        headers: {
          'x-csrf-token': csrfTokenA,
          'idempotency-key': 'idem_challenge_only'
        },
        body: {
          orderId: 'ORDER_CONSENT_3',
          authorizationId: authRecordA.authorizationId,
          confirmationChallenge: 'hmac_bearer_token_abc123'
          // no userConsent: true
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('Gate 3: Service-level check throws BUYER_CONFIRMATION_REQUIRED if userConsent !== true', async () => {
      await expect(
        payPalService.captureOrder({
          orderId: 'ORDER_DIRECT_1',
          authorizationId: authRecordA.authorizationId,
          userId: userA._id,
          userConsent: false,
          idempotencyKey: 'idem_svc_gate3'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'BUYER_CONFIRMATION_REQUIRED',
          statusCode: 400
        })
      );
    });

    it('Gate 2: Rejects capture when PayPal order is not in APPROVED state', async () => {
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_NOT_YET_APPROVED',
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD'
      };

      prepareCaptureFixture(mockTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);

      // Mock live PayPal mode
      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getOrderDetails').mockResolvedValue({
        id: 'ORDER_NOT_YET_APPROVED',
        status: 'CREATED' // Not APPROVED
      });

      await expect(
        payPalService.captureOrder({
          orderId: 'ORDER_NOT_YET_APPROVED',
          authorizationId: authRecordA.authorizationId,
          userId: userA._id,
          userConsent: true,
          idempotencyKey: 'idem_gate2_check'
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'ORDER_NOT_APPROVED',
          statusCode: 400
        })
      );
    });
  });

  // ===========================================================================
  // SEC-04: User-Scoped Idempotency & Transaction Isolation
  // ===========================================================================
  describe('SEC-04: User-Scoped Idempotency & Cross-User Isolation', () => {
    it('Order Creation: Rejects cross-user collision with 403 IDEMPOTENCY_USER_MISMATCH', async () => {
      const sharedIdempotencyKey = 'shared_idem_key_403';
      const existingTxOfUserA = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        paypalOrderId: 'PAYPAL_ORDER_USER_A',
        idempotencyKey: sharedIdempotencyKey,
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD'
      };

      // Mock transaction already exists for User A
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(existingTxOfUserA);
      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValue(authRecordA);

      // User B attempts to create an order using User A's idempotency key
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookieB, // Authenticated as User B
        headers: {
          'x-csrf-token': csrfTokenB,
          'idempotency-key': sharedIdempotencyKey
        },
        body: {
          authorizationId: authRecordA.authorizationId,
          proposalId: authRecordA.proposalId,
          userConsent: true
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('IDEMPOTENCY_USER_MISMATCH');
      // Invariant: Response must NOT disclose User A's paypalOrderId or details
      expect(res.body.data).toBeUndefined();
    });

    it('Order Creation: Same user retrying with same Idempotency-Key returns existing order', async () => {
      const idempotencyKey = 'user_a_own_idem_key';
      const existingTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        paypalOrderId: 'PAYPAL_ORDER_REPLAY_SAFE',
        idempotencyKey,
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD',
        approvalUrl: 'https://sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_REPLAY_SAFE',
        authorizationId: authRecordA._id,
        proposalId: authRecordA.proposalId,
        minorUnitExponent: authRecordA.minorUnitExponent
      };
      authRecordA.status = 'IN_FLIGHT';
      authRecordA.idempotencyKey = idempotencyKey;
      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValue(authRecordA);

      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(existingTx);

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookieA, // User A themselves
        headers: {
          'x-csrf-token': csrfTokenA,
          'idempotency-key': idempotencyKey
        },
        body: {
          authorizationId: authRecordA.authorizationId,
          proposalId: authRecordA.proposalId,
          userConsent: true
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.data.orderId).toBe('PAYPAL_ORDER_REPLAY_SAFE');
      expect(res.body.data.status).toBe('CREATED');
    });

    it('Order Capture: Rejects cross-user capture attempt with 403 USER_MISMATCH', async () => {
      const mockTxOfUserA = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id, // Owned by User A
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_USER_A_PRIVATE',
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD'
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTxOfUserA);

      // User B attempts to capture User A's order
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        cookies: sessionCookieB, // Attacker B
        headers: {
          'x-csrf-token': csrfTokenB,
          'idempotency-key': 'attacker_idem_key'
        },
        body: {
          orderId: 'ORDER_USER_A_PRIVATE',
          authorizationId: authRecordA.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('USER_MISMATCH');
    });
  });

  // ===========================================================================
  // SEC-05: Strict Capture Response Settlement & Monetary Validation
  // ===========================================================================
  describe('SEC-05: Capture Response Settlement & Monetary Validation', () => {
    const baseTx = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      currency: 'USD',
      amountMinor: 11790n,
      minorUnitExponent: 2
    };

    it('Rejects capture response when status is FAILED', () => {
      const captureObj = {
        id: 'CAP_FAILED_001',
        status: 'FAILED',
        amount: { currency_code: 'USD', value: '117.90' }
      };

      expect(() => {
        payPalService.validateCaptureResponse(captureObj, baseTx);
      }).toThrow(
        expect.objectContaining({
          code: 'INVALID_CAPTURE_STATUS',
          statusCode: 422
        })
      );
    });

    it('Rejects capture response when status is PENDING', () => {
      const captureObj = {
        id: 'CAP_PENDING_001',
        status: 'PENDING',
        amount: { currency_code: 'USD', value: '117.90' }
      };

      expect(() => {
        payPalService.validateCaptureResponse(captureObj, baseTx);
      }).toThrow(
        expect.objectContaining({
          code: 'INVALID_CAPTURE_STATUS',
          statusCode: 422
        })
      );
    });

    it('Rejects capture response when currency does not match authorized currency', () => {
      const captureObj = {
        id: 'CAP_EUR_001',
        status: 'COMPLETED',
        amount: { currency_code: 'EUR', value: '117.90' } // Authorized is USD
      };

      expect(() => {
        payPalService.validateCaptureResponse(captureObj, baseTx);
      }).toThrow(
        expect.objectContaining({
          code: 'CAPTURE_CURRENCY_MISMATCH',
          statusCode: 422
        })
      );
    });

    it('Rejects capture response when amount is higher than authorized', () => {
      const captureObj = {
        id: 'CAP_AMOUNT_HIGH',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '120.00' } // Authorized is 117.90
      };

      expect(() => {
        payPalService.validateCaptureResponse(captureObj, baseTx);
      }).toThrow(
        expect.objectContaining({
          code: 'CAPTURE_AMOUNT_MISMATCH',
          statusCode: 422
        })
      );
    });

    it('Rejects capture response when amount is lower than authorized', () => {
      const captureObj = {
        id: 'CAP_AMOUNT_LOW',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '100.00' } // Authorized is 117.90
      };

      expect(() => {
        payPalService.validateCaptureResponse(captureObj, baseTx);
      }).toThrow(
        expect.objectContaining({
          code: 'CAPTURE_AMOUNT_MISMATCH',
          statusCode: 422
        })
      );
    });

    it('Rejects capture response when capture object is null or missing', () => {
      expect(() => {
        payPalService.validateCaptureResponse(null, baseTx);
      }).toThrow(
        expect.objectContaining({
          code: 'MALFORMED_CAPTURE_RESPONSE',
          statusCode: 502
        })
      );
    });

    it('Rejects capture response when amount value string is missing', () => {
      const captureObj = {
        id: 'CAP_NO_VALUE',
        status: 'COMPLETED',
        amount: { currency_code: 'USD' }
      };

      expect(() => {
        payPalService.validateCaptureResponse(captureObj, baseTx);
      }).toThrow(
        expect.objectContaining({
          code: 'MALFORMED_CAPTURE_RESPONSE',
          statusCode: 502
        })
      );
    });

    it('Accepts valid capture response with exact BigInt minor unit match', () => {
      const captureObj = {
        id: 'CAP_VALID_001',
        status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '117.90' }
      };

      expect(() => {
        payPalService.validateCaptureResponse(captureObj, baseTx);
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // SEC-06 & SEC-10: State Machine, Capture Leases, and Fencing Tokens
  // ===========================================================================
  describe('SEC-06 & SEC-10: State Machine, Capture Leases & Monotonic Fencing Tokens', () => {
    it('Concurrent Capture: Rejects second attempt with 409 CAPTURE_IN_PROGRESS while lease is active', async () => {
      const now = new Date();
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_CONCURRENT_LEASE',
        status: 'CAPTURING',
        idempotencyKey: 'idem_worker_1',
        leaseExpiresAt: new Date(now.getTime() + 10000), // Active lease
        amountMinor: 11790n,
        currency: 'USD'
      };

      prepareCaptureFixture(mockTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);
      // Simulate claim returning null because another worker holds the active lease
      vi.spyOn(paymentTransactionRepository, 'claimCaptureLease').mockResolvedValue(null);
      vi.spyOn(paymentTransactionRepository, 'findById').mockResolvedValue(mockTx);

      await expect(
        payPalService.captureOrder({
          orderId: 'ORDER_CONCURRENT_LEASE',
          authorizationId: authRecordA.authorizationId,
          userId: userA._id,
          userConsent: true,
          idempotencyKey: 'idem_worker_2',
          now
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'CAPTURE_IN_PROGRESS',
          statusCode: 409
        })
      );
    });

    it('Stale Worker Fencing Token: Rejects stale worker write with 409 FENCING_TOKEN_EXPIRED', async () => {
      const now = new Date();
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_STALE_WORKER',
        idempotencyKey: 'idem_stale_worker_1',
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD'
      };

      prepareCaptureFixture(mockTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);

      // Worker claims lease with version 1
      const claimedTx = {
        ...mockTx,
        status: 'CAPTURING',
        attemptVersion: 1,
        captureAttemptId: 'att_worker_1'
      };
      vi.spyOn(paymentTransactionRepository, 'claimCaptureLease').mockResolvedValue(claimedTx);

      // Simulate settleCapture returning null because fencing token in DB was incremented by Worker 2
      vi.spyOn(paymentTransactionRepository, 'settleCapture').mockResolvedValue(null);

      await expect(
        payPalService.captureOrder({
          orderId: 'ORDER_STALE_WORKER',
          authorizationId: authRecordA.authorizationId,
          userId: userA._id,
          userConsent: true,
          idempotencyKey: 'idem_stale_worker_1',
          now
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FENCING_TOKEN_EXPIRED',
          statusCode: 409
        })
      );
    });

    it('Pre-retry External Reconciliation: Reconciles completed PayPal order when acquiredVersion > 1 without re-capturing', async () => {
      const now = new Date();
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_RECOVERED_EXTERNALLY',
        status: 'CAPTURING',
        amountMinor: 11790n,
        currency: 'USD',
        idempotencyKey: 'idem_retry_recon'
      };

      prepareCaptureFixture(mockTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);

      // Reclaimed lease: acquiredVersion is 2 (previous worker timed out)
      const reclaimedTx = {
        ...mockTx,
        attemptVersion: 2,
        captureAttemptId: 'att_worker_2'
      };
      vi.spyOn(paymentTransactionRepository, 'claimCaptureLease').mockResolvedValue(reclaimedTx);

      // Live mode check
      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('MOCK_TEST_TOKEN');
      vi.spyOn(payPalService, 'getOrderDetails')
        .mockResolvedValue(completedPayPalOrder('ORDER_RECOVERED_EXTERNALLY', 'CAP_ALREADY_CAPTURED_BY_PRIOR_WORKER'));

      const settleSpy = vi.spyOn(paymentTransactionRepository, 'settleCapture').mockResolvedValue({
        _id: mockTx._id,
        status: 'COMPLETED'
      });
      const markConsumedSpy = vi.spyOn(authorizationRepository, 'markConsumed').mockResolvedValue({});

      const result = await payPalService.captureOrder({
        orderId: 'ORDER_RECOVERED_EXTERNALLY',
        authorizationId: authRecordA.authorizationId,
        userId: userA._id,
        userConsent: true,
        idempotencyKey: 'idem_retry_recon',
        now
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.captureId).toBe('CAP_ALREADY_CAPTURED_BY_PRIOR_WORKER');
      expect(settleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          paypalCaptureId: 'CAP_ALREADY_CAPTURED_BY_PRIOR_WORKER',
          attemptVersion: 2
        })
      );
      expect(markConsumedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: authRecordA.nonce
        })
      );
    });

    it('Idempotent Recovery: Repeated capture on COMPLETED transaction returns settled details safely', async () => {
      const now = new Date('2026-11-09T10:00:00Z');
      const mockCompletedTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_ALREADY_SETTLED',
        paypalCaptureId: 'CAP_SETTLED_PRIOR',
        status: 'COMPLETED',
        amountMinor: 11790n,
        currency: 'USD',
        payerEmail: 'buyer.a@example.com',
        settledAt: now
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockCompletedTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);
      const claimSpy = vi.spyOn(paymentTransactionRepository, 'claimCaptureLease');

      const result = await payPalService.captureOrder({
        orderId: 'ORDER_ALREADY_SETTLED',
        authorizationId: authRecordA.authorizationId,
        userId: userA._id,
        userConsent: true,
        idempotencyKey: 'idem_repeat_call'
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.captureId).toBe('CAP_SETTLED_PRIOR');
      expect(result.payerEmail).toBe('buyer.a@example.com');
      // Invariant: Do not re-claim lease or re-invoke capture
      expect(claimSpy).not.toHaveBeenCalled();
    });

    it('Pre-dispatch Fencing: Worker that loses lease before dispatch is blocked from calling PayPal', async () => {
      const now = new Date();
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_PRE_DISPATCH_TIMEOUT',
        idempotencyKey: 'idem_predispatch',
        status: 'CAPTURING',
        amountMinor: 11790n,
        currency: 'USD'
      };

      prepareCaptureFixture(mockTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);

      // Claimed lease, but lease expires in 1ms
      const claimedTx = {
        ...mockTx,
        attemptVersion: 1,
        captureAttemptId: 'att_stale_before_call',
        leaseExpiresAt: new Date(now.getTime() - 1000) // Already expired
      };
      vi.spyOn(paymentTransactionRepository, 'claimCaptureLease').mockResolvedValue(claimedTx);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await expect(
        payPalService.captureOrder({
          orderId: 'ORDER_PRE_DISPATCH_TIMEOUT',
          authorizationId: authRecordA.authorizationId,
          userId: userA._id,
          userConsent: true,
          idempotencyKey: 'idem_predispatch_stale',
          now
        })
      ).rejects.toThrow(
        expect.objectContaining({
          code: 'FENCING_TOKEN_EXPIRED',
          statusCode: 409
        })
      );

      // Crucial security invariant: Stale worker NEVER invoked external PayPal API
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Deterministic PayPal-Request-Id: Every capture attempt uses stable deterministic PayPal-Request-Id for same order', async () => {
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_STABLE_REQUEST_ID',
        paypalRequestId: 'cap_ORDER_STABLE_REQUEST_ID',
        idempotencyKey: 'idem_stable_req_id',
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD'
      };

      prepareCaptureFixture(mockTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);

      const claimedTx = {
        ...mockTx,
        status: 'CAPTURING',
        attemptVersion: 1,
        captureAttemptId: 'att_stable_1',
        leaseExpiresAt: new Date(Date.now() + 15000)
      };
      vi.spyOn(paymentTransactionRepository, 'claimCaptureLease').mockResolvedValue(claimedTx);
      vi.spyOn(paymentTransactionRepository, 'settleCapture').mockResolvedValue({ ...mockTx, status: 'COMPLETED' });
      vi.spyOn(authorizationRepository, 'markConsumed').mockResolvedValue({});

      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getOrderDetails').mockResolvedValue(approvedPayPalOrder('ORDER_STABLE_REQUEST_ID'));
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('MOCK_ACCESS_TOKEN');

      let capturedHeaders = null;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts) => {
        capturedHeaders = opts.headers;
        return {
          ok: true,
          status: 200,
          json: async () => completedPayPalOrder('ORDER_STABLE_REQUEST_ID', 'CAP_STABLE_1')
        };
      });

      await payPalService.captureOrder({
        orderId: 'ORDER_STABLE_REQUEST_ID',
        authorizationId: authRecordA.authorizationId,
        userId: userA._id,
        userConsent: true,
        idempotencyKey: 'idem_stable_req_id'
      });

      expect(capturedHeaders['PayPal-Request-Id']).toMatch(/^c_[a-f0-9]{32}$/);
    });

    it('Crash recovery: PayPal 422 ORDER_ALREADY_CAPTURED triggers safe reconciliation without failing', async () => {
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: userA._id,
        authorizationId: authRecordA._id,
        paypalOrderId: 'ORDER_CRASH_RECOVERY_422',
        paypalRequestId: 'cap_ORDER_CRASH_RECOVERY_422',
        idempotencyKey: 'idem_422_recovery',
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD'
      };

      prepareCaptureFixture(mockTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordA);

      const claimedTx = {
        ...mockTx,
        status: 'CAPTURING',
        attemptVersion: 1,
        captureAttemptId: 'att_recovery_422',
        leaseExpiresAt: new Date(Date.now() + 15000)
      };
      vi.spyOn(paymentTransactionRepository, 'claimCaptureLease').mockResolvedValue(claimedTx);
      vi.spyOn(paymentTransactionRepository, 'settleCapture').mockResolvedValue({ ...mockTx, status: 'COMPLETED' });
      vi.spyOn(authorizationRepository, 'markConsumed').mockResolvedValue({});

      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('MOCK_ACCESS_TOKEN');

      // Gate 2 says APPROVED initially
      vi.spyOn(payPalService, 'getOrderDetails')
        .mockResolvedValueOnce(approvedPayPalOrder('ORDER_CRASH_RECOVERY_422'))
        // Second call upon 422 recovers completed order
        .mockResolvedValueOnce(completedPayPalOrder('ORDER_CRASH_RECOVERY_422', 'CAP_RECONCILED_FROM_422'));

      // Fetch /capture returns 422 UNPROCESSABLE_ENTITY with ORDER_ALREADY_CAPTURED
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          name: 'UNPROCESSABLE_ENTITY',
          details: [{ issue: 'ORDER_ALREADY_CAPTURED', description: 'Order has already been captured.' }]
        })
      });

      const result = await payPalService.captureOrder({
        orderId: 'ORDER_CRASH_RECOVERY_422',
        authorizationId: authRecordA.authorizationId,
        userId: userA._id,
        userConsent: true,
        idempotencyKey: 'idem_422_recovery'
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.captureId).toBe('CAP_RECONCILED_FROM_422');
    });
  });
});
