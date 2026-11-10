import { z } from 'zod';

/**
 * Schema for creating a PayPal order.
 * Requires explicit userConsent (must be literal true) to satisfy the AI-firewall guarantee:
 * "AI recommends purchases; independent deterministic firewall verifies; explicit user confirms."
 */
export const createOrderSchema = z.object({
  proposalId: z.string().min(1, 'Proposal ID is required'),
  authorizationId: z.string().min(1, 'Authorization ID is required'),
  userConsent: z.literal(true, {
    errorMap: () => ({ message: 'userConsent must be explicitly set to true' })
  }),
  acknowledgedReviewDiffs: z.array(z.string()).default([])
});

/**
 * Schema for capturing an approved PayPal order.
 * Requires explicit buyer post-approval confirmation (SEC-03 Gate 3).
 */
export const captureOrderSchema = z.object({
  orderId: z.string().min(1, 'PayPal Order ID is required'),
  authorizationId: z.string().min(1, 'Authorization ID is required'),
  userConsent: z.literal(true, {
    errorMap: () => ({ message: 'userConsent must be explicitly set to true' })
  }),
  confirmationChallenge: z.string().optional()
});

/**
 * Schema for recovering a checkout session via single-use ephemeral return token.
 * Used when SameSite=Strict cookies are omitted during cross-site PayPal redirect navigation.
 */
export const recoverSessionSchema = z.object({
  orderId: z.string().min(1, 'PayPal Order ID is required'),
  returnToken: z.string().min(1, 'Ephemeral return token is required')
});

/**
 * Schema for PayPal webhook headers verification.
 */
export const webhookHeaderSchema = z.object({
  'paypal-auth-algo': z.string().min(1, 'paypal-auth-algo is required'),
  'paypal-cert-url': z.string().url('paypal-cert-url must be a valid URL'),
  'paypal-transmission-id': z.string().min(1, 'paypal-transmission-id is required'),
  'paypal-transmission-sig': z.string().min(1, 'paypal-transmission-sig is required'),
  'paypal-transmission-time': z.string().min(1, 'paypal-transmission-time is required')
});
