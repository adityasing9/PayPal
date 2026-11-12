
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateProductionConfig, env } from '../../src/config/env.js';
import { SecurityFirewallService } from '../../src/services/SecurityFirewallService.js';
import { generateEd25519KeyPair } from '../../src/utils/cryptoUtils.js';

describe('SEC-07: Production Configuration & Keypair Hardening', () => {
  let validKeyPair;
  let mismatchedKeyPair;

  beforeEach(() => {
    validKeyPair = generateEd25519KeyPair();
    mismatchedKeyPair = generateEd25519KeyPair();
  });

  // Provides all required production settings.
  // Individual tests override only the setting they want to validate.
  const productionConfig = (overrides = {}) => ({
    NODE_ENV: 'production',

    // PayPal Sandbox
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_CLIENT_ID: 'sandbox-test-client',
    PAYPAL_CLIENT_SECRET: 'sandbox-test-secret',

    // Mock adapters
    USE_MOCK_SECURITY: false,
    USE_MOCK_PAYPAL: false,

    // Session and CSRF
    SESSION_SECRET: 's'.repeat(32),
    CSRF_SECRET: 'c'.repeat(32),

    // Ed25519 signing keys
    ED25519_PRIVATE_KEY: validKeyPair.privateKeyHex,
    ED25519_PUBLIC_KEY: validKeyPair.publicKeyHex,
    ED25519_KEY_ID: 'KEY_TEST_PROD_V1',

    // Parent BFF authentication
    PARENT_BFF_SECRET: 'b'.repeat(32),

    // Flask IntentLock authentication
    FLASK_INTENTLOCK_PUBLIC_KEY: 'a'.repeat(64),
    FLASK_INTENTLOCK_SERVICE_TOKEN: 'f'.repeat(32),

    ...overrides
  });

  describe('validateProductionConfig', () => {
    it('ignores non-production environments', () => {
      expect(() => {
        validateProductionConfig({
          NODE_ENV: 'development',
          USE_MOCK_SECURITY: true
        });
      }).not.toThrow();
    });

    it('throws when USE_MOCK_SECURITY is true in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({ USE_MOCK_SECURITY: true })
        );
      }).toThrow(
        'SECURITY VIOLATION: USE_MOCK_SECURITY cannot be enabled in production.'
      );
    });

    it('throws when USE_MOCK_PAYPAL is true in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({ USE_MOCK_PAYPAL: true })
        );
      }).toThrow(
        'SECURITY VIOLATION: USE_MOCK_PAYPAL cannot be enabled in production.'
      );
    });

    it('throws when SESSION_SECRET is too short in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({ SESSION_SECRET: 'too-short' })
        );
      }).toThrow(
        'SECURITY VIOLATION: SESSION_SECRET must be at least 32 characters in production.'
      );
    });

    it('throws when CSRF_SECRET is too short in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({ CSRF_SECRET: 'short' })
        );
      }).toThrow(
        'SECURITY VIOLATION: CSRF_SECRET must be at least 32 characters in production.'
      );
    });

    it('throws when ED25519_PRIVATE_KEY is missing or invalid in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({ ED25519_PRIVATE_KEY: '' })
        );
      }).toThrow(
        'SECURITY VIOLATION: ED25519_PRIVATE_KEY must be a 64-char hex string or PKCS#8 PEM in production.'
      );
    });

    it('throws when ED25519_PUBLIC_KEY is missing or invalid in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({ ED25519_PUBLIC_KEY: 'not-64-hex' })
        );
      }).toThrow(
        'SECURITY VIOLATION: ED25519_PUBLIC_KEY must be a 64-char hex string or SPKI PEM in production.'
      );
    });

    it('throws when ED25519_KEY_ID is missing in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({ ED25519_KEY_ID: '' })
        );
      }).toThrow(
        'SECURITY VIOLATION: A valid non-retired ED25519_KEY_ID must be configured.'
      );
    });

    it('throws when ED25519_PUBLIC_KEY does not match ED25519_PRIVATE_KEY in production', () => {
      expect(() => {
        validateProductionConfig(
          productionConfig({
            ED25519_PUBLIC_KEY: mismatchedKeyPair.publicKeyHex
          })
        );
      }).toThrow(
        'SECURITY VIOLATION: ED25519_PUBLIC_KEY does not match ED25519_PRIVATE_KEY.'
      );
    });

    it('succeeds when all production parameters are valid and keypair matches', () => {
      expect(() => {
        validateProductionConfig(productionConfig());
      }).not.toThrow();
    });
  });

  describe('SecurityFirewallService.getKeyPair in production', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = {
        NODE_ENV: env.NODE_ENV,
        ED25519_PRIVATE_KEY: env.ED25519_PRIVATE_KEY,
        ED25519_PUBLIC_KEY: env.ED25519_PUBLIC_KEY
      };
    });

    afterEach(() => {
      env.NODE_ENV = originalEnv.NODE_ENV;
      env.ED25519_PRIVATE_KEY = originalEnv.ED25519_PRIVATE_KEY;
      env.ED25519_PUBLIC_KEY = originalEnv.ED25519_PUBLIC_KEY;
    });

    it('throws if keys are missing in production rather than generating ephemeral keys', () => {
      env.NODE_ENV = 'production';
      env.ED25519_PRIVATE_KEY = '';
      env.ED25519_PUBLIC_KEY = '';

      const service = new SecurityFirewallService();

      expect(() => service.getKeyPair()).toThrow(
        'SECURITY VIOLATION: Ephemeral signing key generation prohibited in production.'
      );
    });

    it('throws if configured public key does not match private key', () => {
      env.ED25519_PRIVATE_KEY = validKeyPair.privateKeyHex;
      env.ED25519_PUBLIC_KEY = mismatchedKeyPair.publicKeyHex;

      const service = new SecurityFirewallService();

      expect(() => service.getKeyPair()).toThrow(
        'SECURITY VIOLATION: Configured ED25519_PUBLIC_KEY does not match ED25519_PRIVATE_KEY.'
      );
    });

    it('successfully returns keypair when keys match', () => {
      env.ED25519_PRIVATE_KEY = validKeyPair.privateKeyHex;
      env.ED25519_PUBLIC_KEY = validKeyPair.publicKeyHex;

      const service = new SecurityFirewallService();
      const kp = service.getKeyPair();

      expect(kp.publicKeyHex).toBe(validKeyPair.publicKeyHex);
      expect(kp.privateKeyHex).toBe(validKeyPair.privateKeyHex);
    });
  });
});
