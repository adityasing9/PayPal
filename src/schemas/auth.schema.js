import { z } from 'zod';
import { currencySchema, decimalIntegerStringSchema } from './common.schema.js';

export const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .trim()
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z
    .string({ required_error: 'Name is required' })
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .trim()
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password cannot be empty')
});

/**
 * Schema for updating user preferences.
 * API-facing contract strictly enforces decimalIntegerStringSchema for monetary thresholds.
 */
export const updatePreferencesSchema = z.object({
  defaultCurrency: currencySchema.optional(),
  minorUnitExponent: z.number().int().min(0).max(4).default(2).optional(),
  maxTransactionLimitMinor: decimalIntegerStringSchema.optional(),
  allowedMerchants: z.array(z.string().trim().min(1)).optional(),
  blockedMerchants: z.array(z.string().trim().min(1)).optional(),
  requireExplicitReviewOverMinor: decimalIntegerStringSchema.optional()
});
