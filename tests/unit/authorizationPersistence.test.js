import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { AuthorizationRecord, AuthorizationRecordSchema } from '../../src/models/AuthorizationRecord.model.js';
import { RiskAssessment } from '../../src/models/RiskAssessment.model.js';
import { authorizationRepository } from '../../src/repositories/AuthorizationRepository.js';
import { securityFirewallService } from '../../src/services/SecurityFirewallService.js';
import { computeSnapshotCanonicalHash } from '../../src/utils/canonicalJson.js';

describe('SEC-02: Authorization Record Persistence & Strict Schema Alignment', () => {
  const buildValidRecordData = () => ({
    authorizationId: `auth_${Date.now()}_test`,
    proposalId: new mongoose.Types.ObjectId(),
    intentId: new mongoose.Types.ObjectId(),
    intentVersion: 1,
    snapshotId: new mongoose.Types.ObjectId(),
    snapshotHash: 'a'.repeat(64),
    userId: new mongoose.Types.ObjectId(),
    paypalMerchantId: 'PPM_TEST_MERCHANT_123',
    algorithm: 'Ed25519',
    publicKey: 'b'.repeat(64),
    keyId: 'FIREWALL_KEY_PRIMARY',
    nonce: `nonce_${Date.now()}_${Math.random()}`,
    canonicalJsonHash: 'c'.repeat(64),
    authorizedAmountMinor: 12500n,
    currency: 'USD',
    minorUnitExponent: 2,
    signature: 'd'.repeat(128),
    authMode: 'LIVE_FIREWALL',
    status: 'PENDING',
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 300000)
  });

  describe('1. Mongoose Schema Contract & Field Persistence', () => {
    it('validates a complete, compliant authorization record with all required signed fields', () => {
      const data = buildValidRecordData();
      const doc = new AuthorizationRecord(data);
      const validationError = doc.validateSync();
      expect(validationError).toBeUndefined();

      expect(doc.authorizationId).toBe(data.authorizationId);
      expect(doc.paypalMerchantId).toBe(data.paypalMerchantId);
      expect(doc.snapshotId).toEqual(data.snapshotId);
      expect(doc.issuedAt).toEqual(data.issuedAt);
      expect(doc.canonicalJsonHash).toBe(data.canonicalJsonHash);
      expect(doc.authorizedAmountMinor).toBe(12500n);
      expect(doc.signature).toBe(data.signature);
      expect(doc.publicKey).toBe(data.publicKey);
      expect(doc.keyId).toBe(data.keyId);
    });

    it('enforces required constraints on all signed attributes', () => {
      const requiredFields = [
        'authorizationId',
        'proposalId',
        'intentId',
        'snapshotId',
        'snapshotHash',
        'userId',
        'paypalMerchantId',
        'publicKey',
        'nonce',
        'canonicalJsonHash',
        'authorizedAmountMinor',
        'signature',
        'issuedAt',
        'expiresAt'
      ];

      for (const field of requiredFields) {
        const data = buildValidRecordData();
        delete data[field];
        const doc = new AuthorizationRecord(data);
        const err = doc.validateSync();
        expect(err, `Expected validation error for missing field: ${field}`).toBeDefined();
        expect(err.errors[field], `Expected error at path ${field}`).toBeDefined();
      }
    });

    it('discards unmodeled fields under Mongoose strict: true', () => {
      const data = {
        ...buildValidRecordData(),
        rogueField: 'injected_value',
        unknownMetadata: { evil: true }
      };

      const doc = new AuthorizationRecord(data);
      expect(doc.get('rogueField')).toBeUndefined();
      expect(doc.get('unknownMetadata')).toBeUndefined();
      expect(doc.toObject().rogueField).toBeUndefined();
      expect(doc.toObject().unknownMetadata).toBeUndefined();
    });

    it('supports totalPriceMinor as a transparent alias for authorizedAmountMinor', () => {
      const data = buildValidRecordData();
      delete data.authorizedAmountMinor;
      data.totalPriceMinor = 19999n;

      const doc = new AuthorizationRecord(data);
      expect(doc.validateSync()).toBeUndefined();
      expect(doc.authorizedAmountMinor).toBe(19999n);
      expect(doc.totalPriceMinor).toBe(19999n);
      expect(doc.toObject().authorizedAmountMinor).toBe(19999n);
    });

    it('casts string minor unit amounts safely via totalPriceMinor alias', () => {
      const data = buildValidRecordData();
      delete data.authorizedAmountMinor;
      data.totalPriceMinor = '35000';

      const doc = new AuthorizationRecord(data);
      expect(doc.validateSync()).toBeUndefined();
      expect(doc.authorizedAmountMinor).toBe(35000n);
      expect(doc.totalPriceMinor).toBe(35000n);
    });

    it('enforces non-negative BigInt for authorizedAmountMinor', () => {
      const data = {
        ...buildValidRecordData(),
        authorizedAmountMinor: -100n
      };

      const doc = new AuthorizationRecord(data);
      const err = doc.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.authorizedAmountMinor).toBeDefined();
    });
  });

  describe('2. Index Invariants (No TTL & Unique Nonce/AuthorizationId)', () => {
    it('verifies unique indexes on nonce and authorizationId', () => {
      const indexes = AuthorizationRecordSchema.indexes();
      const nonceIndex = indexes.find(([fields]) => fields.nonce === 1);
      expect(nonceIndex).toBeDefined();
      expect(nonceIndex[1]?.unique).toBe(true);

      const authIdIndex = indexes.find(([fields]) => fields.authorizationId === 1);
      expect(authIdIndex).toBeDefined();
      expect(authIdIndex[1]?.unique).toBe(true);
    });

    it('verifies standard query index on paypalMerchantId', () => {
      const indexes = AuthorizationRecordSchema.indexes();
      const merchantIndex = indexes.find(([fields]) => fields.paypalMerchantId === 1);
      expect(merchantIndex).toBeDefined();
    });

    it('guarantees zero TTL (expireAfterSeconds) on expiresAt index', () => {
      const indexes = AuthorizationRecordSchema.indexes();
      for (const [, options] of indexes) {
        expect(options?.expireAfterSeconds).toBeUndefined();
      }
    });
  });

  describe('3. Persistence Error Propagation & Anti-Swallowing (SEC-02)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      vi.spyOn(RiskAssessment, 'create').mockResolvedValue({});
    });

    const validIntent = {
      id: new mongoose.Types.ObjectId().toString(),
      version: 1,
      maxBudgetMinor: '20000',
      currency: 'USD',
      minorUnitExponent: 2
    };

    const rawSnapshot = {
      snapshotId: new mongoose.Types.ObjectId().toString(),
      proposalId: new mongoose.Types.ObjectId().toString(),
      productId: 'prod_keyboard_k2',
      variantSku: 'SKU_K2_TEST',
      merchantId: 'MERCHANT_KEYCHRON',
      paypalMerchantId: 'PPM_KEYCHRON_998',
      lineItems: [
        {
          sku: 'SKU_K2_TEST',
          name: 'Keychron K2 Test',
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
      rawDescription: 'Valid test snapshot'
    };

    const validSnapshot = {
      ...rawSnapshot,
      snapshotHash: computeSnapshotCanonicalHash(rawSnapshot)
    };

    it('fails closed when authorizationRepository.createAuthorization throws persistence error', async () => {
      const dbError = new Error('MongoDB write error: connection pool exhausted');
      vi.spyOn(authorizationRepository, 'createAuthorization').mockRejectedValueOnce(dbError);

      await expect(
        securityFirewallService.evaluateProposal({
          intent: validIntent,
          snapshot: validSnapshot,
          userId: new mongoose.Types.ObjectId().toString()
        })
      ).rejects.toThrow('MongoDB write error: connection pool exhausted');
    });

    it('persists all required signed fields including canonicalJsonHash and authorizedAmountMinor', async () => {
      let capturedPayload = null;
      vi.spyOn(authorizationRepository, 'createAuthorization').mockImplementation(async (payload) => {
        capturedPayload = payload;
        return { ...payload, _id: new mongoose.Types.ObjectId() };
      });

      const userIdStr = new mongoose.Types.ObjectId().toString();
      const result = await securityFirewallService.evaluateProposal({
        intent: validIntent,
        snapshot: validSnapshot,
        userId: userIdStr
      });

      expect(result.decision).toBe('PASS');
      expect(result.authorization).toBeDefined();

      // Assert all signed attributes passed to persistence
      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.authorizationId).toMatch(/^auth_/);
      expect(capturedPayload.intentId).toBe(validIntent.id);
      expect(capturedPayload.intentVersion).toBe(1);
      expect(capturedPayload.proposalId).toBe(validSnapshot.proposalId);
      expect(capturedPayload.snapshotId).toBe(validSnapshot.snapshotId);
      expect(capturedPayload.snapshotHash).toBe(validSnapshot.snapshotHash);
      expect(capturedPayload.userId).toBe(userIdStr);
      expect(capturedPayload.paypalMerchantId).toBe('PPM_KEYCHRON_998');
      expect(capturedPayload.authorizedAmountMinor).toBe(9900n);
      expect(capturedPayload.currency).toBe('USD');
      expect(capturedPayload.nonce).toHaveLength(64); // 32 bytes hex
      expect(capturedPayload.canonicalJsonHash).toHaveLength(64); // SHA-256
      expect(capturedPayload.signature).toHaveLength(128); // Ed25519 64 bytes hex
      expect(capturedPayload.publicKey).toHaveLength(64);
      expect(capturedPayload.keyId).toBeDefined();
      expect(capturedPayload.status).toBe('PENDING');
      expect(capturedPayload.issuedAt).toBeInstanceOf(Date);
      expect(capturedPayload.expiresAt).toBeInstanceOf(Date);

      // Verify that the payload actually satisfies the Mongoose model validation
      const modelDoc = new AuthorizationRecord(capturedPayload);
      expect(modelDoc.validateSync()).toBeUndefined();
    });
  });
});
