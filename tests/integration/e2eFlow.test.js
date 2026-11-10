import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { dispatchRequest } from '../helpers/testClient.js';
import {
  User,
  PaymentIntent,
  ProductProposal,
  CheckoutSnapshot,
  AuthorizationRecord,
  WebhookEvent,
  RiskAssessment,
  UserPreference,
  AuditLog
} from '../../src/models/index.js';
import { authorizationRepository } from '../../src/repositories/AuthorizationRepository.js';
import { paymentTransactionRepository } from '../../src/repositories/PaymentTransactionRepository.js';
import { aiAgentAdapter, paypalMockAdapter } from '../../src/adapters/index.js';
import { authService } from '../../src/services/AuthService.js';
import { hashReturnToken } from '../../src/utils/cryptoUtils.js';
import { computeSnapshotCanonicalHash } from '../../src/utils/canonicalJson.js';

describe('Step 2.6: End-to-End Orchestration & Multi-Member Integration Suite', () => {
  let testUser;
  let authCookie;
  let csrfToken;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Default test user setup with isActive: true
    const userId = new mongoose.Types.ObjectId();
    testUser = {
      _id: userId,
      email: `buyer_${Date.now()}@intentlock.io`,
      name: 'IntentLock E2E Buyer',
      sessionVersion: 1,
      isActive: true
    };

    const sessionJwt = authService.generateSessionJwt(testUser);
    authCookie = { [env.COOKIE_NAME]: sessionJwt };

    vi.spyOn(User, 'findById').mockResolvedValue(testUser);
    vi.spyOn(User, 'findOne').mockResolvedValue(testUser);
    vi.spyOn(UserPreference, 'findOne').mockResolvedValue(null);
    vi.spyOn(RiskAssessment, 'create').mockResolvedValue({});
    vi.spyOn(AuditLog, 'create').mockResolvedValue({});
    vi.spyOn(PaymentIntent.prototype, 'save').mockImplementation(function () {
      this._id = this._id || new mongoose.Types.ObjectId();
      this.createdAt = new Date('2026-11-08T12:00:00Z');
      return this;
    });
    vi.spyOn(ProductProposal.prototype, 'save').mockImplementation(async function () {
      this._id = this._id || new mongoose.Types.ObjectId();
      this.createdAt = this.createdAt || new Date('2026-11-08T12:00:00Z');
      return this;
    });
    vi.spyOn(CheckoutSnapshot.prototype, 'save').mockImplementation(async function () {
      this._id = this._id || new mongoose.Types.ObjectId();
      this.createdAt = this.createdAt || new Date('2026-11-08T12:00:00Z');
      return this;
    });
    vi.spyOn(authorizationRepository, 'createAuthorization').mockResolvedValue({});
    vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(null);
    vi.spyOn(paymentTransactionRepository, 'consumeReturnToken').mockResolvedValue({});

    // Fetch genuine CSRF token via dispatchRequest
    const csrfRes = await dispatchRequest(app, {
      method: 'GET',
      url: '/api/auth/csrf',
      cookies: authCookie
    });
    csrfToken = csrfRes.body.data.csrfToken;
  });

  // ===========================================================================
  // SCENARIO 1: Complete Happy-Path Purchase Lifecycle
  // ===========================================================================
  describe('Scenario 1: Complete Happy Path Purchase Lifecycle', () => {
    it('executes full flow: Intent -> AI Proposal -> Firewall PASS -> Explicit Approval -> Order Create -> Capture', async () => {
      // 1. Submit Purchase Intent ($120.00 max budget)
      const intentDoc = {
        _id: new mongoose.Types.ObjectId(),
        userId: testUser._id,
        rawPrompt: 'Buy wireless mechanical keyboard with tactile switches under $120',
        category: 'Keyboards',
        maxBudgetMinor: 12000n,
        currency: 'USD',
        status: 'OPEN',
        version: 1
      };
      vi.spyOn(PaymentIntent, 'create').mockResolvedValue(intentDoc);
      vi.spyOn(PaymentIntent, 'findById').mockResolvedValue(intentDoc);

      const intentRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/intents',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: {
          prompt: intentDoc.rawPrompt,
          category: 'Keyboards',
          maxBudgetMinor: '12000',
          currency: 'USD'
        }
      });
      expect(intentRes.status).toBe(201);
      expect(intentRes.body.data.maxBudgetMinor).toBe('12000');

      // 2. Member 1 AI Agent discovers candidate and formulates proposal
      const candidates = aiAgentAdapter.findCandidates({
        category: 'Keyboards',
        maxBudgetMinor: '12000',
        keywords: ['tactile', 'wireless']
      });
      expect(candidates.length).toBeGreaterThan(0);
      const chosenProduct = candidates[0]; // Keychron K2 Pro ($99.00 = 9900 minor)

      const proposalPayload = aiAgentAdapter.generateProposal(intentDoc, chosenProduct);
      expect(proposalPayload.pricing.totalPriceMinor).toBe('9900');

      const proposalId = new mongoose.Types.ObjectId();
      const proposalDoc = {
        _id: proposalId,
        userId: testUser._id,
        intentId: intentDoc._id,
        ...proposalPayload,
        status: 'SUBMITTED',
        version: 1
      };
      vi.spyOn(ProductProposal, 'create').mockResolvedValue(proposalDoc);
      vi.spyOn(ProductProposal, 'findById').mockResolvedValue(proposalDoc);

      const snapshotId = new mongoose.Types.ObjectId();
      const rawSnapshotData = {
        _id: snapshotId,
        snapshotId: snapshotId.toString(),
        proposalId: proposalDoc._id.toString(),
        productId: chosenProduct.externalId,
        variantSku: chosenProduct.externalId,
        merchantId: chosenProduct.merchantId,
        paypalMerchantId: chosenProduct.paypalMerchantId,
        lineItems: proposalPayload.lineItems,
        pricing: proposalPayload.pricing,
        recurring: { isRecurring: false, billingCycles: 0 },
        specifications: chosenProduct.specifications,
        rawDescription: chosenProduct.description || ''
      };
      const canonicalSnapshotHash = computeSnapshotCanonicalHash(rawSnapshotData);
      const snapshotDoc = {
        ...rawSnapshotData,
        snapshotHash: canonicalSnapshotHash,
        snapshotPayload: rawSnapshotData
      };
      vi.spyOn(CheckoutSnapshot, 'create').mockResolvedValue(snapshotDoc);
      vi.spyOn(CheckoutSnapshot, 'findById').mockResolvedValue(snapshotDoc);
      vi.spyOn(CheckoutSnapshot, 'findOne').mockResolvedValue(snapshotDoc);
      vi.spyOn(PaymentIntent, 'findById').mockResolvedValue(intentDoc);

      // Proposal validation on /api/proposals
      const propReqBody = {
        intentId: intentDoc._id.toString(),
        productId: chosenProduct.externalId,
        variantSku: chosenProduct.externalId,
        title: chosenProduct.title,
        merchant: {
          id: chosenProduct.merchantId,
          name: chosenProduct.merchantName,
          paypalMerchantId: chosenProduct.paypalMerchantId
        },
        lineItems: [
          {
            name: chosenProduct.title,
            sku: chosenProduct.externalId,
            quantity: 1,
            unitPriceMinor: chosenProduct.basePriceMinor
          }
        ],
        pricing: proposalPayload.pricing,
        specifications: chosenProduct.specifications,
        productUrl: chosenProduct.productUrl
      };

      const propRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/proposals',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: propReqBody
      });
      expect(propRes.status).toBe(201);

      // 3. Member 2 Security Firewall evaluation (PASS)
      const verifyRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/security/verify',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: {
          intent: {
            id: intentDoc._id.toString(),
            version: 1,
            maxBudgetMinor: '12000',
            currency: 'USD',
            minorUnitExponent: 2
          },
          snapshot: snapshotDoc
        }
      });
      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.data.decision).toBe('PASS');
      expect(verifyRes.body.data.authorization).toBeDefined();
      expect(verifyRes.body.data.authorization.algorithm).toBe('Ed25519');

      const authData = verifyRes.body.data.authorization;
      const authRecordDoc = {
        _id: new mongoose.Types.ObjectId(),
        authorizationId: authData.authorizationId,
        proposalId: proposalDoc._id,
        intentId: intentDoc._id,
        intentVersion: 1,
        snapshotId: snapshotDoc._id,
        userId: testUser._id,
        authorizedAmountMinor: 9900n,
        currency: 'USD',
        status: 'PENDING',
        nonce: authData.nonce,
        issuedAt: new Date(authData.issuedAt),
        expiresAt: new Date(authData.expiresAt),
        keyId: env.ED25519_KEY_ID,
        authMode: authData.authMode || (env.USE_MOCK_SECURITY ? 'MOCK_DETERMINISTIC' : 'LIVE_FIREWALL'),
        signature: authData.signature,
        publicKey: authData.publicKey,
        canonicalJsonHash: authData.canonicalJsonHash,
        snapshotHash: snapshotDoc.snapshotHash,
        paypalMerchantId: chosenProduct.paypalMerchantId
      };
      vi.spyOn(AuthorizationRecord, 'findOne').mockResolvedValue(authRecordDoc);
      vi.spyOn(AuthorizationRecord, 'findById').mockResolvedValue(authRecordDoc);
      vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue(authRecordDoc);
      vi.spyOn(authorizationRepository, 'markConsumed').mockResolvedValue({
        ...authRecordDoc,
        status: 'CONSUMED'
      });

      // 4. Order Creation (POST /api/payments/create-order) with Idempotency-Key
      const createIdempotencyKey = 'idem_create_' + crypto.randomUUID();
      const mockCreatedTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: testUser._id,
        authorizationId: authRecordDoc._id,
        proposalId: proposalDoc._id,
        paypalOrderId: 'PAYPAL_ORDER_E2E_123',
        idempotencyKey: createIdempotencyKey,
        amountMinor: 9900n,
        currency: 'USD',
        status: 'CREATED'
      };
      vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
      vi.spyOn(paymentTransactionRepository, 'createTransaction').mockResolvedValue(mockCreatedTx);
      vi.spyOn(paymentTransactionRepository, 'attachReturnToken').mockResolvedValue({
        plaintextToken: 'tok_e2e_return_123'
      });

      const createOrderRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/create-order',
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': createIdempotencyKey
        },
        cookies: authCookie,
        body: {
          proposalId: proposalDoc._id.toString(),
          authorizationId: authRecordDoc.authorizationId,
          userConsent: true
        }
      });
      expect(createOrderRes.status).toBe(201);
      expect(createOrderRes.body.data.status).toBe('CREATED');
      expect(createOrderRes.body.data.amountMinor).toBe('9900');
      expect(createOrderRes.body.data.approvalUrl).toContain('checkoutnow?token=');

      // 5. Order Capture (POST /api/payments/capture-order)
      const captureIdempotencyKey = 'idem_cap_' + crypto.randomUUID();
      mockCreatedTx.save = vi.fn().mockResolvedValue(mockCreatedTx);
      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockCreatedTx);

      const captureRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': captureIdempotencyKey
        },
        cookies: authCookie,
        body: {
          orderId: mockCreatedTx.paypalOrderId,
          authorizationId: authRecordDoc.authorizationId,
          userConsent: true
        }
      });
      expect(captureRes.status).toBe(200);
      expect(captureRes.body.data.status).toBe('COMPLETED');
      expect(captureRes.body.data.captureId).toBeDefined();
    });
  });

  // ===========================================================================
  // SCENARIO 2: Spec Diff Detection, REVIEW Status & User Acknowledgment Clearance
  // ===========================================================================
  describe('Scenario 2: Spec Diff Detection, REVIEW Status & Acknowledgment Flow', () => {
    it('requires explicit user acknowledgment of spec differences before issuing authorization', async () => {
      const intentWithLinear = {
        id: 'int_spec_diff_1',
        version: 1,
        maxBudgetMinor: '15000',
        currency: 'USD',
        minorUnitExponent: 2,
        requiredSpecs: { switchType: 'Linear' }
      };

      const rawTactileSnapshot = {
        snapshotId: 'snap_tactile_diff',
        proposalId: 'prop_tactile_diff',
        productId: 'prod_k2_pro',
        variantSku: 'K2P-WHT-TAC-BROWN',
        merchantId: 'MERCHANT_KEYCHRON',
        paypalMerchantId: 'PPM_KEYCHRON_998',
        lineItems: [
          {
            name: 'Keychron K2 Pro',
            sku: 'K2P-WHT-TAC-BROWN',
            quantity: 1,
            unitPriceMinor: '9900'
          }
        ],
        pricing: {
          basePriceMinor: '9900',
          shippingMinor: '0',
          taxMinor: '0',
          discountMinor: '0',
          totalPriceMinor: '9900',
          currency: 'USD',
          minorUnitExponent: 2
        },
        recurring: { isRecurring: false, billingCycles: 0 },
        specifications: { switchType: 'Tactile' },
        rawDescription: 'Keychron K2 Pro'
      };
      const snapshotWithTactile = {
        ...rawTactileSnapshot,
        snapshotHash: computeSnapshotCanonicalHash(rawTactileSnapshot)
      };

      // 1. Initial verification produces REVIEW with authorization: null
      const initialVerifyRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/security/verify',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: {
          intent: intentWithLinear,
          snapshot: snapshotWithTactile
        }
      });

      expect(initialVerifyRes.status).toBe(200);
      expect(initialVerifyRes.body.data.decision).toBe('REVIEW');
      expect(initialVerifyRes.body.data.authorization).toBeNull();
      expect(initialVerifyRes.body.data.specDifferences).toBeDefined();
      expect(initialVerifyRes.body.data.specDifferences.length).toBeGreaterThan(0);

      // 2. User acknowledges the spec differences in drawer
      const acknowledgedVerifyRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/security/verify',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: {
          intent: intentWithLinear,
          snapshot: snapshotWithTactile,
          acknowledgedReviewDiffs: ['switchType']
        }
      });

      expect(acknowledgedVerifyRes.status).toBe(200);
      expect(acknowledgedVerifyRes.body.data.decision).toBe('PASS');
      expect(acknowledgedVerifyRes.body.data.authorization).toBeDefined();
      expect(acknowledgedVerifyRes.body.data.authorization.signature).toBeDefined();
    });
  });

  // ===========================================================================
  // SCENARIO 3: Policy Violation Blocking (Budget Overrun, Recurring Fee, Untrusted Merchant)
  // ===========================================================================
  describe('Scenario 3: Policy Violation Blocking', () => {
    const baseIntent = {
      id: 'int_policy_test',
      version: 1,
      maxBudgetMinor: '10000',
      currency: 'USD',
      minorUnitExponent: 2,
      requiredSpecs: {}
    };

    it('BLOCKS proposal when total price exceeds maximum budget ceiling', async () => {
      const rawBudgetFail = {
        snapshotId: 'snap_budget_fail',
        proposalId: 'prop_budget_fail',
        productId: 'prod_k2_pro',
        variantSku: 'K2P-WHT-TAC-BROWN',
        merchantId: 'MERCHANT_KEYCHRON',
        paypalMerchantId: 'PPM_KEYCHRON_998',
        lineItems: [
          {
            name: 'Keychron K2 Pro',
            sku: 'K2P-WHT-TAC-BROWN',
            quantity: 1,
            unitPriceMinor: '15000'
          }
        ],
        pricing: {
          basePriceMinor: '15000',
          shippingMinor: '0',
          taxMinor: '0',
          discountMinor: '0',
          totalPriceMinor: '15000',
          currency: 'USD',
          minorUnitExponent: 2
        },
        recurring: { isRecurring: false, billingCycles: 0 },
        specifications: {},
        rawDescription: ''
      };
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/security/verify',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: {
          intent: baseIntent,
          snapshot: {
            ...rawBudgetFail,
            snapshotHash: computeSnapshotCanonicalHash(rawBudgetFail)
          }
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.data.decision).toBe('BLOCK');
      expect(res.body.data.errorCode).toBe('BUDGET_EXCEEDED');
      expect(res.body.data.authorization).toBeNull();
    });

    it('BLOCKS proposal when unexpected recurring charges are detected', async () => {
      const rawRecurFail = {
        snapshotId: 'snap_recur_fail',
        proposalId: 'prop_recur_fail',
        productId: 'prod_k2_pro',
        variantSku: 'K2P-WHT-TAC-BROWN',
        merchantId: 'MERCHANT_KEYCHRON',
        paypalMerchantId: 'PPM_KEYCHRON_998',
        lineItems: [
          {
            name: 'Keychron K2 Pro',
            sku: 'K2P-WHT-TAC-BROWN',
            quantity: 1,
            unitPriceMinor: '9900'
          }
        ],
        pricing: {
          basePriceMinor: '9900',
          shippingMinor: '0',
          taxMinor: '0',
          discountMinor: '0',
          totalPriceMinor: '9900',
          currency: 'USD',
          minorUnitExponent: 2
        },
        recurring: { isRecurring: true, billingCycles: 12 },
        specifications: {},
        rawDescription: ''
      };
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/security/verify',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: {
          intent: baseIntent,
          snapshot: {
            ...rawRecurFail,
            snapshotHash: computeSnapshotCanonicalHash(rawRecurFail)
          }
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.data.decision).toBe('BLOCK');
      expect(res.body.data.errorCode).toBe('UNEXPECTED_RECURRING_CHARGE');
      expect(res.body.data.authorization).toBeNull();
    });

    it('BLOCKS proposal when payee merchant is not in verified directory', async () => {
      const rawMerchFail = {
        snapshotId: 'snap_merch_fail',
        proposalId: 'prop_merch_fail',
        productId: 'prod_k2_pro',
        variantSku: 'K2P-WHT-TAC-BROWN',
        merchantId: 'MERCHANT_ROGUE_SCAMMER',
        paypalMerchantId: 'PPM_ROGUE_7719',
        lineItems: [
          {
            name: 'Keychron K2 Pro',
            sku: 'K2P-WHT-TAC-BROWN',
            quantity: 1,
            unitPriceMinor: '9900'
          }
        ],
        pricing: {
          basePriceMinor: '9900',
          shippingMinor: '0',
          taxMinor: '0',
          discountMinor: '0',
          totalPriceMinor: '9900',
          currency: 'USD',
          minorUnitExponent: 2
        },
        recurring: { isRecurring: false, billingCycles: 0 },
        specifications: {},
        rawDescription: ''
      };
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/security/verify',
        headers: { 'x-csrf-token': csrfToken },
        cookies: authCookie,
        body: {
          intent: baseIntent,
          snapshot: {
            ...rawMerchFail,
            snapshotHash: computeSnapshotCanonicalHash(rawMerchFail)
          }
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.data.decision).toBe('BLOCK');
      expect(res.body.data.errorCode).toBe('CRITICAL_VIOLATION_MERCHANT_MISMATCH');
      expect(res.body.data.authorization).toBeNull();
    });
  });

  // ===========================================================================
  // SCENARIO 4: Cross-Site Return, URL Fragment & Single-Use Session Recovery
  // ===========================================================================
  describe('Scenario 4: Cross-Site Return & Session Recovery', () => {
    it('GET /api/payments/return trampolines to client URL fragment without consuming token or capturing funds', async () => {
      const consumeSpy = vi.spyOn(paymentTransactionRepository, 'consumeReturnToken');

      const res = await dispatchRequest(app, {
        method: 'GET',
        url: '/api/payments/return?token=ORDER_TRAMPOLINE_999&return_token=tok_secret_fragment_123',
        headers: { accept: 'application/json' }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.redirectUrl).toContain('#return_token=tok_secret_fragment_123');
      expect(res.body.data.orderId).toBe('ORDER_TRAMPOLINE_999');
      // Invariant: GET MUST NEVER consume token or restore session cookies
      expect(consumeSpy).not.toHaveBeenCalled();
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('POST /api/payments/recover-session atomically consumes token and rejects replays', async () => {
      const rawToken = 'tok_atomic_recovery_' + crypto.randomUUID();
      const tokenHash = hashReturnToken(rawToken);
      const orderId = 'PAYPAL_ORDER_RECOVER_TEST';

      let tokenConsumed = false;
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: testUser._id,
        paypalOrderId: orderId,
        amountMinor: 9900n,
        currency: 'USD',
        status: 'CREATED',
        returnSessionToken: {
          tokenHash,
          expiresAt: new Date(Date.now() + 60000),
          consumed: false
        }
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      vi.spyOn(paymentTransactionRepository, 'consumeReturnToken').mockImplementation(async () => {
        if (tokenConsumed) {
          throw new Error('Return token has already been consumed or is invalid.');
        }
        tokenConsumed = true;
        mockTx.returnSessionToken.consumed = true;
        return mockTx;
      });

      // 1. First consumption succeeds and re-attaches session cookie
      const firstRecoverRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/recover-session',
        body: { orderId, returnToken: rawToken }
      });

      expect(firstRecoverRes.status).toBe(200);
      expect(firstRecoverRes.body.success).toBe(true);
      expect(firstRecoverRes.body.data.status).toBe('CREATED');
      expect(firstRecoverRes.headers['set-cookie']).toContain(env.COOKIE_NAME);

      // 2. Replay attempt with same token fails immediately (401)
      const replayRecoverRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/recover-session',
        body: { orderId, returnToken: rawToken }
      });

      expect(replayRecoverRes.status).toBe(401);
      expect(replayRecoverRes.body.error.code).toBe('INVALID_OR_EXPIRED_RETURN_TOKEN');
    });

    it('executes complete GET return -> SPA fragment extraction -> POST recovery lifecycle', async () => {
      const orderId = 'ORDER_FULL_RECOVERY_LIFECYCLE';
      const rawToken = 'tok_full_cycle_' + crypto.randomUUID();
      const tokenHash = hashReturnToken(rawToken);

      let tokenConsumed = false;
      const mockTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: testUser._id,
        paypalOrderId: orderId,
        amountMinor: 9900n,
        currency: 'USD',
        status: 'CREATED',
        returnSessionToken: {
          tokenHash,
          expiresAt: new Date(Date.now() + 60000),
          consumed: false
        }
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(mockTx);
      const consumeSpy = vi.spyOn(paymentTransactionRepository, 'consumeReturnToken').mockImplementation(async () => {
        if (tokenConsumed) {
          throw new Error('Return token has already been consumed.');
        }
        tokenConsumed = true;
        mockTx.returnSessionToken.consumed = true;
        return mockTx;
      });

      // Step 1: PayPal redirects browser to GET /return
      const getReturnRes = await dispatchRequest(app, {
        method: 'GET',
        url: `/api/payments/return?token=${orderId}&return_token=${rawToken}`,
        headers: { accept: 'application/json' }
      });

      expect(getReturnRes.status).toBe(200);
      expect(getReturnRes.body.data.redirectUrl).toContain(`#return_token=${rawToken}`);
      // Token MUST remain unconsumed after GET
      expect(tokenConsumed).toBe(false);
      expect(consumeSpy).not.toHaveBeenCalled();

      // Step 2: SPA extracts fragment token and calls POST /recover-session
      const postRecoverRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/recover-session',
        body: { orderId, returnToken: rawToken }
      });

      expect(postRecoverRes.status).toBe(200);
      expect(postRecoverRes.body.success).toBe(true);
      expect(postRecoverRes.headers['set-cookie']).toContain(env.COOKIE_NAME);
      expect(tokenConsumed).toBe(true);

      // Step 3: Replay returns 401
      const replayRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/recover-session',
        body: { orderId, returnToken: rawToken }
      });
      expect(replayRes.status).toBe(401);
    });
  });

  // ===========================================================================
  // SCENARIO 5: Replay Attack Defense & Crash Recovery Idempotency
  // ===========================================================================
  describe('Scenario 5: Replay Attack Defense & Crash Recovery Idempotency', () => {
    it('retrying order capture with same Idempotency-Key returns existing transaction without re-charging', async () => {
      const idempotencyKey = 'idem_replay_test_' + crypto.randomUUID();
      const mockAuthId = 'auth_mock_placeholder_' + crypto.randomUUID();
      const completedTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: testUser._id,
        authorizationId: mockAuthId,
        paypalOrderId: 'PAYPAL_ORDER_ALREADY_SETTLED',
        paypalCaptureId: 'CAP_SETTLED_EXISTING_777',
        idempotencyKey,
        amountMinor: 9900n,
        currency: 'USD',
        status: 'COMPLETED',
        updatedAt: new Date()
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(completedTx);

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': idempotencyKey
        },
        cookies: authCookie,
        body: {
          orderId: completedTx.paypalOrderId,
          authorizationId: mockAuthId,
          userConsent: true
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.captureId).toBe('CAP_SETTLED_EXISTING_777');
    });

    it('AUD-06: rejects order capture when client supplies a mismatched authorizationId', async () => {
      const idempotencyKey = 'idem_mismatch_test_' + crypto.randomUUID();
      const legitimateAuthId = 'auth_legit_' + crypto.randomUUID();
      const completedTx = {
        _id: new mongoose.Types.ObjectId(),
        userId: testUser._id,
        authorizationId: legitimateAuthId,
        paypalOrderId: 'PAYPAL_ORDER_AUTH_CHECK',
        idempotencyKey,
        amountMinor: 9900n,
        currency: 'USD',
        status: 'CREATED'
      };

      vi.spyOn(paymentTransactionRepository, 'findByOrderId').mockResolvedValue(completedTx);

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/capture-order',
        headers: {
          'x-csrf-token': csrfToken,
          'idempotency-key': idempotencyKey
        },
        cookies: authCookie,
        body: {
          orderId: completedTx.paypalOrderId,
          authorizationId: 'auth_malicious_attacker_id',
          userConsent: true
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('AUTHORIZATION_ID_MISMATCH');
    });
  });

  // ===========================================================================
  // SCENARIO 6: Webhook Exact Host SSRF Validation & Mock Quarantine
  // ===========================================================================
  describe('Scenario 6: Webhook Exact Host SSRF Validation & Mock Quarantine', () => {
    it('rejects webhooks with unapproved certificate hosts (SSRF defense)', async () => {
      const rogueWebhookRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/webhooks',
        headers: {
          'paypal-cert-url': 'https://evil.attacker.com/malicious_cert.pem'
        },
        body: {
          id: 'WH-ROGUE-SSRF',
          event_type: 'PAYMENT.CAPTURE.COMPLETED'
        }
      });

      expect(rogueWebhookRes.status).toBe(400);
      expect(rogueWebhookRes.body.error.code).toBe('UNTRUSTED_CERT_HOST');
    });

    it('rejects non-HTTPS certificate URLs', async () => {
      const httpWebhookRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/webhooks',
        headers: {
          'paypal-cert-url': 'http://api.sandbox.paypal.com/cert.pem'
        },
        body: {
          id: 'WH-ROGUE-HTTP',
          event_type: 'PAYMENT.CAPTURE.COMPLETED'
        }
      });

      expect(httpWebhookRes.status).toBe(400);
      expect(httpWebhookRes.body.error.code).toBe('INVALID_CERT_URL_PROTOCOL');
    });

    it('processes and deduplicates valid mock webhook fixtures in non-production mode', async () => {
      const mockFixture = paypalMockAdapter.generateMockWebhook({
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        resourceId: 'CAP_MOCK_SUCCESS_123'
      });

      vi.spyOn(WebhookEvent, 'findOne').mockResolvedValue(null);
      vi.spyOn(WebhookEvent.prototype, 'save').mockResolvedValue(true);

      const whRes = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/payments/webhooks',
        headers: mockFixture.headers,
        body: mockFixture.body
      });

      expect(whRes.status).toBe(200);
      expect(whRes.body.received).toBe(true);
      expect(whRes.body.status).toBe('VERIFIED_AND_PROCESSED');
    });
  });
});
