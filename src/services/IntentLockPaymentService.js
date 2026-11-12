import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AuthorizationRecord } from '../models/AuthorizationRecord.model.js';
import { CheckoutSnapshot } from '../models/CheckoutSnapshot.model.js';
import { PaymentIntent } from '../models/PaymentIntent.model.js';
import { ProductProposal } from '../models/ProductProposal.model.js';
import { UserPreference } from '../models/UserPreference.model.js';
import { paymentTransactionRepository } from '../repositories/PaymentTransactionRepository.js';
import { catalogService } from './CatalogService.js';
import { payPalService, PayPalPaymentError } from './PayPalService.js';
import { securityFirewallService, normalizeProposalSnapshotFields } from './SecurityFirewallService.js';
import { authorizePurchase } from './IntentLockV2Client.js';
import { canonicalJson, computeSnapshotCanonicalHash } from '../utils/canonicalJson.js';

const MAX_SAFE_MINOR = BigInt(Number.MAX_SAFE_INTEGER);

function toMajorNumber(minorValue, exponent, fieldName) {
  const minor = BigInt(minorValue);
  if (minor < 0n || minor > MAX_SAFE_MINOR) {
    throw new PayPalPaymentError(
      `${fieldName} exceeds the supported Python numeric precision.`,
      'INTENTLOCK_NUMERIC_RANGE_EXCEEDED',
      422
    );
  }
  const scale = 10 ** exponent;
  const digits = minor.toString().padStart(exponent + 1, '0');
  const decimal = exponent === 0
    ? digits
    : `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
  const value = Number(decimal);
  const scaled = Math.round(value * scale);
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(scaled) ||
    BigInt(scaled) !== minor
  ) {
    throw new PayPalPaymentError(
      `${fieldName} cannot be represented without minor-unit precision loss.`,
      'INTENTLOCK_NUMERIC_RANGE_EXCEEDED',
      422
    );
  }
  return value;
}

function requireDatabase() {
  if (
    mongoose.connection.readyState !== 1 ||
    PaymentIntent.db?.readyState !== 1 ||
    ProductProposal.db?.readyState !== 1 ||
    CheckoutSnapshot.db?.readyState !== 1
  ) {
    throw new PayPalPaymentError(
      'Authoritative purchase records are unavailable.',
      'AUTHORITATIVE_RECORDS_UNAVAILABLE',
      503
    );
  }
}

function snapshotForFirewall(snapshotDoc) {
  return {
    ...snapshotDoc.snapshotPayload,
    snapshotId: snapshotDoc._id.toString(),
    proposalId: snapshotDoc.proposalId.toString(),
    intentId: snapshotDoc.intentId.toString(),
    snapshotHash: snapshotDoc.snapshotHash
  };
}

function authorizationSummaryFromRecord(authorization) {
  const external = authorization.externalAuthorization?.toObject?.() || authorization.externalAuthorization;
  return {
    protocol: external.protocol,
    intentId: authorization.intentId.toString(),
    proposalId: authorization.proposalId.toString(),
    snapshotId: authorization.snapshotId,
    snapshotHash: authorization.snapshotHash,
    amountMinor: authorization.authorizedAmountMinor.toString(),
    currency: authorization.currency,
    paypalMerchantId: authorization.paypalMerchantId,
    expiresAt: authorization.expiresAt.toISOString()
  };
}

function addAuthorizationSummary(order, summary) {
  return {
    ...order,
    authorization: summary
  };
}

export class IntentLockPaymentService {
  async createOrder({
    proposalId,
    userId,
    userConsent,
    acknowledgedReviewDiffs = [],
    idempotencyKey
  }) {
    if (userConsent !== true) {
      throw new PayPalPaymentError(
        'User consent must be explicitly granted.',
        'USER_CONSENT_REQUIRED',
        400
      );
    }
    if (!mongoose.isValidObjectId(proposalId) || !mongoose.isValidObjectId(userId)) {
      throw new PayPalPaymentError('Proposal or authenticated user ID is invalid.', 'INVALID_PURCHASE_BINDING', 400);
    }
    requireDatabase();

    const existingTransaction = await paymentTransactionRepository.findByIdempotencyKey(idempotencyKey);
    if (existingTransaction) {
      if (String(existingTransaction.userId) !== String(userId)) {
        throw new PayPalPaymentError(
          'Idempotency key belongs to a different authenticated user.',
          'IDEMPOTENCY_USER_MISMATCH',
          403
        );
      }
      const existingAuthorization = await AuthorizationRecord.findById(existingTransaction.authorizationId);
      if (
        !existingAuthorization ||
        String(existingAuthorization.proposalId) !== String(proposalId) ||
        existingAuthorization.externalAuthorization?.protocol !== 'INTENTLOCK_V2_ED25519'
      ) {
        throw new PayPalPaymentError(
          'Idempotency key is not bound to this proposal and authorization.',
          'IDEMPOTENCY_AUTHORIZATION_MISMATCH',
          409
        );
      }
      const order = await payPalService.createOrder({
        proposalId,
        authorizationId: existingAuthorization._id.toString(),
        userConsent,
        userId,
        idempotencyKey
      });
      return addAuthorizationSummary(
        order,
        authorizationSummaryFromRecord(existingAuthorization)
      );
    }

    let inFlightAuthorization;
    try {
      inFlightAuthorization = await AuthorizationRecord.findOne({ idempotencyKey });
    } catch {
      throw new PayPalPaymentError(
        'Existing authorization retry state could not be loaded.',
        'AUTHORITATIVE_RECORDS_UNAVAILABLE',
        503
      );
    }
    if (inFlightAuthorization) {
      if (
        String(inFlightAuthorization.userId) !== String(userId) ||
        String(inFlightAuthorization.proposalId) !== String(proposalId) ||
        inFlightAuthorization.externalAuthorization?.protocol !== 'INTENTLOCK_V2_ED25519'
      ) {
        throw new PayPalPaymentError(
          'Idempotency key is already bound to another purchase authorization.',
          'IDEMPOTENCY_AUTHORIZATION_MISMATCH',
          409
        );
      }
      if (
        inFlightAuthorization.status !== 'IN_FLIGHT' ||
        inFlightAuthorization.idempotencyKey !== idempotencyKey
      ) {
        throw new PayPalPaymentError(
          'The previous order attempt requires reconciliation and cannot be dispatched again.',
          'ORDER_RETRY_REQUIRES_RECONCILIATION',
          409
        );
      }
      const order = await payPalService.createOrder({
        proposalId,
        authorizationId: inFlightAuthorization._id.toString(),
        userConsent,
        acknowledgedReviewDiffs,
        userId,
        idempotencyKey
      });
      return addAuthorizationSummary(
        order,
        authorizationSummaryFromRecord(inFlightAuthorization)
      );
    }

    let proposal;
    let intent;
    let snapshotDoc;
    try {
      proposal = await ProductProposal.findById(proposalId);
      if (!proposal) {
        throw new PayPalPaymentError('Product proposal was not found.', 'PROPOSAL_NOT_FOUND', 404);
      }
      [intent, snapshotDoc] = await Promise.all([
        PaymentIntent.findOne({ _id: proposal.intentId, userId }),
        CheckoutSnapshot.findOne({
          proposalId: proposal._id,
          intentId: proposal.intentId
        })
      ]);
    } catch (error) {
      if (error instanceof PayPalPaymentError) throw error;
      throw new PayPalPaymentError(
        'Authoritative purchase records could not be loaded.',
        'AUTHORITATIVE_RECORDS_UNAVAILABLE',
        503
      );
    }
    if (!intent || !snapshotDoc) {
      throw new PayPalPaymentError(
        'Proposal is not associated with an intent owned by the authenticated user and a stored snapshot.',
        'PURCHASE_BINDING_NOT_FOUND',
        404
      );
    }
    if (['CANCELLED', 'EXPIRED'].includes(intent.status) || ['BLOCKED', 'REJECTED'].includes(proposal.status)) {
      throw new PayPalPaymentError('Purchase intent or proposal is not eligible for checkout.', 'PURCHASE_NOT_ELIGIBLE', 403);
    }

    const snapshotPayload = snapshotDoc.snapshotPayload;
    let proposalFields;
    let snapshotFields;
    let recomputedSnapshotHash;
    try {
      proposalFields = normalizeProposalSnapshotFields(proposal, 'proposal');
      snapshotFields = normalizeProposalSnapshotFields(snapshotPayload, 'snapshot');
      recomputedSnapshotHash = computeSnapshotCanonicalHash(snapshotPayload);
    } catch {
      throw new PayPalPaymentError(
        'Stored proposal or checkout snapshot is malformed.',
        'INVALID_AUTHORIZATION_SNAPSHOT',
        403
      );
    }
    if (
      String(snapshotDoc.intentId) !== String(intent._id) ||
      String(snapshotDoc.proposalId) !== String(proposal._id) ||
      String(proposal.intentId) !== String(intent._id) ||
      recomputedSnapshotHash !== snapshotDoc.snapshotHash ||
      canonicalJson(proposalFields) !== canonicalJson(snapshotFields)
    ) {
      throw new PayPalPaymentError(
        'Proposal and immutable checkout snapshot do not match.',
        'AUTHORIZATION_BINDING_MISMATCH',
        403
      );
    }

    const pricing = snapshotFields.pricing;
    const exponent = pricing.minorUnitExponent;
    if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 3) {
      throw new PayPalPaymentError(
        'The Flask IntentLock contract supports currency exponents from zero through three.',
        'INTENTLOCK_CURRENCY_EXPONENT_UNSUPPORTED',
        422
      );
    }
    const catalogProduct = catalogService.getProductById(snapshotPayload.productId);
    if (
      !catalogProduct ||
      catalogProduct.isVerified !== true ||
      catalogProduct.merchantId !== proposal.merchantId ||
      catalogProduct.paypalMerchantId !== proposal.paypalMerchantId
    ) {
      throw new PayPalPaymentError(
        'Proposal merchant or product is not present in the verified catalog.',
        'UNVERIFIED_PURCHASE_MERCHANT',
        403
      );
    }

    const baseMinor = BigInt(pricing.basePriceMinor);
    const shippingMinor = BigInt(pricing.shippingMinor);
    const taxMinor = BigInt(pricing.taxMinor);
    const discountMinor = BigInt(pricing.discountMinor);
    const totalMinor = BigInt(pricing.totalPriceMinor);
    const itemSubtotal = snapshotFields.lineItems.reduce(
      (sum, item) => sum + BigInt(item.unitPriceMinor) * BigInt(item.quantity),
      0n
    );
    if (
      itemSubtotal !== baseMinor ||
      discountMinor > baseMinor ||
      baseMinor + shippingMinor + taxMinor - discountMinor !== totalMinor ||
      totalMinor <= 0n ||
      pricing.currency !== String(intent.currency).toUpperCase() ||
      exponent !== Number(intent.minorUnitExponent)
    ) {
      throw new PayPalPaymentError(
        'Proposal line items, fees, discount, or currency do not reconcile to the purchase total.',
        'PURCHASE_PRICING_MISMATCH',
        403
      );
    }

    let merchantUrl;
    try {
      merchantUrl = new URL(catalogProduct.productUrl);
    } catch {
      throw new PayPalPaymentError('Verified catalog merchant URL is invalid.', 'UNVERIFIED_PURCHASE_MERCHANT', 403);
    }
    if (merchantUrl.protocol !== 'https:' || merchantUrl.username || merchantUrl.password) {
      throw new PayPalPaymentError('Verified catalog merchant URL is not secure.', 'UNVERIFIED_PURCHASE_MERCHANT', 403);
    }

    const userIdString = userId.toString();
    const intentId = intent._id.toString();
    const snapshotId = snapshotDoc._id.toString();
    const proposalIdString = proposal._id.toString();
    const amountMinor = totalMinor.toString();
    const authorizationContext = {
      user_id: userIdString,
      intent_id: intentId,
      intent_version: intent.version,
      proposal_id: proposalIdString,
      snapshot_id: snapshotId,
      snapshot_hash: snapshotDoc.snapshotHash.toLowerCase(),
      amount_minor: amountMinor,
      currency: pricing.currency,
      minor_unit_exponent: exponent,
      merchant_id: proposal.merchantId,
      paypal_merchant_id: proposal.paypalMerchantId
    };

    const intentPayload = {
      intent_id: intentId,
      buyer_id: userIdString,
      session_id: crypto.randomUUID(),
      merchant: {
        merchant_id: proposal.merchantId,
        name: catalogProduct.merchantName,
        domain: merchantUrl.hostname,
        is_verified: true
      },
      items: snapshotFields.lineItems.map((item, index) => ({
        item_id: snapshotFields.lineItems.length === 1 ? snapshotPayload.productId : item.sku,
        name: item.name,
        sku: item.sku,
        unit_price: toMajorNumber(item.unitPriceMinor, exponent, `lineItems[${index}].unitPriceMinor`),
        quantity: item.quantity,
        ...(snapshotFields.lineItems.length === 1
          ? {
              catalog_baseline_price: toMajorNumber(
                catalogProduct.basePriceMinor,
                exponent,
                'catalogProduct.basePriceMinor'
              )
            }
          : {})
      })),
      costs: {
        subtotal: toMajorNumber(baseMinor, exponent, 'pricing.basePriceMinor'),
        tax: toMajorNumber(taxMinor, exponent, 'pricing.taxMinor'),
        shipping: toMajorNumber(shippingMinor, exponent, 'pricing.shippingMinor'),
        discount: toMajorNumber(discountMinor, exponent, 'pricing.discountMinor'),
        total_charged: toMajorNumber(totalMinor, exponent, 'pricing.totalPriceMinor'),
        currency: pricing.currency
      },
      subscription: {
        is_subscription: snapshotFields.recurring.isRecurring,
        billing_interval: {
          DAY: 'daily',
          WEEK: 'weekly',
          MONTH: 'monthly',
          YEAR: 'yearly'
        }[snapshotFields.recurring.billingInterval] || 'none',
        trial_period_days: 0,
        auto_renews: snapshotFields.recurring.isRecurring,
        explicit_opt_in: false,
        renewal_price: 0
      },
      raw_prompt_context: intent.prompt,
      promo_codes: []
    };

    let externalAuthorization;
    try {
      externalAuthorization = await authorizePurchase(intentPayload, authorizationContext);
    } catch (error) {
      if (error?.statusCode) {
        throw new PayPalPaymentError(error.message, error.code, error.statusCode);
      }
      throw new PayPalPaymentError(
        'IntentLock V2 authorization could not be verified.',
        'INVALID_INTENTLOCK_V2_AUTHORIZATION',
        403
      );
    }

    let userPreferences;
    try {
      userPreferences = await UserPreference.findOne({ userId: intent.userId });
    } catch {
      throw new PayPalPaymentError(
        'User policy preferences could not be loaded.',
        'AUTHORITATIVE_RECORDS_UNAVAILABLE',
        503
      );
    }
    const firewallResult = await securityFirewallService.evaluateProposal({
      intent: {
        id: intentId,
        version: intent.version,
        maxBudgetMinor: intent.maxBudgetMinor.toString(),
        currency: intent.currency,
        minorUnitExponent: intent.minorUnitExponent,
        requiredSpecs: intent.constraints?.requiredSpecs instanceof Map
          ? Object.fromEntries(intent.constraints.requiredSpecs)
          : intent.constraints?.requiredSpecs || {}
      },
      snapshot: snapshotForFirewall(snapshotDoc),
      userId: userIdString,
      userPreferences,
      acknowledgedReviewDiffs,
      externalAuthorization
    });

    if (firewallResult.decision !== 'PASS' || !firewallResult.authorization?.authorizationId) {
      const review = firewallResult.decision === 'REVIEW';
      throw new PayPalPaymentError(
        review
          ? 'Purchase requires explicit acknowledgment of the listed review differences.'
          : 'Security policy did not authorize this purchase.',
        review ? 'SECURITY_REVIEW_REQUIRED' : firewallResult.errorCode || 'SECURITY_POLICY_BLOCKED',
        review ? 409 : 403
      );
    }

    const order = await payPalService.createOrder({
      proposalId: proposalIdString,
      authorizationId: firewallResult.authorization.authorizationId,
      userConsent,
      acknowledgedReviewDiffs,
      userId: userIdString,
      idempotencyKey
    });

    return addAuthorizationSummary(order, {
      protocol: externalAuthorization.protocol,
      intentId,
      proposalId: proposalIdString,
      snapshotId,
      snapshotHash: snapshotDoc.snapshotHash,
      amountMinor,
      currency: pricing.currency,
      paypalMerchantId: proposal.paypalMerchantId,
      expiresAt: new Date(externalAuthorization.expiresAt * 1000).toISOString()
    });
  }
}

export const intentLockPaymentService = new IntentLockPaymentService();
