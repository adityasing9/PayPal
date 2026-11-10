import { z } from 'zod';

/**
 * Universal schema for monetary minor-unit amounts.
 * Accepts either:
 *  - A decimal integer string (e.g., "11790")
 *  - A non-negative safe integer number (e.g., 11790), transforming it into a decimal integer string.
 * Enforces non-negative values and strictly outputs a decimal integer string.
 */
export const minorAmountSchema = z.union([
  z.string().regex(/^[0-9]+$/, 'Amount must be a non-negative decimal integer string'),
  z.number().int().nonnegative().safe().transform((val) => val.toString())
]);

/**
 * Strict decimal integer string (no number coercion).
 * Used for canonical JSON serialization and strict signature payloads.
 */
export const decimalIntegerStringSchema = z
  .string()
  .regex(/^[0-9]+$/, 'Must be a non-negative decimal integer string');

/**
 * ISO-4217 3-letter uppercase currency code.
 */
export const currencySchema = z
  .string()
  .length(3, 'Currency must be an ISO-4217 3-letter code')
  .regex(/^[A-Z]{3}$/, 'Currency must consist of 3 uppercase letters')
  .default('USD');

/**
 * Standard 64-character lowercase or uppercase hex hash (e.g., SHA-256).
 */
export const sha256HexSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{64}$/, 'Must be a 64-character SHA-256 hex string');

/**
 * UUID v4 schema for idempotency keys.
 */
export const uuidSchema = z
  .string()
  .uuid('Must be a valid UUID v4');

/**
 * Idempotency header validation.
 */
export const idempotencyHeaderSchema = z.object({
  'idempotency-key': uuidSchema
});

/**
 * Anti-CSRF token header validation.
 */
export const csrfHeaderSchema = z.object({
  'x-csrf-token': z.string().min(1, 'CSRF token is required')
});
