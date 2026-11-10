import { describe, it, expect, beforeEach } from 'vitest';
import { TrustedKeyRegistry, TrustedKeyError } from '../../src/services/TrustedKeyRegistry.js';
import { generateEd25519KeyPair } from '../../src/utils/cryptoUtils.js';

describe('SEC-09: TrustedKeyRegistry', () => {
  let registry;
  let activeKeypair;
  let retiredKeypair;
  let revokedKeypair;

  beforeEach(() => {
    activeKeypair = generateEd25519KeyPair();
    retiredKeypair = generateEd25519KeyPair();
    revokedKeypair = generateEd25519KeyPair();

    const mockEnv = {
      ED25519_KEY_ID: 'KEY_ACTIVE_V1',
      ED25519_PUBLIC_KEY: activeKeypair.publicKeyHex,
      ED25519_RETIRED_KEYS: JSON.stringify({
        KEY_RETIRED_V0: {
          publicKeyHex: retiredKeypair.publicKeyHex,
          status: 'RETIRED',
          retiredAt: new Date(Date.now() - 60000).toISOString(), // Retired 1 minute ago
          gracePeriodMs: 300000 // 5 minutes grace period
        },
        KEY_REVOKED_V0: {
          publicKeyHex: revokedKeypair.publicKeyHex,
          status: 'REVOKED',
          revokedAt: new Date(Date.now() - 3600000).toISOString()
        }
      })
    };

    registry = new TrustedKeyRegistry(mockEnv);
  });

  describe('Key Resolution & Active Keys', () => {
    it('resolves active key by keyId', () => {
      const pub = registry.resolveTrustedPublicKey('KEY_ACTIVE_V1');
      expect(pub).toBe(activeKeypair.publicKeyHex.toLowerCase());
    });

    it('rejects falsy or whitespace keyId with 400 INVALID_KEY_ID', () => {
      expect(() => registry.resolveTrustedPublicKey('')).toThrow(TrustedKeyError);
      expect(() => registry.resolveTrustedPublicKey(null)).toThrow(TrustedKeyError);
      try {
        registry.resolveTrustedPublicKey('  ');
      } catch (err) {
        expect(err.code).toBe('INVALID_KEY_ID');
        expect(err.statusCode).toBe(400);
      }
    });

    it('rejects unknown keyId with 403 UNKNOWN_SIGNING_KEY', () => {
      expect(() => registry.resolveTrustedPublicKey('KEY_NON_EXISTENT')).toThrow(TrustedKeyError);
      try {
        registry.resolveTrustedPublicKey('KEY_NON_EXISTENT');
      } catch (err) {
        expect(err.code).toBe('UNKNOWN_SIGNING_KEY');
        expect(err.statusCode).toBe(403);
      }
    });
  });

  describe('Revocation Handling', () => {
    it('rejects revoked key unconditionally with 403 REVOKED_SIGNING_KEY', () => {
      expect(() => registry.resolveTrustedPublicKey('KEY_REVOKED_V0')).toThrow(TrustedKeyError);
      try {
        registry.resolveTrustedPublicKey('KEY_REVOKED_V0');
      } catch (err) {
        expect(err.code).toBe('REVOKED_SIGNING_KEY');
        expect(err.statusCode).toBe(403);
      }
    });

    it('supports dynamic administrative key revocation', () => {
      registry.revokeKey('KEY_ACTIVE_V1', 'Compromise suspected');
      expect(() => registry.resolveTrustedPublicKey('KEY_ACTIVE_V1')).toThrow(TrustedKeyError);
      try {
        registry.resolveTrustedPublicKey('KEY_ACTIVE_V1');
      } catch (err) {
        expect(err.code).toBe('REVOKED_SIGNING_KEY');
        expect(err.statusCode).toBe(403);
      }
    });
  });

  describe('Key Rotation & Grace Periods', () => {
    it('allows valid authorization signed by retired key during permitted grace period', () => {
      // Issued before retirement, checked during 5-minute grace period
      const issuedAt = new Date(Date.now() - 120000); // 2 minutes ago
      const now = new Date(); // 1 minute after retirement
      const pub = registry.resolveTrustedPublicKey('KEY_RETIRED_V0', issuedAt, now);
      expect(pub).toBe(retiredKeypair.publicKeyHex.toLowerCase());
    });

    it('rejects retired key after grace period has expired with 403 EXPIRED_SIGNING_KEY', () => {
      const issuedAt = new Date(Date.now() - 400000);
      const pastGraceNow = new Date(Date.now() + 400000); // 6+ minutes after retirement
      expect(() =>
        registry.resolveTrustedPublicKey('KEY_RETIRED_V0', issuedAt, pastGraceNow)
      ).toThrow(TrustedKeyError);

      try {
        registry.resolveTrustedPublicKey('KEY_RETIRED_V0', issuedAt, pastGraceNow);
      } catch (err) {
        expect(err.code).toBe('EXPIRED_SIGNING_KEY');
        expect(err.statusCode).toBe(403);
      }
    });

    it('rejects authorization issued AFTER a key was already retired', () => {
      const issuedAfterRetirement = new Date(Date.now()); // Issued now, but key retired 1 min ago
      const now = new Date();
      expect(() =>
        registry.resolveTrustedPublicKey('KEY_RETIRED_V0', issuedAfterRetirement, now)
      ).toThrow(TrustedKeyError);

      try {
        registry.resolveTrustedPublicKey('KEY_RETIRED_V0', issuedAfterRetirement, now);
      } catch (err) {
        expect(err.code).toBe('RETIRED_KEY_USED_AFTER_RETIREMENT');
        expect(err.statusCode).toBe(403);
      }
    });
  });

  describe('Configuration Parsing & Array Format', () => {
    it('parses ED25519_RETIRED_KEYS in array format', () => {
      const k1 = generateEd25519KeyPair();
      const mockEnvArray = {
        ED25519_KEY_ID: 'KEY_ARR_ACTIVE',
        ED25519_PUBLIC_KEY: activeKeypair.publicKeyHex,
        ED25519_RETIRED_KEYS: JSON.stringify([
          {
            keyId: 'KEY_ARR_RETIRED',
            publicKeyHex: k1.publicKeyHex,
            status: 'RETIRED',
            retiredAt: new Date().toISOString()
          }
        ])
      };

      const reg = new TrustedKeyRegistry(mockEnvArray);
      expect(reg.hasKey('KEY_ARR_RETIRED')).toBe(true);
      expect(reg.resolveTrustedPublicKey('KEY_ARR_RETIRED', new Date(Date.now() - 1000))).toBe(
        k1.publicKeyHex.toLowerCase()
      );
    });

    it('unconditionally rejects compromised KEY_INTENTLOCK_DEV_V1 with 403 REVOKED_SIGNING_KEY', () => {
      const defaultRegistry = new TrustedKeyRegistry();
      expect(defaultRegistry.hasKey('KEY_INTENTLOCK_DEV_V1')).toBe(true);
      expect(() => defaultRegistry.resolveTrustedPublicKey('KEY_INTENTLOCK_DEV_V1')).toThrow(
        expect.objectContaining({
          code: 'REVOKED_SIGNING_KEY',
          statusCode: 403
        })
      );
    });
  });
});
