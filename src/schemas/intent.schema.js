import { z } from 'zod';
import { currencySchema, decimalIntegerStringSchema } from './common.schema.js';

export const intentConstraintsSchema = z.object({
  requiredSpecs: z.record(z.unknown()).optional().default({}),
  preferredMerchants: z.array(z.string().trim().min(1)).optional().default([]),
  blockedMerchants: z.array(z.string().trim().min(1)).optional().default([])
});

/**
 * Schema for creating a purchase intent.
 * API-facing contract strictly enforces decimalIntegerStringSchema for maxBudgetMinor.
 * Raw JavaScript numbers are rejected to prevent precision loss.
 */
export const createIntentSchema = z.object({
  prompt: z
    .string({ required_error: 'Prompt is required' })
    .min(1, 'Prompt cannot be empty')
    .max(1000, 'Prompt must not exceed 1000 characters')
    .trim(),
  maxBudgetMinor: decimalIntegerStringSchema,
  currency: currencySchema,
  minorUnitExponent: z.number().int().min(0).max(4).default(2),
  category: z.enum(['Keyboards', 'Headphones', 'Monitors']).optional(),
  constraints: intentConstraintsSchema.optional().default({})
});
