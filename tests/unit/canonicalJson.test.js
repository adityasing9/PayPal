import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  canonicalJson,
  hashCanonicalJson,
  verifyCanonicalJsonHash
} from '../../src/utils/canonicalJson.js';

describe('Step 2.3: RFC 8785 Canonical JSON Serialization', () => {
  it('sorts keys lexicographically by UTF-16 code units', () => {
    const input = {
      zebra: 'stripes',
      apple: 'fruit',
      banana: 'yellow'
    };
    const expected = '{"apple":"fruit","banana":"yellow","zebra":"stripes"}';
    expect(canonicalJson(input)).toBe(expected);
  });

  it('eliminates all whitespace between keys, colons, and array elements', () => {
    const input = {
      name: 'Keychron K2 Pro',
      specs: {
        connectivity: 'Wireless',
        backlight: 'White'
      },
      tags: ['mechanical', '75%', 'tactile']
    };
    const canonical = canonicalJson(input);
    expect(canonical).not.toMatch(/":\s|",\s|\[\s|\s\]|\{\s|\s\}/);
    expect(canonical).toBe(
      '{"name":"Keychron K2 Pro","specs":{"backlight":"White","connectivity":"Wireless"},"tags":["mechanical","75%","tactile"]}'
    );
  });

  it('preserves array element order while sorting object keys inside arrays', () => {
    const input = [
      { id: 2, name: 'b' },
      { id: 1, name: 'a' }
    ];
    expect(canonicalJson(input)).toBe('[{"id":2,"name":"b"},{"id":1,"name":"a"}]');
  });

  it('produces identical output regardless of property insertion order', () => {
    const obj1 = {
      totalPriceMinor: '11790',
      currency: 'USD',
      merchantId: 'MERCHANT_KEYCHRON',
      nonce: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
    };

    const obj2 = {
      nonce: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      merchantId: 'MERCHANT_KEYCHRON',
      currency: 'USD',
      totalPriceMinor: '11790'
    };

    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
    expect(hashCanonicalJson(obj1)).toBe(hashCanonicalJson(obj2));
  });

  it('rejects BigInt values with an explicit TypeError requiring decimal string formatting', () => {
    const invalidObj = {
      totalPriceMinor: 11790n,
      currency: 'USD'
    };

    expect(() => canonicalJson(invalidObj)).toThrow(TypeError);
    expect(() => canonicalJson(invalidObj)).toThrow(/BigInt cannot be serialized directly/);
  });

  it('rejects undefined input', () => {
    expect(() => canonicalJson(undefined)).toThrow(TypeError);
  });

  it('computes correct SHA-256 hash in hashCanonicalJson', () => {
    const payload = {
      authorizationId: 'auth_123',
      totalPriceMinor: '11790',
      currency: 'USD'
    };

    const canonical = canonicalJson(payload);
    const expectedHash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');

    expect(hashCanonicalJson(payload)).toBe(expectedHash);
  });

  it('verifyCanonicalJsonHash correctly validates matching hashes in constant time', () => {
    const payload = {
      authorizationId: 'auth_123',
      totalPriceMinor: '11790'
    };
    const validHash = hashCanonicalJson(payload);

    expect(verifyCanonicalJsonHash(payload, validHash)).toBe(true);
    expect(verifyCanonicalJsonHash(payload, '0'.repeat(64))).toBe(false);
    expect(verifyCanonicalJsonHash(payload, 'invalid-length')).toBe(false);
  });
});
