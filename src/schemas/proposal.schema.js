import { z } from 'zod';
import { currencySchema, minorAmountSchema } from './common.schema.js';

export const lineItemSchema = z.object({
  name: z.string().min(1, 'Line item name is required'),
  sku: z.string().min(1, 'Line item SKU is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer').default(1),
  unitPriceMinor: minorAmountSchema
});

export const pricingSchema = z.object({
  basePriceMinor: minorAmountSchema,
  shippingMinor: minorAmountSchema.default('0'),
  taxMinor: minorAmountSchema.default('0'),
  discountMinor: minorAmountSchema.default('0'),
  totalPriceMinor: minorAmountSchema,
  currency: currencySchema,
  minorUnitExponent: z.number().int().min(0).max(4).default(2)
});

export const recurringSchema = z.object({
  isRecurring: z.boolean().default(false),
  billingInterval: z.enum(['DAY', 'WEEK', 'MONTH', 'YEAR']).nullable().default(null),
  billingCycles: z.number().int().min(0).default(0)
});

export const proposalMerchantSchema = z.object({
  id: z.string().min(1, 'Merchant ID is required'),
  name: z.string().min(1, 'Merchant name is required'),
  paypalMerchantId: z.string().min(1, 'PayPal merchant ID is required')
});

export const createProposalSchema = z.object({
  intentId: z.string().min(1, 'Intent ID is required'),
  productId: z.string().min(1, 'Product ID is required'),
  variantSku: z.string().min(1, 'Variant SKU is required'),
  title: z.string().min(1, 'Title is required').max(255),
  merchant: proposalMerchantSchema,
  lineItems: z.array(lineItemSchema).min(1, 'At least one line item is required'),
  pricing: pricingSchema,
  specifications: z.record(z.unknown()).default({}),
  recurring: recurringSchema.default({
    isRecurring: false,
    billingInterval: null,
    billingCycles: 0
  }),
  catalogSource: z
    .enum(['CHANNEL3_OFFLINE_FIXTURE', 'CHANNEL3_API', 'MOCK'])
    .default('CHANNEL3_OFFLINE_FIXTURE'),
  productUrl: z.string().url('Product URL must be a valid URL'),
  agentRationale: z.string().trim().optional(),
  recommendationRank: z.number().int().positive().default(1)
});
