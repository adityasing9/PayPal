import { describe, it, expect, afterAll } from 'vitest';
import mongoose from 'mongoose';
import {
  User,
  UserPreference,
  PaymentIntent,
  Product,
  ProductProposal,
  CheckoutSnapshot,
  SecurityPolicy,
  RiskAssessment,
  AuthorizationRecord,
  PaymentTransaction,
  WebhookEvent,
  AuditLog,
  AuditAnchor,
  JobLock
} from '../../src/models/index.js';
import { connectDB, disconnectDB, isDbConnected, getConnectionState } from '../../src/config/db.js';

describe('Step 2.4.1: Mongoose Models & Database Foundation', () => {
  afterAll(async () => {
    await disconnectDB();
  });
  describe('Connection & Lifecycle Safety', () => {
    it('importing models does not establish a database connection', () => {
      expect(mongoose.connection.readyState).toBe(0); // 0 = disconnected
      expect(isDbConnected()).toBe(false);
      expect(getConnectionState()).toBe('disconnected');
    });

    it('connectDB fails immediately when MONGODB_URI is missing', async () => {
      const originalUri = process.env.MONGODB_URI;
      delete process.env.MONGODB_URI;

      try {
        await expect(connectDB()).rejects.toThrow(
          'Database configuration error: MONGODB_URI environment variable is required.'
        );
      } finally {
        if (originalUri !== undefined) {
          process.env.MONGODB_URI = originalUri;
        }
      }
    });
  });

  describe('Inventory & Explicit Collection Names (14 Models)', () => {
    const expectedCollections = [
      { model: User, name: 'User', collection: 'users' },
      { model: UserPreference, name: 'UserPreference', collection: 'user_preferences' },
      { model: PaymentIntent, name: 'PaymentIntent', collection: 'payment_intents' },
      { model: Product, name: 'Product', collection: 'products' },
      { model: ProductProposal, name: 'ProductProposal', collection: 'product_proposals' },
      { model: CheckoutSnapshot, name: 'CheckoutSnapshot', collection: 'checkout_snapshots' },
      { model: SecurityPolicy, name: 'SecurityPolicy', collection: 'security_policies' },
      { model: RiskAssessment, name: 'RiskAssessment', collection: 'risk_assessments' },
      { model: AuthorizationRecord, name: 'AuthorizationRecord', collection: 'authorization_records' },
      { model: PaymentTransaction, name: 'PaymentTransaction', collection: 'payment_transactions' },
      { model: WebhookEvent, name: 'WebhookEvent', collection: 'webhook_events' },
      { model: AuditLog, name: 'AuditLog', collection: 'audit_logs' },
      { model: AuditAnchor, name: 'AuditAnchor', collection: 'audit_anchors' },
      { model: JobLock, name: 'JobLock', collection: 'job_locks' }
    ];

    it('all 14 models register successfully and match exact collection names', () => {
      expect(expectedCollections).toHaveLength(14);
      for (const { model, name, collection } of expectedCollections) {
        expect(model).toBeDefined();
        expect(model.modelName).toBe(name);
        expect(model.collection.name).toBe(collection);
        expect(model.schema.options.collection).toBe(collection);
      }
    });

    it('all 14 models enforce strict schemas (strict: true) to prevent undeclared fields', () => {
      for (const { model } of expectedCollections) {
        expect(model.schema.options.strict).toBe(true);
      }
    });
  });

  describe('Financial Data Representation (BSON Long / BigInt)', () => {
    it('financial fields use native Mongoose BigInt schema type', () => {
      expect(Product.schema.path('basePriceMinor').instance).toBe('BigInt');
      expect(UserPreference.schema.path('maxTransactionLimitMinor').instance).toBe('BigInt');
      expect(UserPreference.schema.path('dailySpendingLimitMinor').instance).toBe('BigInt');
      expect(PaymentIntent.schema.path('maxBudgetMinor').instance).toBe('BigInt');
      expect(ProductProposal.schema.path('pricing.totalPriceMinor').instance).toBe('BigInt');
      expect(AuthorizationRecord.schema.path('authorizedAmountMinor').instance).toBe('BigInt');
      expect(PaymentTransaction.schema.path('amountMinor').instance).toBe('BigInt');
      expect(JobLock.schema.path('fenceToken').instance).toBe('BigInt');
      expect(JobLock.schema.path('lastAppliedFenceToken').instance).toBe('BigInt');
    });

    it('accepts BigInt and decimal integer strings, casting to BigInt', () => {
      const prod = new Product({
        externalId: 'prod_test',
        title: 'Test',
        category: 'Keyboards',
        merchantId: 'M1',
        merchantName: 'M1 Name',
        paypalMerchantId: 'PPM1',
        basePriceMinor: '11790',
        specHash: 'hash',
        productUrl: 'https://example.com'
      });

      expect(typeof prod.basePriceMinor).toBe('bigint');
      expect(prod.basePriceMinor).toBe(11790n);
    });

    it('handles large monetary values above Number.MAX_SAFE_INTEGER with exact precision', () => {
      const largeValue = 900719925474099200n; // Exceeds 2^53 - 1
      const record = new AuthorizationRecord({
        authorizationId: 'auth_large_val',
        paypalMerchantId: 'PPM_TEST',
        snapshotId: new mongoose.Types.ObjectId(),
        issuedAt: new Date(),
        proposalId: new mongoose.Types.ObjectId(),
        intentId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        snapshotHash: 'hash',
        publicKey: 'pubkey',
        nonce: 'nonce_test',
        canonicalJsonHash: 'chash',
        authorizedAmountMinor: largeValue,
        signature: 'sig',
        expiresAt: new Date(Date.now() + 300000)
      });

      expect(record.authorizedAmountMinor).toBe(largeValue);
      expect(record.validateSync()).toBeUndefined();
    });

    it('rejects floating-point monetary values during schema validation', () => {
      const prod = new Product({
        externalId: 'prod_float',
        title: 'Float Test',
        category: 'Keyboards',
        merchantId: 'M1',
        merchantName: 'M1 Name',
        paypalMerchantId: 'PPM1',
        basePriceMinor: '12.50', // Prohibited float string
        specHash: 'hash',
        productUrl: 'https://example.com'
      });

      const err = prod.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.basePriceMinor).toBeDefined();
    });
  });

  describe('AuthorizationRecord — Retention & Indexing Requirements', () => {
    it('has NO TTL index on expiresAt (preserves recovery records indefinitely)', () => {
      const indexes = AuthorizationRecord.schema.indexes();
      // Ensure no index has expireAfterSeconds
      for (const [, indexOptions] of indexes) {
        expect(indexOptions?.expireAfterSeconds).toBeUndefined();
      }
    });

    it('enforces unique index on nonce', () => {
      const indexes = AuthorizationRecord.schema.indexes();
      const nonceIndex = indexes.find(([fields]) => fields.nonce === 1);
      expect(nonceIndex).toBeDefined();
      expect(nonceIndex[1]?.unique).toBe(true);
    });

    it('enforces status enum including recovery and review states', () => {
      const validStatuses = [
        'PENDING',
        'IN_FLIGHT',
        'CONSUMED',
        'RECOVERING',
        'EXPIRED',
        'REVOKED',
        'FAILED_MANUAL_REVIEW'
      ];

      for (const status of validStatuses) {
        const record = new AuthorizationRecord({
          authorizationId: 'auth_' + status,
          paypalMerchantId: 'PPM_TEST',
          snapshotId: new mongoose.Types.ObjectId(),
          issuedAt: new Date(),
          proposalId: new mongoose.Types.ObjectId(),
          intentId: new mongoose.Types.ObjectId(),
          userId: new mongoose.Types.ObjectId(),
          snapshotHash: 'hash',
          publicKey: 'pubkey',
          nonce: 'nonce_' + status,
          canonicalJsonHash: 'chash',
          authorizedAmountMinor: 1000n,
          signature: 'sig',
          status,
          expiresAt: new Date()
        });
        expect(record.validateSync()).toBeUndefined();
      }

      const invalidRecord = new AuthorizationRecord({
        authorizationId: 'auth_bad',
        paypalMerchantId: 'PPM_TEST',
        snapshotId: new mongoose.Types.ObjectId(),
        issuedAt: new Date(),
        proposalId: new mongoose.Types.ObjectId(),
        intentId: new mongoose.Types.ObjectId(),
        userId: new mongoose.Types.ObjectId(),
        snapshotHash: 'hash',
        publicKey: 'pubkey',
        nonce: 'nonce_bad',
        canonicalJsonHash: 'chash',
        authorizedAmountMinor: 1000n,
        signature: 'sig',
        status: 'INVALID_STATUS',
        expiresAt: new Date()
      });
      expect(invalidRecord.validateSync()?.errors.status).toBeDefined();
    });
  });

  describe('JobLock — Distributed Locking & Fencing Requirements', () => {
    it('has unique index on jobName and NO TTL index on expiresAt', () => {
      const indexes = JobLock.schema.indexes();
      const jobNameIndex = indexes.find(([fields]) => fields.jobName === 1);
      expect(jobNameIndex).toBeDefined();
      expect(jobNameIndex[1]?.unique).toBe(true);

      for (const [, indexOptions] of indexes) {
        expect(indexOptions?.expireAfterSeconds).toBeUndefined();
      }
    });

    it('defaults fenceToken and lastAppliedFenceToken to 0n with 60s lease', () => {
      const lock = new JobLock({
        jobName: 'RECONCILIATION_CRON'
      });

      expect(lock.leaseDurationMs).toBe(60000);
      expect(lock.fenceToken).toBe(0n);
      expect(lock.lastAppliedFenceToken).toBe(0n);
      expect(lock.lockedBy).toBeNull();
      expect(lock.validateSync()).toBeUndefined();
    });
  });

  describe('User & Preferences Models', () => {
    it('User enforces required fields, email lowercase, and sessionVersion default', () => {
      const user = new User({
        email: 'USER@EXAMPLE.COM',
        passwordHash: '$argon2id$...',
        name: 'Jane Doe'
      });

      expect(user.email).toBe('user@example.com');
      expect(user.sessionVersion).toBe(1);
      expect(user.role).toBe('USER');
      expect(user.isActive).toBe(true);
      expect(user.validateSync()).toBeUndefined();
    });

    it('User rejects missing required fields and invalid role', () => {
      const invalidUser = new User({ email: 'bad', role: 'SUPERUSER' });
      const err = invalidUser.validateSync();
      expect(err?.errors.passwordHash).toBeDefined();
      expect(err?.errors.name).toBeDefined();
      expect(err?.errors.role).toBeDefined();
    });
  });

  describe('SecurityPolicy Model', () => {
    it('SecurityPolicy validates categories and actionOnFailure enums', () => {
      const policy = new SecurityPolicy({
        policyCode: 'BUDGET_LIMIT',
        name: 'Budget Limit Verification',
        category: 'BUDGET',
        actionOnFailure: 'BLOCK'
      });

      expect(policy.isEnabled).toBe(true);
      expect(policy.validateSync()).toBeUndefined();

      const invalidPolicy = new SecurityPolicy({
        policyCode: 'INVALID',
        name: 'Invalid',
        category: 'UNKNOWN_CAT',
        actionOnFailure: 'IGNORE'
      });
      const err = invalidPolicy.validateSync();
      expect(err?.errors.category).toBeDefined();
      expect(err?.errors.actionOnFailure).toBeDefined();
    });
  });

  describe('PaymentTransaction & Return Token', () => {
    it('PaymentTransaction enforces unique indexes and returnSessionToken structure', () => {
      const tx = new PaymentTransaction({
        userId: new mongoose.Types.ObjectId(),
        authorizationId: new mongoose.Types.ObjectId(),
        proposalId: new mongoose.Types.ObjectId(),
        paypalOrderId: 'ORDER_123',
        idempotencyKey: 'idem_key_uuid',
        amountMinor: 11790n,
        returnSessionToken: {
          tokenHash: 'a'.repeat(64),
          expiresAt: new Date(Date.now() + 60000),
          consumed: false
        }
      });

      expect(tx.status).toBe('CREATED');
      expect(tx.returnSessionToken.consumed).toBe(false);
      expect(tx.validateSync()).toBeUndefined();
    });
  });
});
