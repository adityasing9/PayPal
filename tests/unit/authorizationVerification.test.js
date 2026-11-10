import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { PayPalService } from '../../src/services/PayPalService.js';
import { AuditLog } from '../../src/models/AuditLog.model.js';
import { trustedKeyRegistry } from '../../src/services/TrustedKeyRegistry.js';
import { authorizationRepository } from '../../src/repositories/AuthorizationRepository.js';
import { paymentTransactionRepository } from '../../src/repositories/PaymentTransactionRepository.js';
import {
  generateEd25519KeyPair,
  signEd25519,
  generateNonce
} from '../../src/utils/cryptoUtils.js';
import { hashCanonicalJson } from '../../src/utils/canonicalJson.js';

describe('SEC-01 & SEC-09: Cryptographic Authorization Verification & Key Registry', () => {
  const fixedNow = new Date('2026-11-10T12:00:00.000Z');
  let payPalService;
  let activeKeyPair;
  let previousKeyPair;
  let revokedKeyPair;
  let rogueKeyPair;
  let baseAuthRecord;
  let validOrderParams;
  let now;

  beforeEach(() => {
    vi.restoreAllMocks();
    payPalService = new PayPalService();

    activeKeyPair = generateEd25519KeyPair();
    previousKeyPair = generateEd25519KeyPair();
    revokedKeyPair = generateEd25519KeyPair();
    rogueKeyPair = generateEd25519KeyPair();

    now = new Date('2026-11-10T12:00:00.000Z');

    // Register active, retired, and revoked keys in trusted registry
    trustedKeyRegistry.reset();
    trustedKeyRegistry.registerKey({
      keyId: 'KEY_ACTIVE_V1',
      publicKeyHex: activeKeyPair.publicKeyHex,
      status: 'ACTIVE'
    });
    trustedKeyRegistry.registerKey({
      keyId: 'KEY_RETIRED_V0',
      publicKeyHex: previousKeyPair.publicKeyHex,
      status: 'RETIRED',
      retiredAt: new Date(now.getTime() - 60000), // Retired 1 minute before now
      gracePeriodMs: 300000 // 5 minutes grace
    });
    trustedKeyRegistry.registerKey({
      keyId: 'KEY_REVOKED_V0',
      publicKeyHex: revokedKeyPair.publicKeyHex,
      status: 'REVOKED',
      revokedAt: new Date(now.getTime() - 3600000)
    });

    const authorizationId = `auth_${generateNonce(8)}`;
    const intentId = new mongoose.Types.ObjectId().toString();
    const proposalId = new mongoose.Types.ObjectId().toString();
    const snapshotId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const nonce = generateNonce(32);
    const issuedAt = new Date(now.getTime() - 10000); // 10s before now
    const expiresAt = new Date(now.getTime() + 290000); // 5m total validity

    const canonicalPayload = {
      authorizationId,
      intentId,
      intentVersion: 1,
      proposalId,
      snapshotId,
      snapshotHash: 'a'.repeat(64),
      userId,
      paypalMerchantId: 'PPM_VERIFIED_MERCHANT_1',
      totalPriceMinor: '15000',
      currency: 'USD',
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      authMode: 'LIVE_FIREWALL'
    };

    const canonicalJsonHash = hashCanonicalJson(canonicalPayload);
    const signature = signEd25519(canonicalJsonHash, activeKeyPair.privateKey);

    baseAuthRecord = {
      _id: new mongoose.Types.ObjectId(),
      authorizationId,
      intentId,
      intentVersion: 1,
      proposalId,
      snapshotId,
      snapshotHash: 'a'.repeat(64),
      userId,
      paypalMerchantId: 'PPM_VERIFIED_MERCHANT_1',
      authorizedAmountMinor: 15000n,
      currency: 'USD',
      minorUnitExponent: 2,
      nonce,
      canonicalJsonHash,
      signature,
      publicKey: activeKeyPair.publicKeyHex,
      keyId: 'KEY_ACTIVE_V1',
      authMode: 'LIVE_FIREWALL',
      status: 'PENDING',
      issuedAt,
      expiresAt
    };

    validOrderParams = {
      authorizationId: baseAuthRecord.authorizationId,
      proposalId: baseAuthRecord.proposalId,
      userConsent: true,
      userId: baseAuthRecord.userId,
      idempotencyKey: 'idem_key_test_001',
      now
    };

    // Default repository mocks
    vi.spyOn(AuditLog, 'create').mockResolvedValue({});
    vi.spyOn(paymentTransactionRepository, 'findByIdempotencyKey').mockResolvedValue(null);
    vi.spyOn(paymentTransactionRepository, 'createTransaction').mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      paypalOrderId: 'PAYPAL_ORDER_MOCK_123'
    });
    vi.spyOn(paymentTransactionRepository, 'attachReturnToken').mockResolvedValue({
      plaintextToken: 'mock_return_token_sec01',
      expiresAt: new Date(now.getTime() + 60000)
    });
    vi.spyOn(authorizationRepository, 'claimNonce').mockResolvedValue(baseAuthRecord);
  });

  describe('1. Valid Authorizations & Key Lifecycle', () => {
    it('successfully creates order when authorization is valid and signed with active key', async () => {
      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(baseAuthRecord);

      const result = await payPalService.createOrder(validOrderParams);
      expect(result).toBeDefined();
      expect(result.orderId).toBeDefined();
      expect(result.amountMinor).toBe('15000');
      expect(result.currency).toBe('USD');
    });

    it('successfully creates order for authorization signed with retired key during grace period', async () => {
      // Re-sign with previous key
      const issuedAt = new Date(now.getTime() - 120000); // 2m ago (before retirement)
      const payload = {
        authorizationId: baseAuthRecord.authorizationId,
        intentId: baseAuthRecord.intentId,
        intentVersion: 1,
        proposalId: baseAuthRecord.proposalId,
        snapshotId: baseAuthRecord.snapshotId,
        snapshotHash: baseAuthRecord.snapshotHash,
        userId: baseAuthRecord.userId,
        paypalMerchantId: baseAuthRecord.paypalMerchantId,
        totalPriceMinor: '15000',
        currency: 'USD',
        nonce: baseAuthRecord.nonce,
        issuedAt: issuedAt.toISOString(),
        expiresAt: baseAuthRecord.expiresAt.toISOString(),
        authMode: 'LIVE_FIREWALL'
      };

      const hash = hashCanonicalJson(payload);
      const sig = signEd25519(hash, previousKeyPair.privateKey);

      const retiredAuthRecord = {
        ...baseAuthRecord,
        issuedAt,
        canonicalJsonHash: hash,
        signature: sig,
        publicKey: previousKeyPair.publicKeyHex,
        keyId: 'KEY_RETIRED_V0'
      };

      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(retiredAuthRecord);

      const result = await payPalService.createOrder(validOrderParams);
      expect(result).toBeDefined();
      expect(result.orderId).toBeDefined();
    });
  });

  describe('2. SEC-09: Trusted Key Registry Enforcement & Anti-Substitution', () => {
    it('rejects order with 403 KEY_SUBSTITUTION_DETECTED when stored publicKey is mutated', async () => {
      // Database attacker mutates stored publicKey to rogue key
      const substitutedAuthRecord = {
        ...baseAuthRecord,
        publicKey: rogueKeyPair.publicKeyHex
      };

      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(substitutedAuthRecord);

      await expect(payPalService.createOrder(validOrderParams)).rejects.toMatchObject({
        code: 'KEY_SUBSTITUTION_DETECTED',
        statusCode: 403
      });
    });

    it('rejects order with 403 UNKNOWN_SIGNING_KEY when keyId is unknown', async () => {
      const unknownKeyRecord = {
        ...baseAuthRecord,
        keyId: 'KEY_UNKNOWN_999'
      };

      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(unknownKeyRecord);

      await expect(payPalService.createOrder(validOrderParams)).rejects.toMatchObject({
        code: 'UNKNOWN_SIGNING_KEY',
        statusCode: 403
      });
    });

    it('rejects order with 403 REVOKED_SIGNING_KEY when keyId is revoked', async () => {
      const revokedRecord = {
        ...baseAuthRecord,
        keyId: 'KEY_REVOKED_V0',
        publicKey: revokedKeyPair.publicKeyHex
      };

      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(revokedRecord);

      await expect(payPalService.createOrder(validOrderParams)).rejects.toMatchObject({
        code: 'REVOKED_SIGNING_KEY',
        statusCode: 403
      });
    });

    it('rejects order with 403 EXPIRED_SIGNING_KEY when retired key grace period has expired', async () => {
      // Order attempt occurs 10 minutes in the future (grace period was 5 minutes)
      const futureNow = new Date(now.getTime() + 600000);
      const expiredRetiredRecord = {
        ...baseAuthRecord,
        keyId: 'KEY_RETIRED_V0',
        publicKey: previousKeyPair.publicKeyHex,
        expiresAt: new Date(now.getTime() + 1000000)
      };

      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(expiredRetiredRecord);

      await expect(
        payPalService.createOrder({
          ...validOrderParams,
          now: futureNow
        })
      ).rejects.toMatchObject({
        code: 'EXPIRED_SIGNING_KEY',
        statusCode: 403
      });
    });
  });

  describe('3. SEC-01: Canonical Hash Recomputation & Tamper Detection Across Every Field', () => {
    const tamperedFields = [
      { field: 'authorizationId', tamperedValue: 'auth_tampered_id_999', label: 'authorization ID' },
      { field: 'authorizedAmountMinor', tamperedValue: 1000n, label: 'authorized amount minor' },
      { field: 'paypalMerchantId', tamperedValue: 'PPM_ATTACKER_POCKET', label: 'PayPal merchant ID' },
      { field: 'userId', tamperedValue: new mongoose.Types.ObjectId().toString(), label: 'user ID' },
      { field: 'snapshotHash', tamperedValue: 'b'.repeat(64), label: 'snapshot hash' },
      { field: 'intentVersion', tamperedValue: 2, label: 'intent version' },
      { field: 'proposalId', tamperedValue: new mongoose.Types.ObjectId().toString(), label: 'proposal ID' },
      { field: 'intentId', tamperedValue: new mongoose.Types.ObjectId().toString(), label: 'intent ID' },
      { field: 'snapshotId', tamperedValue: new mongoose.Types.ObjectId().toString(), label: 'snapshot ID' },
      { field: 'currency', tamperedValue: 'EUR', label: 'currency' },
      { field: 'nonce', tamperedValue: generateNonce(32), label: 'cryptographic nonce' },
      { field: 'issuedAt', tamperedValue: new Date(fixedNow.getTime() - 50000), label: 'issued at timestamp' },
      { field: 'expiresAt', tamperedValue: new Date(fixedNow.getTime() + 500000), label: 'expiry timestamp' },
      { field: 'authMode', tamperedValue: 'MOCK_DETERMINISTIC', label: 'auth mode' }
    ];

    for (const { field, tamperedValue, label } of tamperedFields) {
      it(`detects tampering with ${label} (${field}) and rejects with 403 AUTHORIZATION_TAMPERING_DETECTED`, async () => {
        const tamperedRecord = {
          ...baseAuthRecord,
          [field]: tamperedValue
        };

        vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(tamperedRecord);

        // When userId is tampered, earlier USER_MISMATCH guard may fire first if userId != order userId;
        // for full tamper coverage, adjust orderParams.userId to match tamperedRecord if field is userId
        const orderParams = field === 'userId'
          ? { ...validOrderParams, userId: tamperedValue }
          : (field === 'proposalId' ? { ...validOrderParams, proposalId: tamperedValue } : validOrderParams);

        await expect(payPalService.createOrder(orderParams)).rejects.toMatchObject({
          code: 'AUTHORIZATION_TAMPERING_DETECTED',
          statusCode: 403
        });
      });
    }

    it('rejects order with 403 INVALID_AUTHORIZATION_SIGNATURE when signature is forged', async () => {
      const forgedSigRecord = {
        ...baseAuthRecord,
        signature: 'f'.repeat(128) // Forged signature
      };

      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(forgedSigRecord);

      await expect(payPalService.createOrder(validOrderParams)).rejects.toMatchObject({
        code: 'INVALID_AUTHORIZATION_SIGNATURE',
        statusCode: 403
      });
    });

    it('rejects order with 403 when attacker mutates both field and canonicalJsonHash but lacks private key', async () => {
      // Attacker changes amount to 5000n and recomputes canonicalJsonHash, but cannot forge Ed25519 signature
      const tamperedPayload = {
        authorizationId: baseAuthRecord.authorizationId,
        intentId: baseAuthRecord.intentId,
        intentVersion: 1,
        proposalId: baseAuthRecord.proposalId,
        snapshotId: baseAuthRecord.snapshotId,
        snapshotHash: baseAuthRecord.snapshotHash,
        userId: baseAuthRecord.userId,
        paypalMerchantId: baseAuthRecord.paypalMerchantId,
        totalPriceMinor: '5000',
        currency: 'USD',
        nonce: baseAuthRecord.nonce,
        issuedAt: baseAuthRecord.issuedAt.toISOString(),
        expiresAt: baseAuthRecord.expiresAt.toISOString(),
        authMode: 'LIVE_FIREWALL'
      };

      const recomputedTamperedHash = hashCanonicalJson(tamperedPayload);

      // Kept old signature signed over original 15000 payload
      const tamperedRecord = {
        ...baseAuthRecord,
        authorizedAmountMinor: 5000n,
        canonicalJsonHash: recomputedTamperedHash
      };

      vi.spyOn(authorizationRepository, 'findByAuthorizationId').mockResolvedValueOnce(tamperedRecord);

      await expect(payPalService.createOrder(validOrderParams)).rejects.toMatchObject({
        code: 'INVALID_AUTHORIZATION_SIGNATURE',
        statusCode: 403
      });
    });
  });
});
