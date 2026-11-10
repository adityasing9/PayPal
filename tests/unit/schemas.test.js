import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import canonicalize from 'canonicalize';
import {
  registerSchema,
  loginSchema,
  updatePreferencesSchema,
  createIntentSchema,
  createProposalSchema,
  verifyProposalSchema,
  canonicalAuthorizationSchema,
  createOrderSchema,
  captureOrderSchema,
  recoverSessionSchema,
  webhookHeaderSchema,
  minorAmountSchema,
  decimalIntegerStringSchema
} from '../../src/schemas/index.js';

describe('Step 2.2: Offline Catalog Fixture Integrity', () => {
  const fixturePath = path.resolve(process.cwd(), 'data', 'catalog_fixture.json');

  it('catalog_fixture.json exists and is valid JSON', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const content = fs.readFileSync(fixturePath, 'utf-8');
    const catalog = JSON.parse(content);
    expect(Array.isArray(catalog)).toBe(true);
  });

  it('contains exactly 18 products evenly distributed across 3 categories (6 each)', () => {
    const catalog = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    expect(catalog).toHaveLength(18);

    const categories = catalog.reduce((acc, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});

    expect(categories).toEqual({
      Keyboards: 6,
      Headphones: 6,
      Monitors: 6
    });
  });

  it('each product satisfies all database schema requirements and invariants', () => {
    const catalog = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const externalIds = new Set();

    for (const p of catalog) {
      expect(p.externalId).toMatch(/^prod_[a-z0-9_]+$/);
      expect(externalIds.has(p.externalId)).toBe(false);
      externalIds.add(p.externalId);

      expect(typeof p.title).toBe('string');
      expect(p.title.length).toBeGreaterThan(0);

      expect(typeof p.description).toBe('string');
      expect(['Keyboards', 'Headphones', 'Monitors']).toContain(p.category);

      expect(p.merchantId).toMatch(/^MERCHANT_[A-Z0-9_]+$/);
      expect(typeof p.merchantName).toBe('string');
      expect(p.paypalMerchantId).toMatch(/^PPM_[A-Z0-9_]+$/);

      // Financial minor unit invariant
      expect(typeof p.basePriceMinor).toBe('string');
      expect(p.basePriceMinor).toMatch(/^[0-9]+$/);
      expect(p.currency).toBe('USD');
      expect(p.minorUnitExponent).toBe(2);

      expect(p.catalogSource).toBe('CHANNEL3_OFFLINE_FIXTURE');
      expect(p.isVerified).toBe(true);
      expect(p.productUrl).toMatch(/^https:\/\//);

      // Verify RFC 8785 specHash determinism
      expect(typeof p.specifications).toBe('object');
      const canonicalSpec = canonicalize(p.specifications);
      const expectedHash = crypto.createHash('sha256').update(canonicalSpec).digest('hex');
      expect(p.specHash).toBe(expectedHash);
    }
  });
});

describe('Step 2.2: Zod Validation Schemas', () => {
  describe('Minor Amount & Currency Primitives', () => {
    it('minorAmountSchema accepts decimal integer strings', () => {
      expect(minorAmountSchema.parse('11790')).toBe('11790');
      expect(minorAmountSchema.parse('0')).toBe('0');
      expect(() => minorAmountSchema.parse('-500')).toThrow();
      expect(() => minorAmountSchema.parse('12.50')).toThrow();
      expect(() => minorAmountSchema.parse('abc')).toThrow();
    });

    it('minorAmountSchema accepts non-negative safe integers and coerces to string', () => {
      expect(minorAmountSchema.parse(11790)).toBe('11790');
      expect(minorAmountSchema.parse(0)).toBe('0');
      expect(() => minorAmountSchema.parse(-10)).toThrow();
    });

    it('decimalIntegerStringSchema rejects numbers and negative amounts', () => {
      expect(decimalIntegerStringSchema.parse('5000')).toBe('5000');
      expect(() => decimalIntegerStringSchema.parse(5000)).toThrow();
      expect(() => decimalIntegerStringSchema.parse('-5000')).toThrow();
    });
  });

  describe('Auth Schemas', () => {
    it('validates registration with strong password', () => {
      const valid = {
        email: 'user@example.com',
        password: 'Password123!',
        name: 'Jane Doe'
      };
      const result = registerSchema.parse(valid);
      expect(result.email).toBe('user@example.com');
      expect(result.name).toBe('Jane Doe');
    });

    it('rejects registration with weak password', () => {
      expect(() =>
        registerSchema.parse({
          email: 'user@example.com',
          password: 'short',
          name: 'Jane Doe'
        })
      ).toThrow();

      expect(() =>
        registerSchema.parse({
          email: 'user@example.com',
          password: 'alllowercase123',
          name: 'Jane Doe'
        })
      ).toThrow();
    });

    it('validates login schema', () => {
      const valid = { email: 'User@Example.COM', password: 'SecretPassword' };
      const result = loginSchema.parse(valid);
      expect(result.email).toBe('user@example.com');
    });

    it('validates user preferences update', () => {
      const valid = {
        defaultCurrency: 'USD',
        maxTransactionLimitMinor: '50000',
        allowedMerchants: ['MERCHANT_KEYCHRON', 'MERCHANT_LOGITECH']
      };
      const result = updatePreferencesSchema.parse(valid);
      expect(result.defaultCurrency).toBe('USD');
      expect(result.maxTransactionLimitMinor).toBe('50000');
    });
  });

  describe('Intent Schemas', () => {
    it('validates createIntentSchema with valid inputs', () => {
      const valid = {
        prompt: 'Find me a wireless mechanical keyboard under $120.',
        maxBudgetMinor: '12000',
        currency: 'USD',
        minorUnitExponent: 2,
        category: 'Keyboards',
        constraints: {
          requiredSpecs: { connectivity: 'Wireless', switchType: 'Tactile' }
        }
      };
      const result = createIntentSchema.parse(valid);
      expect(result.maxBudgetMinor).toBe('12000');
      expect(result.category).toBe('Keyboards');
    });

    it('rejects invalid budget or empty prompt', () => {
      expect(() =>
        createIntentSchema.parse({
          prompt: '',
          maxBudgetMinor: '12000'
        })
      ).toThrow();

      expect(() =>
        createIntentSchema.parse({
          prompt: 'A keyboard',
          maxBudgetMinor: '-100'
        })
      ).toThrow();

      // Enforce strict decimal integer string invariant (no raw JS numbers)
      expect(() =>
        createIntentSchema.parse({
          prompt: 'A keyboard',
          maxBudgetMinor: 12000
        })
      ).toThrow();
    });
  });

  describe('Proposal Schemas', () => {
    it('validates createProposalSchema matching API contract', () => {
      const valid = {
        intentId: 'int_9921bc44',
        productId: 'prod_k2_pro',
        variantSku: 'K2P-WHT-TAC-BROWN',
        title: 'Keychron K2 Pro Wireless Mechanical Keyboard',
        merchant: {
          id: 'MERCHANT_KEYCHRON',
          name: 'Keychron Official Store',
          paypalMerchantId: 'PPM_KEYCHRON_998'
        },
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
          shippingMinor: '1000',
          taxMinor: '890',
          discountMinor: '0',
          totalPriceMinor: '11790',
          currency: 'USD',
          minorUnitExponent: 2
        },
        specifications: {
          connectivity: 'Wireless (Bluetooth 5.1 / Type-C)',
          switchType: 'Tactile (Keychron K Pro Brown)',
          backlight: 'White LED'
        },
        recurring: {
          isRecurring: false,
          billingInterval: null,
          billingCycles: 0
        },
        catalogSource: 'CHANNEL3_OFFLINE_FIXTURE',
        productUrl: 'https://www.keychron.com/products/keychron-k2-pro'
      };

      const result = createProposalSchema.parse(valid);
      expect(result.pricing.totalPriceMinor).toBe('11790');
      expect(result.recurring.isRecurring).toBe(false);
    });
  });

  describe('Security Schemas', () => {
    it('validates canonicalAuthorizationSchema for RFC 8785', () => {
      const valid = {
        authorizationId: 'auth_4402a11c',
        intentId: 'int_9921bc44',
        intentVersion: 1,
        proposalId: 'prop_8820f1a9',
        snapshotId: 'snap_3301a7d2',
        snapshotHash: '4a7d2e8b0123456789abcdef0123456789abcdef0123456789abcdef01234567',
        userId: 'usr_672d1a2b',
        paypalMerchantId: 'PPM_KEYCHRON_998',
        totalPriceMinor: '11790', // Must be decimal integer string
        currency: 'USD',
        nonce: '7f8a9b0c0123456789abcdef0123456789abcdef0123456789abcdef01234567',
        issuedAt: '2026-11-07T18:02:00.000Z',
        expiresAt: '2026-11-07T18:07:00.000Z',
        authMode: 'LIVE_FIREWALL'
      };

      const result = canonicalAuthorizationSchema.parse(valid);
      expect(result.totalPriceMinor).toBe('11790');
      expect(result.intentVersion).toBe(1);
      expect(result.authMode).toBe('LIVE_FIREWALL');
    });

    it('rejects canonicalAuthorizationSchema if totalPriceMinor is a number', () => {
      const invalid = {
        authorizationId: 'auth_4402a11c',
        intentId: 'int_9921bc44',
        intentVersion: 1,
        proposalId: 'prop_8820f1a9',
        snapshotId: 'snap_3301a7d2',
        snapshotHash: '4a7d2e8b0123456789abcdef0123456789abcdef0123456789abcdef01234567',
        userId: 'usr_672d1a2b',
        paypalMerchantId: 'PPM_KEYCHRON_998',
        totalPriceMinor: 11790, // Prohibited number type
        currency: 'USD',
        nonce: '7f8a9b0c0123456789abcdef0123456789abcdef0123456789abcdef01234567',
        issuedAt: '2026-11-07T18:02:00.000Z',
        expiresAt: '2026-11-07T18:07:00.000Z',
        authMode: 'LIVE_FIREWALL'
      };

      expect(() => canonicalAuthorizationSchema.parse(invalid)).toThrow();
    });

    it('validates verifyProposalSchema', () => {
      const valid = {
        intent: {
          id: 'int_9921bc44',
          version: 1,
          maxBudgetMinor: '12000',
          currency: 'USD',
          minorUnitExponent: 2
        },
        snapshot: {
          snapshotId: 'snap_3301a7d2',
          snapshotHash: '4a7d2e8b0123456789abcdef0123456789abcdef0123456789abcdef01234567',
          proposalId: 'prop_8820f1a9',
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
            shippingMinor: '1000',
            taxMinor: '890',
            discountMinor: '0',
            totalPriceMinor: '11790',
            currency: 'USD',
            minorUnitExponent: 2
          },
          recurring: {
            isRecurring: false,
            billingInterval: null,
            billingCycles: 0
          },
          specifications: {
            connectivity: 'Wireless'
          }
        }
      };

      const result = verifyProposalSchema.parse(valid);
      expect(result.snapshot.snapshotId).toBe('snap_3301a7d2');
    });
  });

  describe('Payment Schemas', () => {
    it('createOrderSchema enforces explicit literal userConsent=true', () => {
      const valid = {
        proposalId: 'prop_8820f1a9',
        authorizationId: 'auth_4402a11c',
        userConsent: true,
        acknowledgedReviewDiffs: ['backlight']
      };
      expect(createOrderSchema.parse(valid).userConsent).toBe(true);

      const invalidConsent = {
        proposalId: 'prop_8820f1a9',
        authorizationId: 'auth_4402a11c',
        userConsent: false
      };
      expect(() => createOrderSchema.parse(invalidConsent)).toThrow();
    });

    it('captureOrderSchema validates orderId and authorizationId', () => {
      const valid = {
        orderId: 'PAYPAL_ORDER_88392104',
        authorizationId: 'auth_4402a11c'
      };
      const result = captureOrderSchema.parse(valid);
      expect(result.orderId).toBe('PAYPAL_ORDER_88392104');
    });

    it('recoverSessionSchema validates orderId and returnToken', () => {
      const valid = {
        orderId: 'PAYPAL_ORDER_88392104',
        returnToken: 'ephemeral_token_abc123'
      };
      const result = recoverSessionSchema.parse(valid);
      expect(result.returnToken).toBe('ephemeral_token_abc123');
    });

    it('webhookHeaderSchema validates all required transmission headers', () => {
      const validHeaders = {
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-360-38950',
        'paypal-transmission-id': 'transmission_id_123',
        'paypal-transmission-sig': 'signature_base64_abc',
        'paypal-transmission-time': '2026-11-07T18:03:00Z'
      };
      const result = webhookHeaderSchema.parse(validHeaders);
      expect(result['paypal-auth-algo']).toBe('SHA256withRSA');
    });
  });
});
