import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/models/User.model.js';
import { AuthorizationRecord } from '../../src/models/AuthorizationRecord.model.js';
import { WebhookEvent } from '../../src/models/WebhookEvent.model.js';
import { AuditLog } from '../../src/models/AuditLog.model.js';
import { PaymentIntent } from '../../src/models/PaymentIntent.model.js';
import { ProductProposal } from '../../src/models/ProductProposal.model.js';
import { CheckoutSnapshot } from '../../src/models/CheckoutSnapshot.model.js';
import { authorizationRepository } from '../../src/repositories/AuthorizationRepository.js';
import { paymentTransactionRepository } from '../../src/repositories/PaymentTransactionRepository.js';
import { payPalService } from '../../src/services/PayPalService.js';
import {
  generateCsrfToken,
  generateEd25519KeyPair,
  signEd25519,
  generateNonce,
  hashReturnToken
} from '../../src/utils/cryptoUtils.js';
import { computeSnapshotCanonicalHash, hashCanonicalJson } from '../../src/utils/canonicalJson.js';
import { dispatchRequest } from '../helpers/testClient.js';

describe('Step 2.5.6, 2.5.7, 2.5.8: PayPal Sandbox Orders, Return Flow & Webhooks', () => {
  let mockUser;
  let sessionCookie;
  let csrfToken;
  let keyPair;
  let mockAuthRecord;

  beforeEach(() => {
    vi.restoreAllMocks();

    const userId = new mongoose.Types.ObjectId();
    mockUser = {
      _id: userId,
      email: 'buyer@example.com',
      name: 'Buyer One',
      role: 'USER',
      isActive: true,
      sessionVersion: 1
    };

    const token = jwt.sign(
      { sub: userId.toString(), email: mockUser.email, sessionVersion: 1 },
      env.SESSION_SECRET
    );
    sessionCookie = { [env.COOKIE_NAME]: token };

    csrfToken = generateCsrfToken({
      userId: userId.toString(),
      sessionVersion: 1,
      secret: env.CSRF_SECRET
    });

    vi.spyOn(User, 'findById').mockResolvedValue(mockUser);

    // Setup valid Ed25519 keypair and authorization record
    keyPair = generateEd25519KeyPair();
    const nonce = generateNonce(32);
    const authorizationId = 'auth_' + generateNonce(8);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 300000);

    const canonicalPayload = {
      authorizationId,
      intentId: 'int_123',
      intentVersion: 1,
      proposalId: 'prop_456',
      snapshotId: 'snap_789',
      snapshotHash: 'c'.repeat(64),
      userId: userId.toString(),
      paypalMerchantId: 'PPM_KEYCHRON_998',
      totalPriceMinor: '11790',
      currency: 'USD',
      nonce,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      authMode: 'LIVE_FIREWALL'
    };

    const canonicalJsonHash = hashCanonicalJson(canonicalPayload);
    const signature = signEd25519(canonicalJsonHash, keyPair.privateKey);

    mockAuthRecord = {
      _id: new mongoose.Types.ObjectId(),
      authorizationId,
      intentId: 'int_123',
      intentVersion: 1,
      proposalId: 'prop_456',
      snapshotId: 'snap_789',
      issuedAt: now,
      nonce,
      userId,
      snapshotHash: 'c'.repeat(64),
      authorizedAmountMinor: 11790n,
      currency: 'USD',
      minorUnitExponent: 2,
      paypalMerchantId: 'PPM_KEYCHRON_998',
      canonicalJsonHash,
      signature,
      publicKey: keyPair.publicKeyHex,
      authMode: 'LIVE_FIREWALL',
      status: 'PENDING',
      expiresAt
    };

    vi.spyOn(AuditLog, 'create').mockResolvedValue({});
  });

  describe('1. PayPal Order Creation (POST /api/payments/create-order)', () => {
    it('rejects order creation if userConsent is not explicitly true', async () => {
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_001'
        },
        body: {
          proposalId: 'prop_456',
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: false // VIOLATION!
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects order creation if Idempotency-Key header is missing', async () => {
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken
        },
        body: {
          proposalId: 'prop_456',
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('rejects order creation if authorization is expired', async () => {
      const expiredRecord = {
        ...mockAuthRecord,
        expiresAt: new Date(Date.now() - 10000) // Expired 10s ago
      };
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(expiredRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      const claimNonceSpy = vi.spyOn(authorizationRepository, 'claimNonce');
      const createTransactionSpy = vi.spyOn(paymentTransactionRepository, 'createTransaction');

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_expired'
        },
        body: {
          proposalId: 'prop_456',
          authorizationId: expiredRecord.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTHORIZATION_EXPIRED');
      expect(claimNonceSpy).not.toHaveBeenCalled();
      expect(createTransactionSpy).not.toHaveBeenCalled();
    });

    it('rejects an invalid Ed25519 signature before claiming the nonce', async () => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue({
        ...mockAuthRecord,
        signature: 'invalid-signature'
      });
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      const claimNonceSpy = vi.spyOn(authorizationRepository, 'claimNonce');
      const createTransactionSpy = vi.spyOn(paymentTransactionRepository, 'createTransaction');

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_invalid_signature'
        },
        body: {
          proposalId: mockAuthRecord.proposalId,
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_AUTHORIZATION_SIGNATURE');
      expect(claimNonceSpy).not.toHaveBeenCalled();
      expect(createTransactionSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['amount', { currency_code: 'USD', value: '1.00' }, { merchant_id: 'PPM_KEYCHRON_998' }],
      ['merchant', { currency_code: 'USD', value: '117.90' }, { merchant_id: 'PPM_DELL_223' }]
    ])('rejects PayPal order response %s mismatch and moves authorization to recovery', async (_name, amount, payee) => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(mockAuthRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue({});
      const recoveringSpy = vi.spyOn(authorizationRepository, 'transitionToRecovering').mockResolvedValue({});
      const createTransactionSpy = vi.spyOn(paymentTransactionRepository, 'createTransaction');
      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('test-access-token');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: 'PAYPAL_ORDER_MISMATCH',
          status: 'CREATED',
          purchase_units: [{ amount, payee }]
        })
      });

      await expect(
        payPalService.createOrder({
          proposalId: mockAuthRecord.proposalId,
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true,
          userId: mockUser._id,
          idempotencyKey: `idem_paypal_mismatch_${_name}`
        })
      ).rejects.toMatchObject({ code: 'PAYPAL_ORDER_AUTHORIZATION_MISMATCH' });

      expect(recoveringSpy).toHaveBeenCalledOnce();
      expect(createTransactionSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['currency', { currency_code: 'EUR', value: '117.90' }, { merchant_id: 'PPM_KEYCHRON_998' }, 'CREATED', 'PAYPAL_ORDER_MISMATCH'],
      ['status', { currency_code: 'USD', value: '117.90' }, { merchant_id: 'PPM_KEYCHRON_998' }, 'APPROVED', 'PAYPAL_ORDER_MISMATCH'],
      ['order ID', { currency_code: 'USD', value: '117.90' }, { merchant_id: 'PPM_KEYCHRON_998' }, 'CREATED', 'invalid-id']
    ])('rejects PayPal response with mismatched %s', async (_name, amount, payee, status, id) => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(mockAuthRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue({});
      vi.spyOn(authorizationRepository, 'transitionToRecovering').mockResolvedValue({});
      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('test-access-token');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id,
          status,
          purchase_units: [{ amount, payee }]
        })
      });

      await expect(
        payPalService.createOrder({
          proposalId: mockAuthRecord.proposalId,
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true,
          userId: mockUser._id,
          idempotencyKey: `idem_paypal_response_${_name.replace(' ', '_')}`
        })
      ).rejects.toMatchObject({ code: 'PAYPAL_ORDER_AUTHORIZATION_MISMATCH' });
    });

    it('uses a bounded timeout and keeps ambiguous attempts retryable under the same authorization key', async () => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(mockAuthRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue({
        ...mockAuthRecord,
        status: 'IN_FLIGHT'
      });
      const recoveringSpy = vi.spyOn(authorizationRepository, 'transitionToRecovering');
      const createTransactionSpy = vi.spyOn(paymentTransactionRepository, 'createTransaction');
      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('test-access-token');
      const timeout = new Error('test timeout');
      timeout.name = 'TimeoutError';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);

      await expect(
        payPalService.createOrder({
          proposalId: mockAuthRecord.proposalId,
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true,
          userId: mockUser._id,
          idempotencyKey: 'idem_paypal_timeout_retry'
        })
      ).rejects.toMatchObject({ code: 'PAYPAL_TIMEOUT', statusCode: 504 });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api-m.sandbox.paypal.com/v2/checkout/orders',
        expect.objectContaining({
          signal: expect.any(Object)
        })
      );
      expect(fetchSpy.mock.calls[0][1].headers['PayPal-Request-Id']).toMatch(/^o_[a-f0-9]{32}$/);
      expect(fetchSpy.mock.calls[0][1].headers['PayPal-Request-Id'].length).toBeLessThanOrEqual(38);
      expect(recoveringSpy).not.toHaveBeenCalled();
      expect(createTransactionSpy).not.toHaveBeenCalled();
    });

    it('keeps PayPal 5xx outcomes retryable with the original PayPal request ID', async () => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(mockAuthRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue({
        ...mockAuthRecord,
        status: 'IN_FLIGHT'
      });
      const recoveringSpy = vi.spyOn(authorizationRepository, 'transitionToRecovering');
      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('test-access-token');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 503
      });

      await expect(
        payPalService.createOrder({
          proposalId: mockAuthRecord.proposalId,
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true,
          userId: mockUser._id,
          idempotencyKey: 'idem_paypal_server_retry'
        })
      ).rejects.toMatchObject({ code: 'PAYPAL_DISPATCH_AMBIGUOUS', statusCode: 502 });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api-m.sandbox.paypal.com/v2/checkout/orders',
        expect.objectContaining({ signal: expect.any(Object) })
      );
      expect(fetchSpy.mock.calls[0][1].headers['PayPal-Request-Id']).toMatch(/^o_[a-f0-9]{32}$/);
      expect(fetchSpy.mock.calls[0][1].headers['PayPal-Request-Id'].length).toBeLessThanOrEqual(38);
      expect(recoveringSpy).not.toHaveBeenCalled();
    });

    it('SEC-01: rejects order creation when client proposalId does not match authorization record proposalId', async () => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(mockAuthRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      const claimNonceSpy = vi.spyOn(authorizationRepository, 'claimNonce');
      const createTxSpy = vi.spyOn(paymentTransactionRepository, 'createTransaction');

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_mismatch'
        },
        body: {
          proposalId: 'prop_rogue_manipulation_999', // Mismatched proposal ID!
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PROPOSAL_ID_MISMATCH');
      expect(res.body.error.message).toContain('does not match authorization record proposalId');

      // Neither nonce claim nor PayPal transaction must be executed
      expect(claimNonceSpy).not.toHaveBeenCalled();
      expect(createTxSpy).not.toHaveBeenCalled();
    });

    it('SEC-01: accepts order creation when proposalId matches and binds authoritative proposalId to transaction', async () => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(mockAuthRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue({
        ...mockAuthRecord,
        status: 'IN_FLIGHT'
      });

      const createTxSpy = vi.spyOn(paymentTransactionRepository, 'createTransaction').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        paypalOrderId: 'PAYPAL_ORDER_SEC01',
        amountMinor: 11790n,
        currency: 'USD',
        status: 'CREATED'
      });

      vi.spyOn(paymentTransactionRepository, 'attachReturnToken').mockResolvedValue({
        plaintextToken: 'return_token_sec01',
        expiresAt: new Date(Date.now() + 60000)
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_sec01_match'
        },
        body: {
          proposalId: 'prop_456', // Matching proposal ID
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(createTxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: 'prop_456'
        })
      );
    });

    it('creates PayPal order, atomically claims nonce, and attaches single-use return token', async () => {
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(mockAuthRecord);
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue({
        ...mockAuthRecord,
        status: 'IN_FLIGHT'
      });

      const mockTxId = new mongoose.Types.ObjectId();
      vi.spyOn(paymentTransactionRepository, 'createTransaction').mockResolvedValue({
        _id: mockTxId,
        paypalOrderId: 'PAYPAL_ORDER_123',
        amountMinor: 11790n,
        currency: 'USD',
        status: 'CREATED'
      });

      vi.spyOn(paymentTransactionRepository, 'attachReturnToken').mockResolvedValue({
        plaintextToken: 'return_token_secret_hex_123',
        expiresAt: new Date(Date.now() + 60000)
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_success_001'
        },
        body: {
          proposalId: 'prop_456',
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.status).toBe('CREATED');
      expect(res.body.data.amountMinor).toBe('11790');
      expect(res.body.data.approvalUrl).toContain('return_token=');
    });

    it('Crash Recovery / Idempotency: Retrying with same Idempotency-Key returns existing order without creating duplicate', async () => {
      // Existing transaction already in DB for this idempotency key
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        userId: mockAuthRecord.userId,
        authorizationId: mockAuthRecord._id,
        proposalId: mockAuthRecord.proposalId,
        paypalOrderId: 'PAYPAL_ORDER_ALREADY_CREATED',
        amountMinor: 11790n,
        currency: 'USD',
        status: 'CREATED'
      });

      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(mockAuthRecord);
      const claimNonceSpy = vi.spyOn(authorizationRepository, 'claimNonce');

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_retry'
        },
        body: {
          proposalId: 'prop_456',
          authorizationId: mockAuthRecord.authorizationId,
          userConsent: true
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.data.orderId).toBe('PAYPAL_ORDER_ALREADY_CREATED');
      // Invariant: Nonce must NOT be re-claimed and PayPal must NOT be called again
      expect(claimNonceSpy).not.toHaveBeenCalled();
    });
  });

  describe('2. PayPal Order Capture (POST /api/payments/capture-order)', () => {
    it('Invariant: GET /api/payments/capture-order is rejected (NEVER capture via GET)', async () => {
      const res = await dispatchRequest(app, {
        method: 'GET',
        url: '/api/payments/capture-order',
        cookies: sessionCookie
      });

      expect(res.status).toBe(404); // Route only defined for POST
    });

    it('captures approved order, updates transaction to COMPLETED, and marks authorization as CONSUMED', async () => {
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: mockUser._id,
        authorizationId: mockAuthRecord._id,
        proposalId: mockAuthRecord.proposalId,
        paypalOrderId: '5O190127TN364715T',
        idempotencyKey: 'idem_key_order',
        amountMinor: 11790n,
        currency: 'USD',
        minorUnitExponent: 2,
        status: 'CREATED',
        save: vi.fn().mockResolvedValue(true)
      };
      mockAuthRecord.status = 'IN_FLIGHT';
      mockAuthRecord.idempotencyKey = mockTx.idempotencyKey;

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(mockAuthRecord);
      vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
      vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('test-access-token');
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: mockTx.paypalOrderId,
            status: 'APPROVED',
            purchase_units: [{
              amount: { currency_code: 'USD', value: '117.90' },
              payee: { merchant_id: mockAuthRecord.paypalMerchantId }
            }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({
            id: mockTx.paypalOrderId,
            status: 'COMPLETED',
            purchase_units: [{
              amount: { currency_code: 'USD', value: '117.90' },
              payee: { merchant_id: mockAuthRecord.paypalMerchantId },
              payments: {
                captures: [{
                  id: 'CAP_SANDBOX_TEST_1',
                  amount: { currency_code: 'USD', value: '117.90' }
                }]
              }
            }]
          })
        });
      const markConsumedSpy = vi.spyOn(authorizationRepository, 'markConsumed').mockResolvedValue({});

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_cap_001'
        },
        body: {
          orderId: mockTx.paypalOrderId,
          authorizationId: mockAuthRecord.authorizationId
        }
      });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.captureId).toBeDefined();
      expect(mockTx.status).toBe('COMPLETED');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const captureRequestId = fetchSpy.mock.calls[1][1].headers['PayPal-Request-Id'];
      expect(captureRequestId).toMatch(/^c_[a-f0-9]{32}$/);
      expect(captureRequestId.length).toBeLessThanOrEqual(38);
      expect(fetchSpy.mock.calls.every(([, options]) => options.signal)).toBe(true);
      expect(markConsumedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          nonce: mockAuthRecord.nonce
        })
      );
    });

    it('Idempotent Capture Recovery: second capture call returns existing completed transaction without re-capturing', async () => {
      const completedTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: mockUser._id,
        authorizationId: mockAuthRecord._id,
        paypalOrderId: 'PAYPAL_ORDER_ALREADY_CAPTURED',
        paypalCaptureId: 'CAP_ALREADY_EXISTS',
        amountMinor: 11790n,
        currency: 'USD',
        status: 'COMPLETED',
        payerEmail: 'buyer@sandbox.paypal.com',
        updatedAt: new Date('2026-11-08T12:05:00Z')
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(completedTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(mockAuthRecord);
      const markConsumedSpy = vi.spyOn(authorizationRepository, 'markConsumed');

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_cap_retry'
        },
        body: {
          orderId: 'PAYPAL_ORDER_ALREADY_CAPTURED',
          authorizationId: mockAuthRecord.authorizationId
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.captureId).toBe('CAP_ALREADY_EXISTS');
      expect(markConsumedSpy).not.toHaveBeenCalled();
    });

    it('AUD-06: rejects capture when supplied authorizationId does not match transaction', async () => {
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: mockUser._id,
        authorizationId: mockAuthRecord._id,
        paypalOrderId: 'PAYPAL_ORDER_AUTH_MISMATCH',
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD'
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(mockAuthRecord);

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        cookies: sessionCookie,
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': 'idem_key_auth_mismatch'
        },
        body: {
          orderId: 'PAYPAL_ORDER_AUTH_MISMATCH',
          authorizationId: 'auth_completely_different_attacker'
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTHORIZATION_ID_MISMATCH');
    });
  });

  describe('3. Return Flow & Session Recovery (GET /api/payments/return & POST /api/payments/recover-session)', () => {
    it('Invariant (AUD-01): GET /api/payments/return NEVER consumes token and trampolines to client URL fragment', async () => {
      const rawToken = 'return_token_raw_abc';
      const consumeSpy = vi.spyOn(paymentTransactionRepository, 'consumeReturnToken');

      const res = await dispatchRequest(app, {
        method: 'GET',
        url: `/api/payments/return?token=PAYPAL_ORDER_RETURN&return_token=${rawToken}`,
        headers: { accept: 'application/json' }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.redirectUrl).toContain(`#return_token=${rawToken}`);
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('POST /api/payments/recover-session atomically consumes return token and restores user session cookie', async () => {
      const rawToken = 'return_token_raw_abc';
      const tokenHash = hashReturnToken(rawToken);

      const tx = {
        _id: new mongoose.Types.ObjectId(),
        userId: mockUser._id,
        paypalOrderId: 'PAYPAL_ORDER_RETURN',
        status: 'CREATED',
        amountMinor: 11790n,
        currency: 'USD',
        returnSessionToken: {
          tokenHash,
          expiresAt: new Date(Date.now() + 60000),
          consumed: false
        }
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(tx);
      vi.spyOn(paymentTransactionRepository, 'consumeReturnToken').mockResolvedValue({
        ...tx,
        returnSessionToken: { ...tx.returnSessionToken, consumed: true }
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/recover-session',
        body: {
          orderId: 'PAYPAL_ORDER_RETURN',
          returnToken: rawToken
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CREATED');
      expect(res.body.data.orderId).toBe('PAYPAL_ORDER_RETURN');
      expect(res.headers['set-cookie']).toContain(env.COOKIE_NAME);
    });

    it('rejects invalid or reused return token with 401 INVALID_OR_EXPIRED_RETURN_TOKEN', async () => {
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(null);

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/recover-session',
        body: {
          orderId: 'ORDER_DOES_NOT_EXIST',
          returnToken: 'invalid_token'
        }
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_OR_EXPIRED_RETURN_TOKEN');
    });
  });

  describe('4. Webhook Foundation (POST /api/payments/webhooks)', () => {
    it('POST /api/payments/webhooks stores and verifies incoming PayPal webhook event', async () => {
      vi.spyOn(payPalService, 'verifyWebhookSignature').mockResolvedValue(true);
      vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue(null);
      vi.spyOn(WebhookEvent.prototype, 'save').mockResolvedValue(true);
      vi.spyOn(WebhookEvent, 'findOneAndUpdate').mockResolvedValue({ processedStatus: 'UNSUPPORTED' });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/webhooks',
        headers: {
          'paypal-auth-algo': 'SHA256withRSA',
          'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360caa42-fca2a594-558838a3',
          'paypal-transmission-id': 'transmission_id_123',
          'paypal-transmission-sig': 'mock_sig_hex',
          'paypal-transmission-time': '2026-11-08T12:00:00Z'
        },
        body: {
          id: 'WH-EVENT-999',
          event_type: 'PAYMENT.SALE.COMPLETED',
          resource_type: 'capture',
          resource: {},
          summary: 'Payment capture completed successfully'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.status).toBe('UNSUPPORTED');
    });

    it('POST /api/payments/webhooks deduplicates previously processed events idempotently', async () => {
      vi.spyOn(payPalService, 'verifyWebhookSignature').mockResolvedValue(true);
      vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue({
        paypalEventId: 'WH-EVENT-ALREADY-PROCESSED',
        processedStatus: 'PROCESSED'
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/webhooks',
        body: {
          id: 'WH-EVENT-ALREADY-PROCESSED',
          event_type: 'PAYMENT.CAPTURE.COMPLETED'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(res.body.status).toBe('ALREADY_PROCESSED');
    });

    it('does not acknowledge a duplicate webhook with an invalid PayPal signature', async () => {
      vi.spyOn(payPalService, 'verifyWebhookSignature').mockResolvedValue(false);
      const findEventSpy = vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue({
        paypalEventId: 'WH-EVENT-INVALID-SIGNATURE',
        processedStatus: 'PROCESSED'
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/webhooks',
        body: {
          id: 'WH-EVENT-INVALID-SIGNATURE',
          event_type: 'PAYMENT.CAPTURE.COMPLETED'
        }
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
      expect(findEventSpy).not.toHaveBeenCalled();
    });
  });

  it('keeps PayPal capture disabled in production', async () => {
    const originalNodeEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    try {
      await expect(
        payPalService.captureOrder({
          orderId: 'PAYPAL_ORDER_DISABLED',
          authorizationId: mockAuthRecord.authorizationId,
          userId: mockUser._id,
          idempotencyKey: 'idem_capture_disabled'
        })
      ).rejects.toMatchObject({ code: 'PAYPAL_CAPTURE_DISABLED', statusCode: 403 });
    } finally {
      env.NODE_ENV = originalNodeEnv;
    }
  });

  it('rejects production PayPal order binding when persisted proposal data differs from the snapshot', async () => {
    const originalNodeEnv = env.NODE_ENV;
    env.NODE_ENV = 'production';
    const intentId = new mongoose.Types.ObjectId();
    const proposalId = new mongoose.Types.ObjectId();
    const snapshotId = new mongoose.Types.ObjectId();
    const payload = {
      productId: 'placeholder-product-id',
      variantSku: 'K2P-WHT-TAC-BROWN',
      merchantId: 'MERCHANT_KEYCHRON',
      paypalMerchantId: 'PPM_KEYCHRON_998',
      lineItems: [{ sku: 'K2P-WHT-TAC-BROWN', name: 'Keyboard', quantity: 1, unitPriceMinor: 9900n }],
      pricing: {
        basePriceMinor: 9900n,
        shippingMinor: 1000n,
        taxMinor: 890n,
        discountMinor: 0n,
        totalPriceMinor: 11790n,
        currency: 'USD',
        minorUnitExponent: 2
      },
      recurring: { isRecurring: false, billingInterval: null, billingCycles: 0 },
      specifications: {},
      rawDescription: 'Keyboard'
    };
    const intent = {
      _id: intentId,
      userId: mockUser._id,
      version: 1,
      currency: 'USD',
      minorUnitExponent: 2
    };
    const proposal = {
      _id: proposalId,
      intentId,
      variantSku: payload.variantSku,
      merchantId: payload.merchantId,
      paypalMerchantId: payload.paypalMerchantId,
      lineItems: payload.lineItems.map((item) => ({ ...item })),
      pricing: { ...payload.pricing },
      recurring: { ...payload.recurring }
    };
    proposal.pricing.totalPriceMinor = 11791n;
    const snapshot = {
      _id: snapshotId,
      intentId,
      proposalId,
      snapshotHash: computeSnapshotCanonicalHash(payload),
      snapshotPayload: payload
    };
    vi.spyOn(CheckoutSnapshot.db, 'readyState', 'get').mockReturnValue(1);
    vi.spyOn(PaymentIntent, 'findOne').mockResolvedValue(intent);
    vi.spyOn(ProductProposal, 'findOne').mockResolvedValue(proposal);
    vi.spyOn(CheckoutSnapshot, 'findOne').mockResolvedValue(snapshot);

    try {
      await expect(
        payPalService.assertAuthoritativeAuthorizationBinding({
          intentId,
          intentVersion: 1,
          proposalId,
          snapshotId: snapshotId.toString(),
          snapshotHash: snapshot.snapshotHash,
          userId: mockUser._id,
          authorizedAmountMinor: 11790n,
          currency: 'USD',
          minorUnitExponent: 2,
          paypalMerchantId: 'PPM_KEYCHRON_998'
        }, mockUser._id)
      ).rejects.toMatchObject({ code: 'AUTHORIZATION_BINDING_MISMATCH' });
    } finally {
      env.NODE_ENV = originalNodeEnv;
    }
  });
});
