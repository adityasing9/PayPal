import dotenv from 'dotenv';

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
  ED25519_KEY_ID: process.env.ED25519_KEY_ID || 'KEY_INTENTLOCK_DEV_V1',
  ED25519_PUBLIC_KEY: process.env.ED25519_PUBLIC_KEY || '',
  ED25519_PRIVATE_KEY: process.env.ED25519_PRIVATE_KEY || '',

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

// Security invariant: Production must fail closed if mock adapters are active
if (env.NODE_ENV === 'production') {
  if (env.USE_MOCK_SECURITY) {
    throw new Error('SECURITY VIOLATION: USE_MOCK_SECURITY cannot be enabled in production.');
  }
  if (env.USE_MOCK_PAYPAL) {
    throw new Error('SECURITY VIOLATION: USE_MOCK_PAYPAL cannot be enabled in production.');
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SECURITY VIOLATION: SESSION_SECRET must be at least 32 characters in production.');
  }
  if (!process.env.CSRF_SECRET || process.env.CSRF_SECRET.length < 32) {
    throw new Error('SECURITY VIOLATION: CSRF_SECRET must be at least 32 characters in production.');
  }
}
