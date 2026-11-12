import { z } from 'zod';
import {
  currencySchema,
  decimalIntegerStringSchema,
  minorAmountSchema,
  sha256HexSchema
} from './common.schema.js';
import { lineItemSchema, pricingSchema, recurringSchema } from './proposal.schema.js';

/**
 * Schema for verifying a proposal against an intent in the Security Firewall.
 */
export const verifyProposalSchema = z.object({
  intent: z.object({
    id: z.string().min(1, 'Intent ID is required'),
    version: z.number().int().positive('Intent version must be positive'),
    maxBudgetMinor: minorAmountSchema,
    currency: currencySchema,
    minorUnitExponent: z.number().int().min(0).max(4).default(2),
    requiredSpecs: z.record(z.unknown()).optional().default({})
  }),
  snapshot: z.object({
    intentId: z.string().min(1, 'Snapshot intent ID is required').optional(),
    snapshotId: z.string().min(1, 'Snapshot ID is required'),
    snapshotHash: sha256HexSchema,
    proposalId: z.string().min(1, 'Proposal ID is required'),
    productId: z.string().min(1, 'Product ID is required'),
    variantSku: z.string().min(1, 'Variant SKU is required'),
    merchantId: z.string().min(1, 'Merchant ID is required'),
    paypalMerchantId: z.string().min(1, 'PayPal merchant ID is required'),
    lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
    pricing: pricingSchema,
    recurring: recurringSchema,
    specifications: z.record(z.unknown()),
    rawDescription: z.string().optional() // Untrusted passive data
  }),
  acknowledgedReviewDiffs: z.array(z.string()).optional().default([])
});

/**
 * Strict schema for the canonical authorization payload signed with Ed25519.
 * Conforms to RFC 8785:
 * - All monetary values must be decimal integer strings (never numbers).
 * - Datetimes must be ISO 8601 strings.
 * - Nonces and hashes must be lowercase hex strings.
 */
export const canonicalAuthorizationSchema = z.object({
  authorizationId: z.string().min(1, 'Authorization ID is required'),
  intentId: z.string().min(1, 'Intent ID is required'),
  intentVersion: z.number().int().positive('Intent version must be positive'),
  proposalId: z.string().min(1, 'Proposal ID is required'),
  snapshotId: z.string().min(1, 'Snapshot ID is required'),
  snapshotHash: sha256HexSchema,
  userId: z.string().min(1, 'User ID is required'),
  paypalMerchantId: z.string().min(1, 'PayPal Merchant ID is required'),
  totalPriceMinor: decimalIntegerStringSchema,
  currency: currencySchema,
  nonce: sha256HexSchema,
  issuedAt: z.string().datetime({ message: 'issuedAt must be a valid ISO 8601 datetime' }),
  expiresAt: z.string().datetime({ message: 'expiresAt must be a valid ISO 8601 datetime' }),
  authMode: z.enum(['LIVE_FIREWALL', 'MOCK_DETERMINISTIC']),
  externalAuthorization: z.object({
    protocol: z.literal('INTENTLOCK_V2_ED25519'),
    tokenId: z.string().regex(/^[0-9a-f]{32}$/),
    intentHash: z.string().regex(/^[0-9a-f]{128}$/),
    purchaseHash: z.string().regex(/^[0-9a-f]{128}$/),
    merchantId: z.string().min(1),
    nonce: z.string().regex(/^[0-9a-f]{32}$/),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    compactToken: z.string().min(1),
    publicKey: z.string().regex(/^[0-9a-fA-F]{64}$/)
  }).optional()
});
