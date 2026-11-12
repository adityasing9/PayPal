import crypto from 'node:crypto';
import { canonicalJson } from './canonicalJson.js';

// Standard ASN.1 DER prefixes for Ed25519 keys
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Compares two hex-encoded strings in constant time.
 * Protects against timing attacks.
 *
 * @param {string} aHex
 * @param {string} bHex
 * @returns {boolean} True if strings match identically.
 */
export function timingSafeEqualHex(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string') {
    return false;
  }
  const bufA = Buffer.from(aHex, 'hex');
  const bufB = Buffer.from(bHex, 'hex');

  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically secure random nonce.
 *
 * @param {number} [byteLength=32] - Default 32 bytes (256-bit).
 * @returns {string} Hex string (64 characters for 32 bytes).
 */
export function generateNonce(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Generates an Ed25519 keypair for RFC 8785 canonical authorization signing.
 *
 * @returns {{
 *   publicKey: crypto.KeyObject,
 *   privateKey: crypto.KeyObject,
 *   publicKeyHex: string,
 *   privateKeyHex: string
 * }}
 */
export function generateEd25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });

  // Extract raw 32-byte public and private key seeds
  const publicKeyHex = pubDer.subarray(12).toString('hex');
  const privateKeyHex = privDer.subarray(16).toString('hex');

  return {
    publicKey,
    privateKey,
    publicKeyHex,
    privateKeyHex
  };
}

/**
 * Resolves an Ed25519 private key input into a crypto.KeyObject.
 *
 * @param {crypto.KeyObject | string | Buffer} key
 * @returns {crypto.KeyObject}
 */
export function resolvePrivateKey(key) {
  if (key && typeof key === 'object' && key.type === 'private') {
    return key;
  }
  if (typeof key === 'string') {
    const trimmed = key.trim();
    if (trimmed.startsWith('-----BEGIN')) {
      return crypto.createPrivateKey(trimmed);
    }
    // 32-byte raw hex private key (64 hex characters)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const rawBuf = Buffer.from(trimmed, 'hex');
      return crypto.createPrivateKey({
        key: Buffer.concat([ED25519_PKCS8_PREFIX, rawBuf]),
        format: 'der',
        type: 'pkcs8'
      });
    }
  }
  if (Buffer.isBuffer(key)) {
    if (key.length === 32) {
      return crypto.createPrivateKey({
        key: Buffer.concat([ED25519_PKCS8_PREFIX, key]),
        format: 'der',
        type: 'pkcs8'
      });
    }
    return crypto.createPrivateKey({ key, format: 'der', type: 'pkcs8' });
  }
  throw new TypeError('Invalid Ed25519 private key format. Expected KeyObject, PEM, or 32-byte hex string.');
}

/**
 * Resolves an Ed25519 public key input into a crypto.KeyObject.
 *
 * @param {crypto.KeyObject | string | Buffer} key
 * @returns {crypto.KeyObject}
 */
export function resolvePublicKey(key) {
  if (key && typeof key === 'object' && key.type === 'public') {
    return key;
  }
  if (typeof key === 'string') {
    const trimmed = key.trim();
    if (trimmed.startsWith('-----BEGIN')) {
      return crypto.createPublicKey(trimmed);
    }
    // 32-byte raw hex public key (64 hex characters)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const rawBuf = Buffer.from(trimmed, 'hex');
      return crypto.createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, rawBuf]),
        format: 'der',
        type: 'spki'
      });
    }
  }
  if (Buffer.isBuffer(key)) {
    if (key.length === 32) {
      return crypto.createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, key]),
        format: 'der',
        type: 'spki'
      });
    }
    return crypto.createPublicKey({ key, format: 'der', type: 'spki' });
  }
  throw new TypeError('Invalid Ed25519 public key format. Expected KeyObject, PEM, or 32-byte hex string.');
}

/**
 * Validates that an Ed25519 public key mathematically matches an Ed25519 private key.
 * Uses both public key derivation comparison and signature verification self-test.
 *
 * @param {crypto.KeyObject | string | Buffer} privateKey
 * @param {crypto.KeyObject | string | Buffer} publicKey
 * @returns {boolean} True if keys form a valid matching pair.
 */
export function validateEd25519KeyPair(privateKey, publicKey) {
  try {
    const privObj = resolvePrivateKey(privateKey);
    const pubObj = resolvePublicKey(publicKey);

    // 1. Derive public key from private key and compare SPKI DER
    const derivedPub = crypto.createPublicKey(privObj);
    const derivedDer = derivedPub.export({ type: 'spki', format: 'der' });
    const configuredDer = pubObj.export({ type: 'spki', format: 'der' });

    if (!crypto.timingSafeEqual(derivedDer, configuredDer)) {
      return false;
    }

    // 2. Perform self-test sign and verify
    const testPayload = Buffer.from('INTENTLOCK_KEY_PAIR_VALIDATION', 'utf8');
    const sig = signEd25519(testPayload, privObj);
    return verifyEd25519(testPayload, sig, pubObj);
  } catch {
    return false;
  }
}

/**
 * Signs a payload using an Ed25519 private key.
 * If payload is an object, it is serialized via RFC 8785 canonicalJson first.
 *
 * @param {string | Buffer | object} payload - Data to sign.
 * @param {crypto.KeyObject | string | Buffer} privateKey - Ed25519 private key.
 * @returns {string} 64-byte Ed25519 signature as a 128-character hex string.
 */
export function signEd25519(payload, privateKey) {
  const privKeyObj = resolvePrivateKey(privateKey);
  let dataBuffer;

  if (Buffer.isBuffer(payload)) {
    dataBuffer = payload;
  } else if (typeof payload === 'string') {
    dataBuffer = Buffer.from(payload, 'utf8');
  } else if (payload !== null && typeof payload === 'object') {
    dataBuffer = Buffer.from(canonicalJson(payload), 'utf8');
  } else {
    throw new TypeError('Payload must be a Buffer, string, or object');
  }

  const sigBuffer = crypto.sign(null, dataBuffer, privKeyObj);
  return sigBuffer.toString('hex');
}

/**
 * Verifies an Ed25519 signature against a payload and public key.
 * If payload is an object, it is serialized via RFC 8785 canonicalJson first.
 *
 * @param {string | Buffer | object} payload - Signed data.
 * @param {string | Buffer} signature - 64-byte signature (hex string or Buffer).
 * @param {crypto.KeyObject | string | Buffer} publicKey - Ed25519 public key.
 * @returns {boolean} True if signature is valid.
 */
export function verifyEd25519(payload, signature, publicKey) {
  try {
    const pubKeyObj = resolvePublicKey(publicKey);
    let dataBuffer;

    if (Buffer.isBuffer(payload)) {
      dataBuffer = payload;
    } else if (typeof payload === 'string') {
      dataBuffer = Buffer.from(payload, 'utf8');
    } else if (payload !== null && typeof payload === 'object') {
      dataBuffer = Buffer.from(canonicalJson(payload), 'utf8');
    } else {
      return false;
    }

    const sigBuffer = Buffer.isBuffer(signature)
      ? signature
      : Buffer.from(signature, 'hex');

    if (sigBuffer.length !== 64) {
      return false;
    }

    return crypto.verify(null, dataBuffer, pubKeyObj, sigBuffer);
  } catch {
    return false;
  }
}

export const signMessage = signEd25519;
export const verifySignature = verifyEd25519;

/**
 * Generates a session-bound CSRF token.
 * Payload format: <len(userId)>:<userId>:<sessionVersion>:<issuedAt>:<nonce>
 * Signed via HMAC-SHA256.
 *
 * @param {{
 *   userId: string,
 *   sessionVersion: number,
 *   secret: string
 * }} options
 * @returns {string} Encoded CSRF token in format "<base64url(payload)>.<hexSignature>"
 */
export function generateCsrfToken({ userId, sessionVersion, secret }) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('userId is required');
  }
  if (typeof sessionVersion !== 'number' || !Number.isInteger(sessionVersion)) {
    throw new TypeError('sessionVersion must be an integer');
  }
  if (!secret || typeof secret !== 'string') {
    throw new TypeError('secret is required');
  }

  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');

  // Length-delimited payload prevents separator injection
  const payload = `${userId.length}:${userId}:${sessionVersion}:${issuedAt}:${nonce}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies a session-bound CSRF token against user identity, session version, and TTL.
 *
 * @param {string} token - The CSRF token string.
 * @param {{
 *   expectedUserId: string,
 *   expectedSessionVersion: number,
 *   secret: string,
 *   maxAgeMs?: number
 * }} options
 * @returns {{
 *   valid: boolean,
 *   reason?: string,
 *   payload?: { userId: string, sessionVersion: number, issuedAt: number, nonce: string }
 * }}
 */
export function verifyCsrfToken(token, { expectedUserId, expectedSessionVersion, secret, maxAgeMs = 7200000 }) {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'INVALID_TOKEN_FORMAT' };
  }
  if (!secret || typeof secret !== 'string') {
    return { valid: false, reason: 'MISSING_SECRET' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'INVALID_TOKEN_PARTS' };
  }

  const [encodedPayload, signature] = parts;
  let payloadStr;
  try {
    payloadStr = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD_ENCODING' };
  }

  // Parse length-delimited payload: <len(userId)>:<userId>:<sessionVersion>:<issuedAt>:<nonce>
  const firstColon = payloadStr.indexOf(':');
  if (firstColon === -1) {
    return { valid: false, reason: 'MALFORMED_PAYLOAD' };
  }

  const uLen = parseInt(payloadStr.substring(0, firstColon), 10);
  if (Number.isNaN(uLen) || uLen < 0) {
    return { valid: false, reason: 'INVALID_USER_ID_LENGTH' };
  }

  const userIdEnd = firstColon + 1 + uLen;
  if (payloadStr.length <= userIdEnd || payloadStr[userIdEnd] !== ':') {
    return { valid: false, reason: 'USER_ID_BOUNDARY_MISMATCH' };
  }

  const userId = payloadStr.substring(firstColon + 1, userIdEnd);
  const remainder = payloadStr.substring(userIdEnd + 1).split(':');

  if (remainder.length !== 3) {
    return { valid: false, reason: 'INVALID_REMAINDER_FIELDS' };
  }

  const [sessionVersionStr, issuedAtStr, nonce] = remainder;
  const sessionVersion = parseInt(sessionVersionStr, 10);
  const issuedAt = parseInt(issuedAtStr, 10);

  if (Number.isNaN(sessionVersion) || Number.isNaN(issuedAt)) {
    return { valid: false, reason: 'INVALID_NUMERIC_FIELDS' };
  }

  // 1. Verify HMAC signature in constant time
  const expectedSignature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  if (!timingSafeEqualHex(signature, expectedSignature)) {
    return { valid: false, reason: 'SIGNATURE_VERIFICATION_FAILED' };
  }

  // 2. Check expiration (default 2 hours)
  const now = Date.now();
  if (issuedAt > now + 60000) {
    // Clock skew allowance: at most 60s into future
    return { valid: false, reason: 'TOKEN_ISSUED_IN_FUTURE' };
  }
  if (now - issuedAt > maxAgeMs) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }

  // 3. Check user binding
  if (userId !== expectedUserId) {
    return { valid: false, reason: 'USER_MISMATCH' };
  }

  // 4. Check session version binding (revocation protection)
  if (sessionVersion !== expectedSessionVersion) {
    return { valid: false, reason: 'SESSION_VERSION_MISMATCH' };
  }

  return {
    valid: true,
    payload: {
      userId,
      sessionVersion,
      issuedAt,
      nonce
    }
  };
}

/**
 * Generates an ephemeral single-use PayPal return token.
 * Used for SameSite=Strict cross-site navigation session recovery.
 *
 * @returns {string} 64-character random hex token.
 */
export function generateReturnToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes the SHA-256 hash of an ephemeral return token for database persistence.
 *
 * @param {string} token
 * @returns {string} 64-character lowercase SHA-256 hex string.
 */
export function hashReturnToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new TypeError('Return token must be a non-empty string');
  }
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}
