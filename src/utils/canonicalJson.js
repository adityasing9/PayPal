import crypto from 'node:crypto';
import canonicalize from 'canonicalize';

/**
 * Validates that an object or value does not contain BigInt values.
 * RFC 8785 and JSON specifications do not support BigInt numbers;
 * all monetary minor-unit amounts MUST be pre-formatted as decimal integer strings.
 *
 * @param {unknown} val
 * @param {string} [path]
 */
function assertNoBigInt(val, path = 'root') {
  if (typeof val === 'bigint') {
    throw new TypeError(
      `BigInt value detected at ${path}. BigInt cannot be serialized directly to RFC 8785 canonical JSON; format as a decimal integer string first.`
    );
  }
  if (val !== null && typeof val === 'object') {
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        assertNoBigInt(val[i], `${path}[${i}]`);
      }
    } else {
      for (const [k, v] of Object.entries(val)) {
        assertNoBigInt(v, `${path}.${k}`);
      }
    }
  }
}

/**
 * Serializes an object to an RFC 8785 (JSON Canonicalization Scheme / JCS) string.
 *
 * Properties are sorted lexicographically by UTF-16 code units.
 * Whitespace is strictly eliminated.
 * Numbers are formatted per ECMAScript specification.
 *
 * @param {unknown} data - The data structure to serialize.
 * @returns {string} The RFC 8785 canonical JSON string.
 * @throws {TypeError} If data is undefined or contains BigInt values.
 */
export function canonicalJson(data) {
  if (data === undefined) {
    throw new TypeError('Cannot canonicalize undefined value');
  }

  assertNoBigInt(data);

  const result = canonicalize(data);
  if (result === undefined) {
    throw new TypeError('Canonicalization resulted in undefined (e.g. functions or symbols passed)');
  }
  return result;
}

/**
 * Serializes data to RFC 8785 canonical JSON and computes its SHA-256 hex digest.
 *
 * @param {unknown} data - The data structure to canonicalize and hash.
 * @returns {string} 64-character lowercase SHA-256 hex digest.
 */
export function hashCanonicalJson(data) {
  const canonicalString = canonicalJson(data);
  return crypto.createHash('sha256').update(canonicalString, 'utf8').digest('hex');
}

export const canonicalJsonSha256 = hashCanonicalJson;

/**
 * Normalizes a checkout snapshot into its canonical RFC 8785 representation,
 * strictly excluding metadata and hash fields (snapshotHash, snapshotId, _id, proposalId, intentId, capturedAt).
 *
 * @param {object} snapshot
 * @returns {object} Canonical payload ready for RFC 8785 JSON canonicalization.
 */
export function extractCanonicalSnapshotPayload(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new TypeError('Snapshot must be an object');
  }
  const source = snapshot.snapshotPayload || snapshot;

  let rawSpecs = source.specifications;
  if (rawSpecs instanceof Map) {
    rawSpecs = Object.fromEntries(rawSpecs);
  } else if (!rawSpecs || typeof rawSpecs !== 'object' || Array.isArray(rawSpecs)) {
    rawSpecs = {};
  }

  const lineItems = Array.isArray(source.lineItems)
    ? source.lineItems.map((item) => ({
        sku: item.sku || '',
        name: item.name || '',
        quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity || 1),
        unitPriceMinor: item.unitPriceMinor !== undefined ? item.unitPriceMinor.toString() : '0'
      }))
    : [];

  return {
    productId: source.productId || '',
    variantSku: source.variantSku || '',
    merchantId: source.merchantId || (source.merchant && source.merchant.id) || '',
    paypalMerchantId: source.paypalMerchantId || (source.merchant && source.merchant.paypalMerchantId) || '',
    lineItems,
    pricing: {
      basePriceMinor: source.pricing?.basePriceMinor !== undefined ? source.pricing.basePriceMinor.toString() : '0',
      shippingMinor: source.pricing?.shippingMinor !== undefined ? source.pricing.shippingMinor.toString() : '0',
      taxMinor: source.pricing?.taxMinor !== undefined ? source.pricing.taxMinor.toString() : '0',
      discountMinor: source.pricing?.discountMinor !== undefined ? source.pricing.discountMinor.toString() : '0',
      totalPriceMinor: source.pricing?.totalPriceMinor !== undefined ? source.pricing.totalPriceMinor.toString() : '0',
      currency: (source.pricing?.currency || 'USD').toUpperCase(),
      minorUnitExponent: source.pricing?.minorUnitExponent !== undefined ? Number(source.pricing.minorUnitExponent) : 2
    },
    recurring: {
      isRecurring: Boolean(source.recurring?.isRecurring),
      billingInterval: source.recurring?.billingInterval || null,
      billingCycles:
        typeof source.recurring?.billingCycles === 'number'
          ? source.recurring.billingCycles
          : Number(source.recurring?.billingCycles || 0)
    },
    specifications: rawSpecs,
    rawDescription: source.rawDescription || source.description || ''
  };
}

/**
 * Computes the deterministic RFC 8785 SHA-256 hash of a checkout snapshot.
 *
 * @param {object} snapshot
 * @returns {string} 64-character lowercase SHA-256 hex digest.
 */
export function computeSnapshotCanonicalHash(snapshot) {
  const canonicalPayload = extractCanonicalSnapshotPayload(snapshot);
  return hashCanonicalJson(canonicalPayload);
}

/**
 * Compares an expected SHA-256 hash against the canonical JSON hash of the given data in constant time.
 *
 * @param {unknown} data - The data structure to verify.
 * @param {string} expectedHash - 64-character SHA-256 hex string.
 * @returns {boolean} True if the hash matches identically in constant time.
 */
export function verifyCanonicalJsonHash(data, expectedHash) {
  if (typeof expectedHash !== 'string' || expectedHash.length !== 64) {
    return false;
  }
  const actualHash = hashCanonicalJson(data);
  const bufActual = Buffer.from(actualHash, 'hex');
  const bufExpected = Buffer.from(expectedHash, 'hex');

  if (bufActual.length !== bufExpected.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufActual, bufExpected);
}
