import { describe, it, expect } from 'vitest';
import {
  toMinorUnits,
  toMinorUnitsString,
  addMinorUnits,
  subtractMinorUnits,
  multiplyMinorUnits,
  calculateBasisPoints,
  parseMajorToMinorUnits,
  formatMinorUnits
} from '../../src/utils/currencyUtils.js';

describe('Step 2.3: Currency & Financial Utilities (currencyUtils)', () => {
  describe('toMinorUnits & toMinorUnitsString', () => {
    it('accepts BigInt, decimal string, and safe integer numbers', () => {
      expect(toMinorUnits(11790n)).toBe(11790n);
      expect(toMinorUnits('11790')).toBe(11790n);
      expect(toMinorUnits(11790)).toBe(11790n);
      expect(toMinorUnitsString(11790n)).toBe('11790');
    });

    it('rejects floating-point strings with an explicit TypeError', () => {
      expect(() => toMinorUnits('12.50')).toThrow(TypeError);
      expect(() => toMinorUnits('0.99')).toThrow(/Floating-point string prohibited/);
    });

    it('rejects floating-point numbers', () => {
      expect(() => toMinorUnits(12.5)).toThrow(TypeError);
      expect(() => toMinorUnits(0.1)).toThrow(/Floats are prohibited/);
    });

    it('rejects negative amounts unless allowNegative is explicitly set', () => {
      expect(() => toMinorUnits(-500)).toThrow(RangeError);
      expect(() => toMinorUnits('-500')).toThrow(RangeError);
      expect(toMinorUnits(-500, { allowNegative: true })).toBe(-500n);
    });

    it('handles large integers exceeding Number.MAX_SAFE_INTEGER when passed as string or BigInt', () => {
      const largeString = '900719925474099300'; // 900,719,925,474,099,300 minor units
      const result = toMinorUnits(largeString);
      expect(result).toBe(900719925474099300n);
      expect(toMinorUnitsString(result)).toBe(largeString);
    });

    it('rejects numbers exceeding Number.MAX_SAFE_INTEGER when passed as raw number to protect precision', () => {
      expect(() => toMinorUnits(Number.MAX_SAFE_INTEGER + 1)).toThrow(TypeError);
    });
  });

  describe('Financial Arithmetic (Zero Float Math)', () => {
    it('eliminates IEEE 754 precision errors (e.g. 0.1 + 0.2 === 0.3)', () => {
      // In raw JS floating-point: 0.1 + 0.2 === 0.30000000000000004
      // In minor units (cents): 10 + 20 === 30 exactly
      const sum = addMinorUnits('10', '20');
      expect(sum).toBe(30n);
      expect(formatMinorUnits(sum)).toBe('$0.30');
    });

    it('sums multiple minor unit amounts correctly', () => {
      const base = '9900';
      const shipping = '1000';
      const tax = '890';
      const total = addMinorUnits(base, shipping, tax);
      expect(total).toBe(11790n);
      expect(toMinorUnitsString(total)).toBe('11790');
    });

    it('subtracts minor unit amounts and throws if result is negative by default', () => {
      expect(subtractMinorUnits('1000', '300')).toBe(700n);
      expect(() => subtractMinorUnits('300', '1000')).toThrow(RangeError);
      expect(subtractMinorUnits('300', '1000', { allowNegative: true })).toBe(-700n);
    });

    it('multiplies minor unit amounts by integer multiplier', () => {
      expect(multiplyMinorUnits('9900', 3)).toBe(29700n);
      expect(multiplyMinorUnits('9900', 0)).toBe(0n);
    });

    it('calculates basis points with half-up integer rounding', () => {
      // 5% (500 bps) on $100.00 (10000 minor units) = $5.00 (500 minor units)
      expect(calculateBasisPoints('10000', 500)).toBe(500n);

      // 8.25% (825 bps) on $99.00 (9900 minor units) = 816.75 -> rounded to 817 minor units ($8.17)
      expect(calculateBasisPoints('9900', 825)).toBe(817n);
    });
  });

  describe('parseMajorToMinorUnits', () => {
    it('parses formatted dollar strings into exact minor units without floats', () => {
      expect(parseMajorToMinorUnits('$120.50')).toBe('12050');
      expect(parseMajorToMinorUnits('120.5')).toBe('12050');
      expect(parseMajorToMinorUnits('$100')).toBe('10000');
      expect(parseMajorToMinorUnits('0.99')).toBe('99');
      expect(parseMajorToMinorUnits('$1,234.56')).toBe('123456');
    });

    it('rounds half-up when string contains sub-cent digits', () => {
      expect(parseMajorToMinorUnits('120.504')).toBe('12050'); // 4 < 5 -> rounds down
      expect(parseMajorToMinorUnits('120.505')).toBe('12051'); // 5 >= 5 -> rounds up
      expect(parseMajorToMinorUnits('120.509')).toBe('12051');
    });

    it('handles large major currency amounts above Number.MAX_SAFE_INTEGER', () => {
      const largeMajor = '9007199254740992.50';
      expect(parseMajorToMinorUnits(largeMajor)).toBe('900719925474099250');
    });

    it('rejects invalid inputs', () => {
      expect(() => parseMajorToMinorUnits('abc')).toThrow(TypeError);
      expect(() => parseMajorToMinorUnits('12.34.56')).toThrow(TypeError);
      expect(() => parseMajorToMinorUnits('')).toThrow(TypeError);
    });
  });

  describe('formatMinorUnits', () => {
    it('formats minor units into human-readable currency strings', () => {
      expect(formatMinorUnits('11790')).toBe('$117.90');
      expect(formatMinorUnits('10000')).toBe('$100.00');
      expect(formatMinorUnits('99')).toBe('$0.99');
      expect(formatMinorUnits('5')).toBe('$0.05');
      expect(formatMinorUnits('0')).toBe('$0.00');
    });

    it('formats thousands separators correctly', () => {
      expect(formatMinorUnits('123456789')).toBe('$1,234,567.89');
    });

    it('formats negative amounts when allowNegative is used', () => {
      expect(formatMinorUnits('-5000')).toBe('-$50.00');
    });

    it('formats amounts exceeding Number.MAX_SAFE_INTEGER with exact precision', () => {
      const largeMinor = 900719925474099200n; // $9,007,199,254,740,992.00
      expect(formatMinorUnits(largeMinor)).toBe('$9,007,199,254,740,992.00');
    });

    it('supports alternative currency prefixes and omitting symbols', () => {
      expect(formatMinorUnits('11790', { currency: 'EUR' })).toBe('EUR 117.90');
      expect(formatMinorUnits('11790', { includeSymbol: false })).toBe('117.90');
    });
  });
});
