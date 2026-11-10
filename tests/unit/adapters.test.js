import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  aiAgentAdapter,
  securityEngineAdapter,
  paypalMockAdapter
} from '../../src/adapters/index.js';
import { env } from '../../src/config/env.js';

describe('Step 2.6: Mock Adapters Unit Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.TEST_OVERRIDE_PROD;
  });

  // ===========================================================================
  // 1. Member 1: AI Agent Mock Adapter
  // ===========================================================================
  describe('1. Member 1: AI Agent Mock Adapter (aiAgentAdapter)', () => {
    it('getCatalog returns 18 items from verified fixture', () => {
      const catalog = aiAgentAdapter.getCatalog();
      expect(Array.isArray(catalog)).toBe(true);
      expect(catalog.length).toBe(18);
    });

    it('findCandidates correctly filters by category, budget and keywords', () => {
      const candidates = aiAgentAdapter.findCandidates({
        category: 'Keyboards',
        maxBudgetMinor: '15000',
        keywords: ['tactile']
      });

      expect(candidates.length).toBeGreaterThan(0);
      candidates.forEach((item) => {
        expect(item.category).toBe('Keyboards');
        expect(BigInt(item.basePriceMinor) <= 15000n).toBe(true);
      });
    });

    it('generateProposal returns valid proposal structure with exact pricing math', () => {
      const catalog = aiAgentAdapter.getCatalog();
      const product = catalog[0];
      const intent = { id: 'int_test_123', maxBudgetMinor: '10000' };

      const proposal = aiAgentAdapter.generateProposal(intent, product, {
        shippingMinor: '500',
        taxMinor: '800'
      });

      expect(proposal.intentId).toBe('int_test_123');
      expect(proposal.productId).toBe(product.externalId);
      expect(proposal.pricing.basePriceMinor).toBe(product.basePriceMinor);
      expect(proposal.pricing.shippingMinor).toBe('500');
      expect(proposal.pricing.taxMinor).toBe('800');

      const expectedTotal = BigInt(product.basePriceMinor) + 500n + 800n;
      expect(proposal.pricing.totalPriceMinor).toBe(expectedTotal.toString());
      expect(proposal.isRecurring).toBe(false);
    });

    it('generateAdversarialProposal correctly simulates all 4 attack vectors', () => {
      const intent = { id: 'int_attack', maxBudgetMinor: '10000' };

      const budgetAttack = aiAgentAdapter.generateAdversarialProposal(intent, 'BUDGET_OVERRUN');
      expect(BigInt(budgetAttack.pricing.totalPriceMinor) > 10000n).toBe(true);

      const injectAttack = aiAgentAdapter.generateAdversarialProposal(intent, 'PROMPT_INJECTION');
      expect(injectAttack.description).toContain('SYSTEM OVERRIDE');

      const recurAttack = aiAgentAdapter.generateAdversarialProposal(intent, 'HIDDEN_RECURRING');
      expect(recurAttack.isRecurring).toBe(true);
      expect(recurAttack.billingCycles).toBe(12);

      const merchAttack = aiAgentAdapter.generateAdversarialProposal(intent, 'UNVERIFIED_MERCHANT');
      expect(merchAttack.merchantId).toBe('MERCHANT_ROGUE_SCAMMER');
    });

    it('throws error on unknown adversarial attack type', () => {
      const intent = { id: 'int_attack', maxBudgetMinor: '10000' };
      expect(() => aiAgentAdapter.generateAdversarialProposal(intent, 'UNKNOWN_EXPLOIT')).toThrow(
        /Unknown adversarial attack type/
      );
    });

    it('strictly locks out execution in production mode', () => {
      const originalEnv = env.NODE_ENV;
      try {
        env.NODE_ENV = 'production';
        expect(() => aiAgentAdapter.findCandidates()).toThrow(/Mock AI agent adapter is strictly barred in production/);
      } finally {
        env.NODE_ENV = originalEnv;
      }
    });
  });

  // ===========================================================================
  // 2. Member 2: Security Engine Mock Adapter
  // ===========================================================================
  describe('2. Member 2: Security Engine Mock Adapter (securityEngineAdapter)', () => {
    it('supports forced BLOCK and REVIEW in test mode', async () => {
      const blockRes = await securityEngineAdapter.verifyProposal({
        intent: {},
        snapshot: {},
        userId: 'usr_test',
        forceOutcome: 'BLOCK'
      });
      expect(blockRes.decision).toBe('BLOCK');
      expect(blockRes.authorization).toBeNull();

      const reviewRes = await securityEngineAdapter.verifyProposal({
        intent: {},
        snapshot: {},
        userId: 'usr_test',
        forceOutcome: 'REVIEW'
      });
      expect(reviewRes.decision).toBe('REVIEW');
      expect(reviewRes.requiresExplicitUserConfirmation).toBe(true);
      expect(reviewRes.authorization).toBeNull();
    });

    it('rejects forceOutcome if executed outside NODE_ENV === "test"', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'development';
        await expect(
          securityEngineAdapter.verifyProposal({
            intent: {},
            snapshot: {},
            userId: 'usr_test',
            forceOutcome: 'BLOCK'
          })
        ).rejects.toThrow(/forceOutcome overrides are restricted to test environments/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('reEvaluateReviewProposal requires non-empty acknowledgedReviewDiffs array', async () => {
      await expect(
        securityEngineAdapter.reEvaluateReviewProposal({
          intent: {},
          snapshot: {},
          userId: 'usr_test',
          acknowledgedReviewDiffs: []
        })
      ).rejects.toThrow(/Explicit user acknowledgment array/);
    });

    it('strictly locks out execution in production mode', async () => {
      const originalEnv = env.NODE_ENV;
      try {
        env.NODE_ENV = 'production';
        await expect(
          securityEngineAdapter.verifyProposal({
            intent: {},
            snapshot: {},
            userId: 'usr_test'
          })
        ).rejects.toThrow(/Mock security engine adapter is strictly barred in production/);
      } finally {
        env.NODE_ENV = originalEnv;
      }
    });
  });

  // ===========================================================================
  // 3. Member 3: PayPal Mock Adapter
  // ===========================================================================
  describe('3. Member 3: PayPal Mock Adapter (paypalMockAdapter)', () => {
    it('createOrder creates mock order with valid structure and caches idempotently', () => {
      const idemKey = 'idem_mock_order_1';
      const order1 = paypalMockAdapter.createOrder({
        amountMinor: '9900',
        currency: 'USD',
        idempotencyKey: idemKey
      });

      expect(order1.id).toContain('PAYPAL_ORDER_');
      expect(order1.status).toBe('CREATED');
      expect(order1.links[0].href).toContain(order1.id);

      // Re-invoking with identical idempotencyKey returns cached order
      const order2 = paypalMockAdapter.createOrder({
        amountMinor: '9900',
        currency: 'USD',
        idempotencyKey: idemKey
      });
      expect(order2).toBe(order1);
    });

    it('captureOrder simulates capture and caches idempotently', () => {
      const idemKey = 'idem_mock_cap_1';
      const cap1 = paypalMockAdapter.captureOrder({
        orderId: 'ORDER_MOCK_123',
        idempotencyKey: idemKey
      });

      expect(cap1.status).toBe('COMPLETED');
      expect(cap1.purchase_units[0].payments.captures[0].id).toContain('CAP_');

      // Re-invoking returns cached capture
      const cap2 = paypalMockAdapter.captureOrder({
        orderId: 'ORDER_MOCK_123',
        idempotencyKey: idemKey
      });
      expect(cap2).toBe(cap1);
    });

    it('generateMockWebhook creates quarantined envelope with mock headers', () => {
      const webhook = paypalMockAdapter.generateMockWebhook({
        eventType: 'PAYMENT.CAPTURE.COMPLETED',
        resourceId: 'CAP_UNIT_TEST_1'
      });

      expect(webhook.headers['x-intentlock-mock-webhook']).toBe('true');
      expect(webhook.headers['paypal-cert-url']).toBe(
        'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-SANDBOX-TEST'
      );
      expect(webhook.body.mockEvent).toBe(true);
      expect(webhook.body.event_source).toBe('MOCK_TEST_HARNESS');
      expect(webhook.body.resource.id).toBe('CAP_UNIT_TEST_1');
    });

    describe('validateCertificateUrl', () => {
      it('accepts exact hosts api.paypal.com and api.sandbox.paypal.com', () => {
        expect(
          paypalMockAdapter.validateCertificateUrl('https://api.paypal.com/v1/notifications/certs/CERT-1')
        ).toBe(true);
        expect(
          paypalMockAdapter.validateCertificateUrl('https://api.sandbox.paypal.com/v1/notifications/certs/CERT-2')
        ).toBe(true);
      });

      it('rejects non-HTTPS URLs', () => {
        expect(() =>
          paypalMockAdapter.validateCertificateUrl('http://api.paypal.com/v1/notifications/certs/CERT-1')
        ).toThrow(/must use HTTPS/);
      });

      it('rejects unapproved subdomains or arbitrary domains (SSRF defense)', () => {
        expect(() =>
          paypalMockAdapter.validateCertificateUrl('https://evil.paypal.com/cert.pem')
        ).toThrow(/not an allowed PayPal host/);
        expect(() =>
          paypalMockAdapter.validateCertificateUrl('https://malicious.com/cert.pem')
        ).toThrow(/not an allowed PayPal host/);
        expect(() =>
          paypalMockAdapter.validateCertificateUrl('https://127.0.0.1/cert.pem')
        ).toThrow(/not an allowed PayPal host/);
      });

      it('rejects non-standard ports', () => {
        expect(() =>
          paypalMockAdapter.validateCertificateUrl('https://api.paypal.com:8443/cert.pem')
        ).toThrow(/default HTTPS port/);
      });
    });

    it('strictly locks out execution in production mode', () => {
      const originalEnv = env.NODE_ENV;
      try {
        env.NODE_ENV = 'production';
        expect(() =>
          paypalMockAdapter.createOrder({
            amountMinor: '9900',
            idempotencyKey: 'idem_prod_fail'
          })
        ).toThrow(/Mock PayPal adapter is strictly barred in production/);
      } finally {
        env.NODE_ENV = originalEnv;
      }
    });
  });
});
