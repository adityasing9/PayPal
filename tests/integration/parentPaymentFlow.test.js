import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app as paymentApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import {
  AuthorizationRecord,
  CheckoutSnapshot,
  PaymentIntent,
  PaymentTransaction,
  ProductProposal,
  User,
  UserPreference
} from '../../src/models/index.js';
import { authService } from '../../src/services/AuthService.js';
import { catalogService } from '../../src/services/CatalogService.js';
import { proposalService } from '../../src/services/ProposalService.js';
import { paymentTransactionRepository } from '../../src/repositories/PaymentTransactionRepository.js';
import { generateCsrfToken } from '../../src/utils/cryptoUtils.js';
import { startFlaskAuthorizationService } from '../helpers/liveFlaskAuthorizationService.js';

const require = createRequire(import.meta.url);
const parentApp = require('../../../server.js');
const mongoTestUri = process.env.MONGODB_TEST_URI;

describe('Parent BFF to Node and Flask payment integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.skipIf(!mongoTestUri)(
    'authorizes stored purchase data and safely recovers order persistence failures with the same key',
    async () => {
      const databaseName = `intentlock_bff_test_${process.pid}_${Date.now()}`;
      const parentSecret = 'integration-test-parent-secret-000000000000';
      const previous = {
        parentSecret: process.env.PAYMENT_BACKEND_INTERNAL_KEY,
        parentUrl: process.env.PAYMENT_BACKEND_BASE_URL,
        nodeBffSecret: env.PARENT_BFF_SECRET,
        flaskBaseUrl: env.FLASK_INTENTLOCK_BASE_URL,
        flaskPublicKey: env.FLASK_INTENTLOCK_PUBLIC_KEY,
        flaskServiceToken: env.FLASK_INTENTLOCK_SERVICE_TOKEN
      };
      let flaskService;
      let nestedServer;
      let databaseConnected = false;

      try {
        await mongoose.connect(mongoTestUri, {
          dbName: databaseName,
          serverSelectionTimeoutMS: 5000,
          autoIndex: true
        });
        databaseConnected = true;
        await Promise.all([
          User.init(),
          UserPreference.init(),
          PaymentIntent.init(),
          ProductProposal.init(),
          CheckoutSnapshot.init(),
          AuthorizationRecord.init(),
          PaymentTransaction.init()
        ]);

        const user = await User.create({
          email: `bff-${databaseName}@example.test`,
          passwordHash: 'not-used-by-session-authentication',
          name: 'Integration Test User',
          sessionVersion: 1
        });
        const product = catalogService.getProductById('prod_k2_pro');
        const intent = await PaymentIntent.create({
          userId: user._id,
          prompt: 'A wireless mechanical keyboard',
          maxBudgetMinor: 20000n,
          currency: 'USD',
          minorUnitExponent: 2,
          category: 'Keyboards',
          constraints: { requiredSpecs: {} }
        });
        const proposal = await proposalService.createProposal({
          intentId: intent._id.toString(),
          productId: product.externalId,
          variantSku: 'K2P-WHT-TAC-BROWN',
          title: product.title,
          merchant: {
            id: product.merchantId,
            name: product.merchantName,
            paypalMerchantId: product.paypalMerchantId
          },
          lineItems: [{
            name: product.title,
            sku: 'K2P-WHT-TAC-BROWN',
            quantity: 1,
            unitPriceMinor: product.basePriceMinor
          }],
          pricing: {
            basePriceMinor: '9900',
            shippingMinor: '1000',
            taxMinor: '890',
            discountMinor: '0',
            totalPriceMinor: '11790',
            currency: 'USD',
            minorUnitExponent: 2
          },
          specifications: product.specifications,
          recurring: { isRecurring: false, billingInterval: null, billingCycles: 0 },
          catalogSource: product.catalogSource,
          productUrl: product.productUrl
        });
        await UserPreference.create({
          userId: user._id,
          defaultCurrency: 'USD',
          minorUnitExponent: 2,
          maxTransactionLimitMinor: 50000n,
          dailySpendingLimitMinor: 100000n,
          allowedMerchants: [product.merchantId],
          blockedMerchants: [],
          requireExplicitReviewOverMinor: 20000n
        });

        const sessionToken = authService.generateSessionJwt(user);
        const csrfToken = generateCsrfToken({
          userId: user._id.toString(),
          sessionVersion: user.sessionVersion,
          secret: env.CSRF_SECRET
        });

        flaskService = await startFlaskAuthorizationService();
        env.PARENT_BFF_SECRET = parentSecret;
        env.FLASK_INTENTLOCK_BASE_URL = flaskService.baseUrl;
        env.FLASK_INTENTLOCK_PUBLIC_KEY = flaskService.publicKey;
        env.FLASK_INTENTLOCK_SERVICE_TOKEN = flaskService.serviceToken;
        process.env.PAYMENT_BACKEND_INTERNAL_KEY = parentSecret;

        nestedServer = createServer(paymentApp);
        await new Promise((resolve, reject) => {
          nestedServer.once('error', reject);
          nestedServer.listen(0, '127.0.0.1', resolve);
        });
        const { port } = nestedServer.address();
        process.env.PAYMENT_BACKEND_BASE_URL = `http://127.0.0.1:${port}`;

        const orderRequest = () => request(parentApp)
          .post('/api/payments/create-order')
          .set('Cookie', `${env.COOKIE_NAME}=${sessionToken}`)
          .set('X-CSRF-Token', csrfToken)
          .set('Idempotency-Key', 'integration-order-key-0001')
          .send({
            proposalId: proposal.proposalId,
            userConsent: true,
            acknowledgedReviewDiffs: [],
            amountMinor: '1',
            currency: 'EUR',
            paypalMerchantId: 'ATTACKER'
          });

        const createTransaction = paymentTransactionRepository.createTransaction.bind(
          paymentTransactionRepository
        );
        let failFirstPersistence = true;
        vi.spyOn(paymentTransactionRepository, 'createTransaction').mockImplementation(async (data) => {
          if (failFirstPersistence) {
            failFirstPersistence = false;
            throw new Error('test-only transaction persistence failure');
          }
          return createTransaction(data);
        });

        const ambiguousResponse = await orderRequest();
        expect(ambiguousResponse.status).toBe(500);
        expect(await AuthorizationRecord.countDocuments()).toBe(1);
        expect(await PaymentTransaction.countDocuments()).toBe(0);

        const firstResponse = await orderRequest();
        expect(firstResponse.status).toBe(201);
        expect(firstResponse.body.success).toBe(true);
        expect(firstResponse.body.data.amountMinor).toBe('11790');
        expect(firstResponse.body.data.currency).toBe('USD');
        expect(firstResponse.body.data.authorization).toMatchObject({
          protocol: 'INTENTLOCK_V2_ED25519',
          intentId: intent._id.toString(),
          proposalId: proposal.proposalId,
          amountMinor: '11790',
          currency: 'USD',
          paypalMerchantId: product.paypalMerchantId
        });

        const retryResponse = await orderRequest();
        expect(retryResponse.status).toBe(201);
        expect(retryResponse.body.data.orderId).toBe(firstResponse.body.data.orderId);
        expect(await PaymentTransaction.countDocuments()).toBe(1);
        expect(await AuthorizationRecord.countDocuments()).toBe(1);
      } finally {
        if (nestedServer?.listening) {
          await new Promise((resolve, reject) => {
            nestedServer.close((error) => (error ? reject(error) : resolve()));
          });
        }
        if (flaskService) {
          await flaskService.stop();
        }
        if (databaseConnected) {
          await mongoose.connection.dropDatabase();
          await mongoose.disconnect();
        }
        process.env.PAYMENT_BACKEND_INTERNAL_KEY = previous.parentSecret;
        process.env.PAYMENT_BACKEND_BASE_URL = previous.parentUrl;
        env.PARENT_BFF_SECRET = previous.nodeBffSecret;
        env.FLASK_INTENTLOCK_BASE_URL = previous.flaskBaseUrl;
        env.FLASK_INTENTLOCK_PUBLIC_KEY = previous.flaskPublicKey;
        env.FLASK_INTENTLOCK_SERVICE_TOKEN = previous.flaskServiceToken;
      }
    },
    30000
  );
});
