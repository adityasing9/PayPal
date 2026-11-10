import dotenv from 'dotenv';
import { validateEd25519KeyPair } from '../utils/cryptoUtils.js';

// Load .env file if present
dotenv.config();

/**
 * Validates and exports centralized environment configuration.
 * Fails fast on invalid production configuration.
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  APP_ORIGIN: process.env.APP_ORIGIN || 'http://localhost:3000',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5000/api',
  TRUST_PROXY_HOPS: parseInt(process.env.TRUST_PROXY_HOPS || '0', 10),

  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/intentlock',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'intentlock',

  // Authentication & Security
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-fallback-session-secret-at-least-32-chars-long!',
  CSRF_SECRET: process.env.CSRF_SECRET || 'dev-fallback-csrf-secret-at-least-32-chars-long!',
  COOKIE_NAME: 'intentlock_session',
  COOKIE_MAX_AGE_MS: 86400 * 1000, // 24 hours

  // Ed25519 Signing Vault
  ED25519_KEY_ID: process.env.ED25519_KEY_ID || 'KEY_INTENTLOCK_DEV_V2',
  ED25519_PUBLIC_KEY: process.env.ED25519_PUBLIC_KEY || '',
  ED25519_PRIVATE_KEY: process.env.ED25519_PRIVATE_KEY || '',
  ED25519_RETIRED_KEYS: process.env.ED25519_RETIRED_KEYS || JSON.stringify([
    {
      keyId: 'KEY_INTENTLOCK_DEV_V1',
      publicKeyHex: '4df93f582d2b31f519c1982bb55c1aa46b4d64498fa04164eeb36c44c0f1cca9',
      status: 'REVOKED',
      revokedAt: '2026-11-10T16:00:00.000Z'
    }
  ]),

  // Adapters
  USE_MOCK_SECURITY: process.env.USE_MOCK_SECURITY === 'true',
  USE_MOCK_PAYPAL: process.env.USE_MOCK_PAYPAL === 'true',

  // PayPal
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID || '',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // High-value threshold for audit anchoring
  HIGH_VALUE_ANCHOR_THRESHOLD_MINOR: BigInt(process.env.HIGH_VALUE_ANCHOR_THRESHOLD_MINOR || '20000')
};

/**
 * Validates production environment configuration.
 * Fails fast on invalid, missing, or mismatched production configuration.
 *
 * @param {object} config
 */
export function validateProductionConfig(config = env) {
  if (config.NODE_ENV === 'production') {
    if (config.USE_MOCK_SECURITY) {
      throw new Error('SECURITY VIOLATION: USE_MOCK_SECURITY cannot be enabled in production.');
    }
    if (config.USE_MOCK_PAYPAL) {
      throw new Error('SECURITY VIOLATION: USE_MOCK_PAYPAL cannot be enabled in production.');
    }
    if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 32) {
      throw new Error('SECURITY VIOLATION: SESSION_SECRET must be at least 32 characters in production.');
    }
    if (!config.CSRF_SECRET || config.CSRF_SECRET.length < 32) {
      throw new Error('SECURITY VIOLATION: CSRF_SECRET must be at least 32 characters in production.');
    }

    const hex64Regex = /^[0-9a-fA-F]{64}$/;
    const privKey = (config.ED25519_PRIVATE_KEY || '').trim();
    if (!privKey || (!hex64Regex.test(privKey) && !privKey.startsWith('-----BEGIN'))) {
      throw new Error('SECURITY VIOLATION: ED25519_PRIVATE_KEY must be a 64-char hex string or PKCS#8 PEM in production.');
    }

    const pubKey = (config.ED25519_PUBLIC_KEY || '').trim();
    if (!pubKey || (!hex64Regex.test(pubKey) && !pubKey.startsWith('-----BEGIN'))) {
      throw new Error('SECURITY VIOLATION: ED25519_PUBLIC_KEY must be a 64-char hex string or SPKI PEM in production.');
    }

    const keyId = (config.ED25519_KEY_ID || '').trim();
    if (!keyId) {
      throw new Error('SECURITY VIOLATION: ED25519_KEY_ID must be configured in production.');
    }

    if (!validateEd25519KeyPair(privKey, pubKey)) {
      throw new Error('SECURITY VIOLATION: ED25519_PUBLIC_KEY does not match ED25519_PRIVATE_KEY.');
    }
  }
}

// Execute production configuration verification on boot
validateProductionConfig(env);
