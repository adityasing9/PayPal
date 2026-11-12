
import dotenv from 'dotenv';
import { validateEd25519KeyPair } from '../utils/cryptoUtils.js';

// Load .env file if present
dotenv.config();

/**
 * Centralized environment configuration.
 * Production configuration is validated at startup.
 */
export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5001', 10),
  APP_ORIGIN: process.env.APP_ORIGIN || 'http://localhost:3000',
  API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:5001/api',
  TRUST_PROXY_HOPS: parseInt(process.env.TRUST_PROXY_HOPS || '0', 10),

  // Database
  MONGODB_URI:
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/intentlock',
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || 'intentlock',

  // Authentication & Security
  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    'dev-fallback-session-secret-at-least-32-chars-long!',
  CSRF_SECRET:
    process.env.CSRF_SECRET ||
    'dev-fallback-csrf-secret-at-least-32-chars-long!',
  COOKIE_NAME: 'intentlock_session',
  COOKIE_MAX_AGE_MS: 86400 * 1000,

  // Ed25519 Signing Vault - V2
  ED25519_KEY_ID:
    process.env.ED25519_KEY_ID || 'KEY_INTENTLOCK_DEV_V2',
  ED25519_PUBLIC_KEY: process.env.ED25519_PUBLIC_KEY || '',
  ED25519_PRIVATE_KEY: process.env.ED25519_PRIVATE_KEY || '',

  ED25519_RETIRED_KEYS:
    process.env.ED25519_RETIRED_KEYS ||
    JSON.stringify([
      {
        keyId: 'KEY_INTENTLOCK_DEV_V1',
        publicKeyHex:
          '4df93f582d2b31f519c1982bb55c1aa46b4d64498fa04164eeb36c44c0f1cca9',
        status: 'REVOKED',
        revokedAt: '2026-11-10T16:00:00.000Z'
      }
    ]),

  // Parent BFF and Flask IntentLock integration
  PARENT_BFF_SECRET: process.env.PARENT_BFF_SECRET || '',

  FLASK_INTENTLOCK_BASE_URL:
    process.env.FLASK_INTENTLOCK_BASE_URL || 'http://127.0.0.1:8000',

  FLASK_INTENTLOCK_PUBLIC_KEY:
    process.env.FLASK_INTENTLOCK_PUBLIC_KEY || '',

  FLASK_INTENTLOCK_SERVICE_TOKEN:
    process.env.INTENTLOCK_SERVICE_TOKEN ||
    process.env.FLASK_INTENTLOCK_SERVICE_TOKEN ||
    '',

  FLASK_INTENTLOCK_TIMEOUT_MS: parseInt(
    process.env.FLASK_INTENTLOCK_TIMEOUT_MS || '5000',
    10
  ),

  // Adapters
  USE_MOCK_SECURITY: process.env.USE_MOCK_SECURITY === 'true',
  USE_MOCK_PAYPAL: process.env.USE_MOCK_PAYPAL === 'true',

  // PayPal Sandbox
  PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
  PAYPAL_API_TIMEOUT_MS: parseInt(
    process.env.PAYPAL_API_TIMEOUT_MS || '10000',
    10
  ),
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID || '',

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // High-value threshold for audit anchoring
  HIGH_VALUE_ANCHOR_THRESHOLD_MINOR: BigInt(
    process.env.HIGH_VALUE_ANCHOR_THRESHOLD_MINOR || '20000'
  )
};

/**
 * Validates production environment configuration.
 * Fails fast if required security configuration is missing or invalid.
 *
 * @param {object} config
 */
export function validateProductionConfig(config = env) {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  // PayPal must remain Sandbox-only
  if (config.PAYPAL_ENVIRONMENT !== 'sandbox') {
    throw new Error(
      'SECURITY VIOLATION: This payment integration supports PayPal Sandbox only.'
    );
  }

  if (!config.PAYPAL_CLIENT_ID || !config.PAYPAL_CLIENT_SECRET) {
    throw new Error(
      'SECURITY VIOLATION: PayPal Sandbox credentials are required in production.'
    );
  }

  // Mock adapters must never be enabled in production
  if (config.USE_MOCK_SECURITY) {
    throw new Error(
      'SECURITY VIOLATION: USE_MOCK_SECURITY cannot be enabled in production.'
    );
  }

  if (config.USE_MOCK_PAYPAL) {
    throw new Error(
      'SECURITY VIOLATION: USE_MOCK_PAYPAL cannot be enabled in production.'
    );
  }

  // Session and CSRF secrets
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 32) {
    throw new Error(
      'SECURITY VIOLATION: SESSION_SECRET must be at least 32 characters in production.'
    );
  }

  if (!config.CSRF_SECRET || config.CSRF_SECRET.length < 32) {
    throw new Error(
      'SECURITY VIOLATION: CSRF_SECRET must be at least 32 characters in production.'
    );
  }

  // Ed25519 key validation
  const hex64Regex = /^[0-9a-fA-F]{64}$/;

  const privKey = (config.ED25519_PRIVATE_KEY || '').trim();
  const pubKey = (config.ED25519_PUBLIC_KEY || '').trim();

  if (
    !privKey ||
    (!hex64Regex.test(privKey) && !privKey.startsWith('-----BEGIN'))
  ) {
    throw new Error(
      'SECURITY VIOLATION: ED25519_PRIVATE_KEY must be a 64-char hex string or PKCS#8 PEM in production.'
    );
  }

  if (
    !pubKey ||
    (!hex64Regex.test(pubKey) && !pubKey.startsWith('-----BEGIN'))
  ) {
    throw new Error(
      'SECURITY VIOLATION: ED25519_PUBLIC_KEY must be a 64-char hex string or SPKI PEM in production.'
    );
  }

  const keyId = (config.ED25519_KEY_ID || '').trim();

  if (!keyId || keyId === 'KEY_INTENTLOCK_DEV_V1') {
    throw new Error(
      'SECURITY VIOLATION: A valid non-retired ED25519_KEY_ID must be configured.'
    );
  }

  if (!validateEd25519KeyPair(privKey, pubKey)) {
    throw new Error(
      'SECURITY VIOLATION: ED25519_PUBLIC_KEY does not match ED25519_PRIVATE_KEY.'
    );
  }

  // Parent BFF service authentication
  if (!config.PARENT_BFF_SECRET || config.PARENT_BFF_SECRET.length < 32) {
    throw new Error(
      'SECURITY VIOLATION: PARENT_BFF_SECRET must be at least 32 characters in production.'
    );
  }

  // Flask IntentLock service authentication
  if (!hex64Regex.test(config.FLASK_INTENTLOCK_PUBLIC_KEY || '')) {
    throw new Error(
      'SECURITY VIOLATION: FLASK_INTENTLOCK_PUBLIC_KEY must be a pinned 32-byte Ed25519 key in production.'
    );
  }

  if (
    !config.FLASK_INTENTLOCK_SERVICE_TOKEN ||
    config.FLASK_INTENTLOCK_SERVICE_TOKEN.length < 32
  ) {
    throw new Error(
      'SECURITY VIOLATION: FLASK_INTENTLOCK_SERVICE_TOKEN must be at least 32 characters in production.'
    );
  }
}

// Execute production configuration verification on boot
validateProductionConfig(env);
