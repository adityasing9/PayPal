/**
 * Currency and Financial Utilities for IntentLock Commerce.
 *
 * All operations execute strictly using Node.js native `BigInt` to mathematically
 * prevent IEEE 754 floating-point inaccuracies (e.g. 0.1 + 0.2 !== 0.3).
 *
 * Monetary amounts are represented across system boundaries as:
 * - Runtime calculations: native `BigInt` minor units
 * - API / JSON responses: decimal integer strings (e.g., "11790")
 * - Database storage: BSON Long / Mongoose BigInt
 */

/**
 * Normalizes an amount into a native BigInt minor unit.
 *
 * @param {bigint | string | number} amount
 * @param {{ allowNegative?: boolean }} [options]
 * @returns {bigint}
 * @throws {TypeError} If amount contains decimal points or unsafe floating-point numbers.
 * @throws {RangeError} If amount is negative and allowNegative is false.
 */
export function toMinorUnits(amount, { allowNegative = false } = {}) {
  let val;

  if (typeof amount === 'bigint') {
    val = amount;
  } else if (typeof amount === 'string') {
    const trimmed = amount.trim();
    if (trimmed.includes('.')) {
      throw new TypeError(
        `Floating-point string prohibited in minor-unit operations: "${amount}". Use parseMajorToMinorUnits() to parse currency strings.`
      );
    }
    if (!/^[+-]?[0-9]+$/.test(trimmed)) {
      throw new TypeError(`Invalid integer minor-unit string: "${amount}"`);
    }
    val = BigInt(trimmed);
  } else if (typeof amount === 'number') {
    if (!Number.isInteger(amount)) {
      throw new TypeError(`Floats are prohibited in monetary arithmetic: ${amount}`);
    }
    if (!Number.isSafeInteger(amount)) {
      throw new TypeError(
        `Number exceeds Number.MAX_SAFE_INTEGER (${amount}). Pass as a string or BigInt to preserve precision.`
      );
    }
    val = BigInt(amount);
  } else {
    throw new TypeError(`Unsupported monetary amount type: ${typeof amount}`);
  }

  if (!allowNegative && val < 0n) {
    throw new RangeError(`Monetary amount cannot be negative: ${val}`);
  }

  return val;
}

/**
 * Converts any minor-unit amount representation into a strict decimal integer string.
 *
 * @param {bigint | string | number} amount
 * @returns {string}
 */
export function toMinorUnitsString(amount) {
  return toMinorUnits(amount).toString();
}

/**
 * Sums multiple minor unit amounts using BigInt arithmetic.
 *
 * @param {...(bigint | string | number)} amounts
 * @returns {bigint}
 */
export function addMinorUnits(...amounts) {
  return amounts.reduce((acc, curr) => acc + toMinorUnits(curr), 0n);
}

/**
 * Subtracts subtrahend from minuend (minuend - subtrahend).
 *
 * @param {bigint | string | number} minuend
 * @param {bigint | string | number} subtrahend
 * @param {{ allowNegative?: boolean }} [options]
 * @returns {bigint}
 */
export function subtractMinorUnits(minuend, subtrahend, { allowNegative = false } = {}) {
  const diff = toMinorUnits(minuend, { allowNegative: true }) - toMinorUnits(subtrahend, { allowNegative: true });
  if (!allowNegative && diff < 0n) {
    throw new RangeError(`Subtraction result cannot be negative: ${diff}`);
  }
  return diff;
}

/**
 * Multiplies a minor unit amount by an integer multiplier.
 *
 * @param {bigint | string | number} amount
 * @param {bigint | string | number} multiplier
 * @returns {bigint}
 */
export function multiplyMinorUnits(amount, multiplier) {
  const mult = toMinorUnits(multiplier, { allowNegative: true });
  return toMinorUnits(amount) * mult;
}

/**
 * Calculates a percentage / fee in basis points (1 bp = 0.01% = 1/10000).
 * Implements standard half-up integer rounding: (amount * bp + 5000) / 10000.
 *
 * @param {bigint | string | number} amount - Base minor units.
 * @param {bigint | string | number} basisPoints - Integer basis points (e.g. 500 for 5%).
 * @returns {bigint}
 */
export function calculateBasisPoints(amount, basisPoints) {
  const base = toMinorUnits(amount);
  const bp = toMinorUnits(basisPoints);
  // (base * bp + 5000n) / 10000n achieves round-half-up integer rounding
  return (base * bp + 5000n) / 10000n;
}

/**
 * Parses a user-input currency string (e.g. "$120.50", "120.5", "100") into exact integer minor units
 * without any floating-point arithmetic.
 *
 * @param {string} str - Currency string to parse.
 * @param {number} [exponent=2] - Minor unit exponent (default 2 for cents).
 * @returns {string} Decimal integer string (e.g. "12050").
 */
export function parseMajorToMinorUnits(str, exponent = 2) {
  if (typeof str !== 'string') {
    throw new TypeError('Currency string must be a string');
  }

  // Strip currency symbols, commas, and whitespace
  const sanitized = str.replace(/[$€£¥,\s]/g, '').trim();
  if (!sanitized) {
    throw new TypeError('Empty currency string');
  }

  const parts = sanitized.split('.');
  if (parts.length > 2) {
    throw new TypeError(`Malformed currency string with multiple decimal points: "${str}"`);
  }

  const [intPart, rawDecPart = ''] = parts;
  if (!/^[0-9]+$/.test(intPart)) {
    throw new TypeError(`Invalid integer component in currency string: "${str}"`);
  }

  if (rawDecPart && !/^[0-9]+$/.test(rawDecPart)) {
    throw new TypeError(`Invalid decimal component in currency string: "${str}"`);
  }

  let decPart = rawDecPart;
  if (decPart.length < exponent) {
    decPart = decPart.padEnd(exponent, '0');
  } else if (decPart.length > exponent) {
    // Truncate or round: if extra digits, round half up
    const preserved = decPart.slice(0, exponent);
    const nextDigit = parseInt(decPart[exponent], 10);
    let rounded = BigInt(intPart + preserved);
    if (nextDigit >= 5) {
      rounded += 1n;
    }
    return rounded.toString();
  }

  const combined = BigInt(intPart + decPart);
  return combined.toString();
}

/**
 * Formats minor units into an exact display string (e.g. "$117.90").
 * Formats purely via string manipulation and BigInt math; zero float conversions.
 *
 * @param {bigint | string | number} amount
 * @param {{
 *   currency?: string,
 *   exponent?: number,
 *   includeSymbol?: boolean
 * }} [options]
 * @returns {string}
 */
export function formatMinorUnits(amount, { currency = 'USD', exponent = 2, includeSymbol = true } = {}) {
  const val = toMinorUnits(amount, { allowNegative: true });
  const isNegative = val < 0n;
  const absVal = isNegative ? -val : val;

  const divisor = 10n ** BigInt(exponent);
  const intPart = absVal / divisor;
  const fracPart = (absVal % divisor).toString().padStart(exponent, '0');

  // Format integer part with thousands separators
  const formattedInt = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const sign = isNegative ? '-' : '';
  const symbol = includeSymbol ? (currency === 'USD' ? '$' : `${currency} `) : '';

  return `${sign}${symbol}${formattedInt}.${fracPart}`;
}
