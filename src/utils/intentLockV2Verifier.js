import crypto from 'node:crypto';
import { canonicalJson } from './canonicalJson.js';

const PROTOCOL = 'INTENTLOCK_V2_ED25519';
const HEADER_BYTES = '{"alg":"Ed25519","typ":"INTENTLOCK-AUTH","v":2}';
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const MAX_VALIDITY_SECONDS = 60;
const MAX_CLOCK_SKEW_SECONDS = 15;

export class IntentLockV2VerificationError extends Error {
  constructor(message, code = 'INVALID_INTENTLOCK_AUTHORIZATION') {
    super(message);
    this.name = 'IntentLockV2VerificationError';
    this.code = code;
  }
}

function reject(message, code) {
  throw new IntentLockV2VerificationError(message, code);
}

function decodeBase64Url(segment) {
  if (typeof segment !== 'string' || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    reject('Authorization token contains invalid Base64URL data.');
  }
  const decoded = Buffer.from(segment, 'base64url');
  if (decoded.toString('base64url') !== segment) {
    reject('Authorization token contains non-canonical Base64URL data.');
  }
  return decoded;
}

function getPublicKey(publicKeyHex = process.env.FLASK_INTENTLOCK_PUBLIC_KEY) {
  if (typeof publicKeyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(publicKeyHex)) {
    reject(
      'FLASK_INTENTLOCK_PUBLIC_KEY must contain a pinned 32-byte Ed25519 public key.',
      'INTENTLOCK_CONFIGURATION_ERROR'
    );
  }
  try {
    return crypto.createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyHex, 'hex')]),
      format: 'der',
      type: 'spki'
    });
  } catch {
    reject('Configured Flask IntentLock public key is invalid.', 'INTENTLOCK_CONFIGURATION_ERROR');
  }
}

function expectedPurchaseHash(bindings) {
  return crypto
    .createHash('sha512')
    .update(canonicalJson(bindings), 'utf8')
    .digest('hex');
}

export function verifyIntentLockV2Handoff(handoff, expectedBindings, options = {}) {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) {
    reject('IntentLock handoff must be an object.');
  }
  if (handoff.protocol !== PROTOCOL) {
    reject('IntentLock handoff protocol is not supported.');
  }
  if (typeof handoff.public_key !== 'string' || !/^[0-9a-fA-F]{64}$/.test(handoff.public_key)) {
    reject('IntentLock handoff public key is invalid.');
  }

  const trustedPublicKeyHex = options.publicKey || process.env.FLASK_INTENTLOCK_PUBLIC_KEY;
  if (
    typeof trustedPublicKeyHex !== 'string' ||
    handoff.public_key.toLowerCase() !== trustedPublicKeyHex.toLowerCase()
  ) {
    reject('IntentLock handoff public key does not match the pinned key.');
  }

  const segments = handoff.authorization_token?.split('.');
  if (!Array.isArray(segments) || segments.length !== 3) {
    reject('V2 authorization must contain exactly three compact-token segments.');
  }
  const [headerSegment, claimsSegment, signatureSegment] = segments;
  const headerBytes = decodeBase64Url(headerSegment);
  const claimsBytes = decodeBase64Url(claimsSegment);
  const signature = decodeBase64Url(signatureSegment);
  if (headerBytes.toString('utf8') !== HEADER_BYTES || signature.length !== 64) {
    reject('V2 authorization header or signature length is invalid.');
  }

  let claims;
  try {
    claims = JSON.parse(claimsBytes.toString('utf8'));
  } catch {
    reject('V2 authorization claims are not valid JSON.');
  }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    reject('V2 authorization claims must be an object.');
  }

  const expectedKeys = [
    'protocol', 'token_id', 'intent_id', 'intent_hash', 'user_id', 'intent_version',
    'proposal_id', 'snapshot_id', 'snapshot_hash', 'amount_minor', 'currency',
    'minor_unit_exponent', 'merchant_id', 'paypal_merchant_id', 'purchase_hash',
    'nonce', 'issued_at', 'expires_at'
  ];
  if (
    Object.keys(claims).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(claims, key))
  ) {
    reject('V2 authorization claims do not match the required schema.');
  }

  const publicKey = getPublicKey(trustedPublicKeyHex);
  if (!crypto.verify(null, Buffer.from(`${headerSegment}.${claimsSegment}`), publicKey, signature)) {
    reject('IntentLock V2 Ed25519 signature is invalid.');
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (
    claims.protocol !== PROTOCOL ||
    typeof claims.token_id !== 'string' || !/^[0-9a-f]{32}$/.test(claims.token_id) ||
    typeof claims.intent_hash !== 'string' || !/^[0-9a-f]{128}$/.test(claims.intent_hash) ||
    typeof claims.purchase_hash !== 'string' || !/^[0-9a-f]{128}$/.test(claims.purchase_hash) ||
    typeof claims.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(claims.nonce) ||
    typeof claims.issued_at !== 'number' || !Number.isSafeInteger(claims.issued_at) ||
    typeof claims.expires_at !== 'number' || !Number.isSafeInteger(claims.expires_at) ||
    claims.expires_at <= claims.issued_at ||
    claims.expires_at - claims.issued_at > MAX_VALIDITY_SECONDS
  ) {
    reject('V2 authorization claims contain invalid cryptographic or time fields.');
  }
  if (claims.issued_at > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    reject('V2 authorization was issued too far in the future.');
  }
  if (claims.expires_at <= nowSeconds) {
    reject('V2 authorization has expired.', 'INTENTLOCK_TOKEN_EXPIRED');
  }

  const bindingKeys = [
    'user_id', 'intent_id', 'intent_version', 'proposal_id', 'snapshot_id',
    'snapshot_hash', 'amount_minor', 'currency', 'minor_unit_exponent',
    'merchant_id', 'paypal_merchant_id'
  ];
  const bindings = Object.fromEntries(bindingKeys.map((key) => [key, expectedBindings[key]]));
  if (
    bindingKeys.some((key) => claims[key] !== expectedBindings[key]) ||
    claims.purchase_hash !== expectedPurchaseHash(bindings)
  ) {
    reject('V2 authorization does not match the authoritative purchase bindings.');
  }

  for (const [claimKey, handoffKey] of [
    ['token_id', 'token_id'],
    ['intent_hash', 'intent_hash'],
    ['purchase_hash', 'purchase_hash'],
    ['user_id', 'user_id'],
    ['intent_id', 'intent_id'],
    ['intent_version', 'intent_version'],
    ['proposal_id', 'proposal_id'],
    ['snapshot_id', 'snapshot_id'],
    ['snapshot_hash', 'snapshot_hash'],
    ['amount_minor', 'amount_minor'],
    ['currency', 'currency'],
    ['minor_unit_exponent', 'minor_unit_exponent'],
    ['merchant_id', 'merchant_id'],
    ['paypal_merchant_id', 'paypal_merchant_id'],
    ['nonce', 'nonce'],
    ['issued_at', 'issued_at'],
    ['expires_at', 'expires_at']
  ]) {
    if (handoff[handoffKey] !== claims[claimKey]) {
      reject(`IntentLock handoff field "${handoffKey}" does not match signed claims.`);
    }
  }

  return {
    protocol: PROTOCOL,
    tokenId: claims.token_id,
    intentHash: claims.intent_hash,
    purchaseHash: claims.purchase_hash,
    merchantId: claims.merchant_id,
    nonce: claims.nonce,
    issuedAt: claims.issued_at,
    expiresAt: claims.expires_at,
    compactToken: handoff.authorization_token,
    publicKey: handoff.public_key
  };
}
