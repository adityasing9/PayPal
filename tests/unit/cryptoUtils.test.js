import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  generateEd25519KeyPair,
  signEd25519,
  verifyEd25519,
  generateNonce,
  timingSafeEqualHex,
  generateCsrfToken,
  verifyCsrfToken,
  generateReturnToken,
  hashReturnToken
} from '../../src/utils/cryptoUtils.js';

describe('Step 2.3: Cryptographic Utilities (cryptoUtils)', () => {
  describe('timingSafeEqualHex', () => {
    it('returns true for matching hex strings', () => {
      const a = 'abcdef0123456789';
      const b = 'abcdef0123456789';
      expect(timingSafeEqualHex(a, b)).toBe(true);
    });

    it('returns false for mismatched hex strings of same length', () => {
      const a = 'abcdef0123456789';
      const b = 'abcdef0123456780';
      expect(timingSafeEqualHex(a, b)).toBe(false);
    });

    it('returns false safely without throwing for different lengths', () => {
      expect(timingSafeEqualHex('abcdef', 'abcdef01')).toBe(false);
      expect(timingSafeEqualHex('', '')).toBe(false);
      expect(timingSafeEqualHex(null, 'abc')).toBe(false);
    });
  });

  describe('generateNonce', () => {
    it('generates a 64-character hex string (256 bits by default)', () => {
      const nonce = generateNonce();
      expect(nonce).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates unique nonces across successive calls', () => {
      const nonces = new Set(Array.from({ length: 100 }, () => generateNonce()));
      expect(nonces.size).toBe(100);
    });
  });

  describe('Ed25519 Key Generation, Signing, and Verification', () => {
    it('generates valid Ed25519 keypair and raw 32-byte hex keys', () => {
      const keypair = generateEd25519KeyPair();
      expect(keypair.publicKeyHex).toMatch(/^[a-f0-9]{64}$/);
      expect(keypair.privateKeyHex).toMatch(/^[a-f0-9]{64}$/);
      expect(keypair.publicKey.asymmetricKeyType).toBe('ed25519');
    });

    it('signs and verifies a string payload using KeyObjects', () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const payload = 'canonical-authorization-content';

      const signature = signEd25519(payload, privateKey);
      expect(signature).toMatch(/^[a-f0-9]{128}$/); // 64 bytes hex

      const isValid = verifyEd25519(payload, signature, publicKey);
      expect(isValid).toBe(true);
    });

    it('signs and verifies an object payload automatically canonicalized via RFC 8785', () => {
      const { publicKeyHex, privateKeyHex } = generateEd25519KeyPair();
      const payload = {
        authorizationId: 'auth_9910',
        totalPriceMinor: '11790',
        currency: 'USD',
        nonce: generateNonce()
      };

      // Sign with raw hex private key seed
      const signature = signEd25519(payload, privateKeyHex);

      // Verify with raw hex public key seed
      const isValid = verifyEd25519(payload, signature, publicKeyHex);
      expect(isValid).toBe(true);

      // Same object with scrambled key order should still verify (RFC 8785 invariant)
      const scrambledPayload = {
        currency: payload.currency,
        nonce: payload.nonce,
        totalPriceMinor: payload.totalPriceMinor,
        authorizationId: payload.authorizationId
      };
      expect(verifyEd25519(scrambledPayload, signature, publicKeyHex)).toBe(true);
    });

    it('rejects tampered payload', () => {
      const { publicKey, privateKey } = generateEd25519KeyPair();
      const payload = { amount: '1000' };
      const signature = signEd25519(payload, privateKey);

      const tampered = { amount: '1001' };
      expect(verifyEd25519(tampered, signature, publicKey)).toBe(false);
    });

    it('rejects verification with a different public key', () => {
      const keypair1 = generateEd25519KeyPair();
      const keypair2 = generateEd25519KeyPair();

      const payload = 'sensitive-authorization-data';
      const signature = signEd25519(payload, keypair1.privateKey);

      expect(verifyEd25519(payload, signature, keypair2.publicKey)).toBe(false);
    });

    it('rejects invalid signature length or malformed signature', () => {
      const { publicKey } = generateEd25519KeyPair();
      expect(verifyEd25519('test', 'short-sig', publicKey)).toBe(false);
      expect(verifyEd25519('test', '0'.repeat(128), publicKey)).toBe(false);
    });
  });

  describe('Session-Bound CSRF Token Protection', () => {
    const secret = 'super-secret-csrf-key-for-testing';
    const userId = 'usr_672d1a2b';
    const sessionVersion = 3;

    it('generates a valid CSRF token and verifies successfully', () => {
      const token = generateCsrfToken({ userId, sessionVersion, secret });
      expect(token).toContain('.');

      const result = verifyCsrfToken(token, {
        expectedUserId: userId,
        expectedSessionVersion: sessionVersion,
        secret
      });

      expect(result.valid).toBe(true);
      expect(result.payload.userId).toBe(userId);
      expect(result.payload.sessionVersion).toBe(sessionVersion);
      expect(result.payload.nonce).toMatch(/^[a-f0-9]{32}$/);
    });

    it('handles user IDs with colons safely due to length-delimited encoding', () => {
      const trickyUserId = 'usr:with:colons:123';
      const token = generateCsrfToken({ userId: trickyUserId, sessionVersion, secret });

      const result = verifyCsrfToken(token, {
        expectedUserId: trickyUserId,
        expectedSessionVersion: sessionVersion,
        secret
      });

      expect(result.valid).toBe(true);
      expect(result.payload.userId).toBe(trickyUserId);
    });

    it('rejects token signed with wrong secret', () => {
      const token = generateCsrfToken({ userId, sessionVersion, secret });

      const result = verifyCsrfToken(token, {
        expectedUserId: userId,
        expectedSessionVersion: sessionVersion,
        secret: 'wrong-secret'
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SIGNATURE_VERIFICATION_FAILED');
    });

    it('rejects token if userId does not match (session hijacking prevention)', () => {
      const token = generateCsrfToken({ userId, sessionVersion, secret });

      const result = verifyCsrfToken(token, {
        expectedUserId: 'usr_different_user',
        expectedSessionVersion: sessionVersion,
        secret
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('USER_MISMATCH');
    });

    it('rejects token if sessionVersion does not match (immediate session revocation on logout/password change)', () => {
      const token = generateCsrfToken({ userId, sessionVersion: 1, secret });

      // User bumped sessionVersion to 2
      const result = verifyCsrfToken(token, {
        expectedUserId: userId,
        expectedSessionVersion: 2,
        secret
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SESSION_VERSION_MISMATCH');
    });

    it('rejects expired CSRF token', () => {
      const token = generateCsrfToken({ userId, sessionVersion, secret });

      // Simulate expired token with maxAgeMs = -1
      const result = verifyCsrfToken(token, {
        expectedUserId: userId,
        expectedSessionVersion: sessionVersion,
        secret,
        maxAgeMs: -1
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('TOKEN_EXPIRED');
    });

    it('rejects malformed token strings', () => {
      expect(verifyCsrfToken('malformed', { expectedUserId: userId, expectedSessionVersion: 1, secret }).valid).toBe(
        false
      );
      expect(verifyCsrfToken('a.b.c', { expectedUserId: userId, expectedSessionVersion: 1, secret }).valid).toBe(false);
    });
  });

  describe('PayPal Ephemeral Return Tokens', () => {
    it('generates 64-character random hex return token', () => {
      const token = generateReturnToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('computes deterministic SHA-256 hash of return token', () => {
      const token = 'a'.repeat(64);
      const expectedHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

      expect(hashReturnToken(token)).toBe(expectedHash);
    });

    it('throws when hashing empty or non-string return token', () => {
      expect(() => hashReturnToken('')).toThrow(TypeError);
      expect(() => hashReturnToken(null)).toThrow(TypeError);
    });
  });
});
