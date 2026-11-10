import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/models/User.model.js';
import { UserPreference } from '../../src/models/UserPreference.model.js';
import { PaymentIntent } from '../../src/models/PaymentIntent.model.js';
import { generateCsrfToken } from '../../src/utils/cryptoUtils.js';
import { dispatchRequest } from '../helpers/testClient.js';

describe('Step 2.5.3 & 2.5.4: Catalog, Preferences & Purchase Intent APIs', () => {
  let mockUser;
  let sessionCookie;
  let csrfToken;

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
  });

  describe('1. Product Catalog Endpoints (Public)', () => {
    it('GET /api/products returns all 18 approved catalog fixture items', async () => {
      const res = await dispatchRequest(app, { method: 'GET', url: '/api/products' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.products).toHaveLength(18);
    });

    it('GET /api/products?category=Keyboards filters catalog to only Keyboards', async () => {
      const res = await dispatchRequest(app, { method: 'GET', url: '/api/products?category=Keyboards' });
      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBeGreaterThan(0);
      for (const p of res.body.data.products) {
        expect(p.category).toBe('Keyboards');
      }
    });

    it('GET /api/products?q=Keychron searches catalog by text query', async () => {
      const res = await dispatchRequest(app, { method: 'GET', url: '/api/products?q=Keychron' });
      expect(res.status).toBe(200);
      expect(res.body.data.products.length).toBeGreaterThan(0);
      for (const p of res.body.data.products) {
        expect(p.title.toLowerCase().includes('keychron') || p.merchantName.toLowerCase().includes('keychron')).toBe(true);
      }
    });

    it('GET /api/products/:id returns single product by externalId', async () => {
      const res = await dispatchRequest(app, { method: 'GET', url: '/api/products/prod_k2_pro' });
      expect(res.status).toBe(200);
      expect(res.body.data.product.externalId).toBe('prod_k2_pro');
      expect(res.body.data.product.title).toContain('Keychron K2 Pro');
    });

    it('GET /api/products/:id returns 404 PRODUCT_NOT_FOUND for unknown product', async () => {
      const res = await dispatchRequest(app, { method: 'GET', url: '/api/products/unknown_xyz' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('2. User Preferences Endpoints (Protected)', () => {
    it('GET /api/user/preferences returns preferences with decimal string numbers', async () => {
      vi.spyOn(UserPreference, 'findOne').mockResolvedValue({
        userId: mockUser._id,
        defaultCurrency: 'USD',
        minorUnitExponent: 2,
        maxTransactionLimitMinor: 50000n,
        dailySpendingLimitMinor: 100000n,
        allowedMerchants: ['MERCHANT_KEYCHRON'],
        blockedMerchants: ['MERCHANT_SHADY'],
        requireExplicitReviewOverMinor: 20000n
      });

      const res = await dispatchRequest(app, {
        method: 'GET',
        url: '/api/user/preferences',
        cookies: sessionCookie
      });

      expect(res.status).toBe(200);
      expect(res.body.data.defaultCurrency).toBe('USD');
      expect(res.body.data.maxTransactionLimitMinor).toBe('50000');
      expect(res.body.data.requireExplicitReviewOverMinor).toBe('20000');
    });

    it('PUT /api/user/preferences updates limits and rejects floating-point amounts', async () => {
      // Floating-point number rejection
      const invalidRes = await dispatchRequest(app, {
        method: 'PUT',
        url: '/api/user/preferences',
        cookies: sessionCookie,
        headers: { 'x-csrf-token': csrfToken },
        body: {
          maxTransactionLimitMinor: 500.50 // INVALID: JavaScript number!
        }
      });
      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error.code).toBe('VALIDATION_ERROR');

      // Valid decimal integer string update
      vi.spyOn(UserPreference, 'findOneAndUpdate').mockResolvedValue({
        userId: mockUser._id,
        defaultCurrency: 'USD',
        minorUnitExponent: 2,
        maxTransactionLimitMinor: 60000n,
        dailySpendingLimitMinor: 100000n,
        allowedMerchants: ['MERCHANT_KEYCHRON', 'MERCHANT_LOGITECH'],
        blockedMerchants: [],
        requireExplicitReviewOverMinor: 25000n
      });

      const validRes = await dispatchRequest(app, {
        method: 'PUT',
        url: '/api/user/preferences',
        cookies: sessionCookie,
        headers: { 'x-csrf-token': csrfToken },
        body: {
          maxTransactionLimitMinor: '60000',
          requireExplicitReviewOverMinor: '25000'
        }
      });

      expect(validRes.status).toBe(200);
      expect(validRes.body.data.maxTransactionLimitMinor).toBe('60000');
      expect(validRes.body.data.requireExplicitReviewOverMinor).toBe('25000');
    });
  });

  describe('3. Purchase Intent Endpoints (Protected)', () => {
    it('POST /api/intents creates intent with decimal integer string budget', async () => {
      const mockIntentId = new mongoose.Types.ObjectId();
      vi.spyOn(PaymentIntent.prototype, 'save').mockImplementation(async function () {
        this._id = mockIntentId;
        this.createdAt = new Date('2026-11-08T12:00:00Z');
        return this;
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/intents',
        cookies: sessionCookie,
        headers: { 'x-csrf-token': csrfToken },
        body: {
          prompt: 'Find a mechanical keyboard with tactile switches under $120',
          maxBudgetMinor: '12000',
          currency: 'USD',
          minorUnitExponent: 2,
          category: 'Keyboards',
          constraints: {
            requiredSpecs: { connectivity: 'Wireless', switchType: 'Tactile' }
          }
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intentId).toBe(mockIntentId.toString());
      expect(res.body.data.maxBudgetMinor).toBe('12000');
      expect(res.body.data.status).toBe('INITIALIZED');
    });

    it('POST /api/intents rejects floating point budget numbers via Zod', async () => {
      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/intents',
        cookies: sessionCookie,
        headers: { 'x-csrf-token': csrfToken },
        body: {
          prompt: 'Find a keyboard',
          maxBudgetMinor: 120.00, // INVALID number
          currency: 'USD'
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/intents/:id enforces ownership isolation', async () => {
      // Intent belongs to this user
      const intentId = new mongoose.Types.ObjectId();
      vi.spyOn(PaymentIntent, 'findOne').mockResolvedValue({
        _id: intentId,
        userId: mockUser._id,
        version: 1,
        prompt: 'Mechanical keyboard',
        maxBudgetMinor: 12000n,
        currency: 'USD',
        minorUnitExponent: 2,
        category: 'Keyboards',
        constraints: {},
        status: 'INITIALIZED',
        createdAt: new Date()
      });

      const res = await dispatchRequest(app, {
        method: 'GET',
        url: `/api/intents/${intentId}`,
        cookies: sessionCookie
      });

      expect(res.status).toBe(200);
      expect(res.body.data.intentId).toBe(intentId.toString());

      // Attempt to access someone else's intent (findOne returns null)
      vi.spyOn(PaymentIntent, 'findOne').mockResolvedValue(null);
      const deniedRes = await dispatchRequest(app, {
        method: 'GET',
        url: `/api/intents/${new mongoose.Types.ObjectId()}`,
        cookies: sessionCookie
      });

      expect(deniedRes.status).toBe(404);
      expect(deniedRes.body.error.code).toBe('INTENT_NOT_FOUND');
    });
  });
});
