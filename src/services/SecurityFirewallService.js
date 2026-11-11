import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { RiskAssessment } from '../models/RiskAssessment.model.js';
import { CheckoutSnapshot } from '../models/CheckoutSnapshot.model.js';
import { ProductProposal } from '../models/ProductProposal.model.js';
import { PaymentIntent } from '../models/PaymentIntent.model.js';
import { authorizationRepository } from '../repositories/AuthorizationRepository.js';
import {
  canonicalJson,
  canonicalJsonSha256,
  computeSnapshotCanonicalHash
} from '../utils/canonicalJson.js';
import {
  generateNonce,
  signMessage,
  verifySignature,
  generateEd25519KeyPair
} from '../utils/cryptoUtils.js';

// Verified merchant to PayPal merchant ID directory
export const VERIFIED_MERCHANTS = {
  MERCHANT_KEYCHRON: 'PPM_KEYCHRON_998',
  MERCHANT_LOGITECH: 'PPM_LOGITECH_441',
  MERCHANT_DELL: 'PPM_DELL_223',
  MERCHANT_SONY: 'PPM_SONY_771',
  MERCHANT_AUDIO_TECHNICA: 'PPM_AUDIO_552',
  MERCHANT_SENNHEISER: 'PPM_SENN_334',
  MERCHANT_LG: 'PPM_LG_119',
  MERCHANT_ASUS: 'PPM_ASUS_882'
};

function normalizeMinorUnits(value, fieldName) {
  if (
    typeof value === 'number' &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new TypeError(`${fieldName} must be a non-negative safe integer or decimal integer value.`);
  }

  let amount;
  try {
    if (typeof value === 'string' && !/^\d+$/.test(value)) {
      throw new TypeError();
    }
    amount = BigInt(value);
  } catch {
    throw new TypeError(`${fieldName} must be a non-negative integer value.`);
  }
  if (amount < 0n) {
    throw new TypeError(`${fieldName} must be non-negative.`);
  }
  return amount.toString();
}

function normalizeLineItems(items, fieldName) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new TypeError(`${fieldName} must contain at least one line item.`);
  }

  return items.map((item, index) => {
    if (
      !item ||
      typeof item.name !== 'string' ||
      !item.name ||
      typeof item.sku !== 'string' ||
      !item.sku ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw new TypeError(`${fieldName}[${index}] is malformed.`);
    }

    return {
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPriceMinor: normalizeMinorUnits(
        item.unitPriceMinor,
        `${fieldName}[${index}].unitPriceMinor`
      )
    };
  });
}

function normalizePricing(pricing, fieldName) {
  if (!pricing || typeof pricing !== 'object') {
    throw new TypeError(`${fieldName} is required.`);
  }
  if (
    typeof pricing.currency !== 'string' ||
    !/^[A-Za-z]{3}$/.test(pricing.currency)
  ) {
    throw new TypeError(`${fieldName}.currency is invalid.`);
  }
  if (
    !Number.isSafeInteger(pricing.minorUnitExponent) ||
    pricing.minorUnitExponent < 0 ||
    pricing.minorUnitExponent > 3
  ) {
    throw new TypeError(`${fieldName}.minorUnitExponent is unsupported.`);
  }

  return {
    basePriceMinor: normalizeMinorUnits(pricing.basePriceMinor, `${fieldName}.basePriceMinor`),
    shippingMinor: normalizeMinorUnits(pricing.shippingMinor, `${fieldName}.shippingMinor`),
    taxMinor: normalizeMinorUnits(pricing.taxMinor, `${fieldName}.taxMinor`),
    discountMinor: normalizeMinorUnits(pricing.discountMinor, `${fieldName}.discountMinor`),
    totalPriceMinor: normalizeMinorUnits(pricing.totalPriceMinor, `${fieldName}.totalPriceMinor`),
    currency: pricing.currency.toUpperCase(),
    minorUnitExponent: pricing.minorUnitExponent
  };
}

function normalizeRecurring(recurring, fieldName) {
  if (!recurring || typeof recurring !== 'object' || typeof recurring.isRecurring !== 'boolean') {
    throw new TypeError(`${fieldName}.isRecurring is required.`);
  }

  const billingInterval = recurring.billingInterval ?? null;
  const billingCycles = recurring.billingCycles ?? 0;
  if (
    (billingInterval !== null && !['DAY', 'WEEK', 'MONTH', 'YEAR'].includes(billingInterval)) ||
    !Number.isSafeInteger(billingCycles) ||
    billingCycles < 0
  ) {
    throw new TypeError(`${fieldName} is malformed.`);
  }

  return {
    isRecurring: recurring.isRecurring,
    billingInterval,
    billingCycles
  };
}

export function normalizeProposalSnapshotFields(record, fieldName) {
  if (
    typeof record.variantSku !== 'string' ||
    !record.variantSku ||
    typeof record.merchantId !== 'string' ||
    !record.merchantId ||
    typeof record.paypalMerchantId !== 'string' ||
    !record.paypalMerchantId
  ) {
    throw new TypeError(`${fieldName} merchant or SKU fields are missing.`);
  }

  return {
    variantSku: record.variantSku,
    merchantId: record.merchantId,
    paypalMerchantId: record.paypalMerchantId,
    lineItems: normalizeLineItems(record.lineItems, `${fieldName}.lineItems`),
    pricing: normalizePricing(record.pricing, `${fieldName}.pricing`),
    recurring: normalizeRecurring(record.recurring, `${fieldName}.recurring`)
  };
}

function getRequiredSpecs(value) {
  return value instanceof Map ? Object.fromEntries(value.entries()) : (value || {});
}

export class SecurityFirewallService {
  constructor() {
    this._keyPair = null;
  }

  /**
   * Lazily loads or generates the Ed25519 key pair for signing authorizations.
   */
  getKeyPair() {
    if (!this._keyPair) {
      const hasPrivate = Boolean(env.ED25519_PRIVATE_KEY);
      const hasPublic = Boolean(env.ED25519_PUBLIC_KEY);
      if (hasPrivate !== hasPublic) {
        throw new Error('SECURITY VIOLATION: Configure both ED25519_PRIVATE_KEY and ED25519_PUBLIC_KEY, or neither for local development.');
      }
      if (hasPrivate && hasPublic) {
        this._keyPair = {
          publicKeyHex: env.ED25519_PUBLIC_KEY,
          privateKeyHex: env.ED25519_PRIVATE_KEY
        };
      } else {
        if (env.NODE_ENV === 'production') {
          throw new Error('SECURITY VIOLATION: Production signing keys are required.');
        }
        // Ephemeral keys are permitted only outside production.
        const generated = generateEd25519KeyPair();
        this._keyPair = {
          publicKeyHex: generated.publicKeyHex,
          privateKeyHex: generated.privateKeyHex
        };
      }
      const probe = 'INTENTLOCK_ED25519_KEYPAIR_CHECK_V1';
      const probeSignature = signMessage(probe, this._keyPair.privateKeyHex);
      if (!verifySignature(probe, probeSignature, this._keyPair.publicKeyHex)) {
        this._keyPair = null;
        throw new Error('SECURITY VIOLATION: ED25519_PRIVATE_KEY does not match ED25519_PUBLIC_KEY.');
      }
    }
    return this._keyPair;
  }

  /**
   * Evaluates a proposal snapshot against original intent constraints.
   *
   * @param {{
   *   intent: object,
   *   snapshot: object,
   *   userId: string,
   *   userPreferences?: object,
   *   acknowledgedReviewDiffs?: string[],
   *   now?: Date
   * }} params
   * @returns {Promise<object>} Verification result (PASS, REVIEW, or BLOCK)
   */
  async evaluateProposal({
    intent,
    snapshot,
    userId,
    userPreferences,
    acknowledgedReviewDiffs = [],
    externalAuthorization = null,
    now = new Date()
  }) {
    const failedRuleCodes = [];
    const specDifferences = [];
    const ruleEvaluations = {};

    // -------------------------------------------------------------------------
    // Rule 0: Snapshot Integrity & Immutability Verification (AUD-03)
    // -------------------------------------------------------------------------
    let effectiveSnapshot = snapshot;
    let effectiveSnapshotHash = snapshot.snapshotHash;
    let effectiveIntent = intent;
    let storedSnapshotDoc = null;

    if (env.NODE_ENV === 'production') {
      // Production authorization must be based on records owned by the
      // authenticated user. Never fall back to a client-supplied snapshot.
      const requestedIntentId = intent?.id;
      const requestedSnapshotIntentId = snapshot?.intentId;
      const requestedSnapshotId = snapshot?.snapshotId;
      const requestedProposalId = snapshot?.proposalId;
      const databaseReady =
        CheckoutSnapshot.db?.readyState === 1 &&
        ProductProposal.db?.readyState === 1 &&
        PaymentIntent.db?.readyState === 1;

      if (!databaseReady) {
        failedRuleCodes.push('AUTHORITATIVE_RECORDS_UNAVAILABLE');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'DATABASE_NOT_CONNECTED'
        };
      } else if (
        typeof requestedIntentId !== 'string' ||
        typeof requestedSnapshotIntentId !== 'string' ||
        requestedSnapshotIntentId !== requestedIntentId ||
        typeof requestedSnapshotId !== 'string' ||
        typeof requestedProposalId !== 'string' ||
        typeof snapshot?.snapshotHash !== 'string' ||
        !/^[0-9a-fA-F]{64}$/.test(snapshot.snapshotHash) ||
        !mongoose.isValidObjectId(requestedIntentId) ||
        !mongoose.isValidObjectId(requestedSnapshotIntentId) ||
        !mongoose.isValidObjectId(requestedSnapshotId) ||
        !mongoose.isValidObjectId(requestedProposalId) ||
        !mongoose.isValidObjectId(userId)
      ) {
        failedRuleCodes.push('AUTHORITATIVE_RECORDS_NOT_FOUND');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'INVALID_AUTHORIZATION_BINDING'
        };
      } else {
        try {
          const [authoritativeIntent, authoritativeProposal, authoritativeSnapshot] =
            await Promise.all([
              PaymentIntent.findOne({ _id: requestedIntentId, userId }),
              ProductProposal.findOne({
                _id: requestedProposalId,
                intentId: requestedIntentId
              }),
              CheckoutSnapshot.findOne({
                _id: requestedSnapshotId,
                proposalId: requestedProposalId,
                intentId: requestedIntentId
              })
            ]);

          if (!authoritativeIntent || !authoritativeProposal || !authoritativeSnapshot) {
            failedRuleCodes.push('AUTHORITATIVE_RECORDS_NOT_FOUND');
            ruleEvaluations.snapshotIntegrityCheck = {
              passed: false,
              reason: 'INTENT_PROPOSAL_OR_SNAPSHOT_NOT_FOUND'
            };
          } else if (
            requestedIntentId !== authoritativeIntent._id.toString() ||
            String(authoritativeIntent.userId) !== String(userId) ||
            requestedSnapshotId !== authoritativeSnapshot._id.toString() ||
            requestedProposalId !== authoritativeProposal._id.toString() ||
            String(authoritativeProposal.intentId) !== String(authoritativeIntent._id) ||
            String(authoritativeSnapshot.intentId) !== String(authoritativeIntent._id) ||
            String(authoritativeSnapshot.proposalId) !== String(authoritativeProposal._id) ||
            (intent.version != null &&
              Number(intent.version) !== Number(authoritativeIntent.version))
          ) {
            failedRuleCodes.push('SNAPSHOT_TAMPERING_DETECTED');
            ruleEvaluations.snapshotIntegrityCheck = {
              passed: false,
              reason: 'INTENT_PROPOSAL_SNAPSHOT_BINDING_MISMATCH'
            };
          } else {
            storedSnapshotDoc = authoritativeSnapshot;
            effectiveIntent = {
              id: authoritativeIntent._id.toString(),
              version: authoritativeIntent.version,
              maxBudgetMinor: authoritativeIntent.maxBudgetMinor.toString(),
              currency: authoritativeIntent.currency,
              minorUnitExponent: authoritativeIntent.minorUnitExponent,
              requiredSpecs: getRequiredSpecs(authoritativeIntent.constraints?.requiredSpecs)
            };

            try {
              const proposalFields = normalizeProposalSnapshotFields(
                authoritativeProposal,
                'proposal'
              );
              const snapshotFields = normalizeProposalSnapshotFields(
                authoritativeSnapshot.snapshotPayload,
                'snapshot'
              );
              if (canonicalJson(proposalFields) !== canonicalJson(snapshotFields)) {
                failedRuleCodes.push('PROPOSAL_SNAPSHOT_MISMATCH');
                ruleEvaluations.proposalSnapshotConsistencyCheck = {
                  passed: false,
                  reason: 'PROPOSAL_FIELDS_DO_NOT_MATCH_SNAPSHOT'
                };
              } else {
                ruleEvaluations.proposalSnapshotConsistencyCheck = {
                  passed: true
                };
              }

              const snapshotPricing = snapshotFields.pricing;
              if (
                snapshotPricing.currency !== String(authoritativeIntent.currency).toUpperCase() ||
                snapshotPricing.minorUnitExponent !== Number(authoritativeIntent.minorUnitExponent)
              ) {
                failedRuleCodes.push('CURRENCY_DENOMINATION_MISMATCH');
                ruleEvaluations.currencyDenominationCheck = {
                  passed: false,
                  intentCurrency: String(authoritativeIntent.currency).toUpperCase(),
                  intentMinorUnitExponent: Number(authoritativeIntent.minorUnitExponent),
                  snapshotCurrency: snapshotPricing.currency,
                  snapshotMinorUnitExponent: snapshotPricing.minorUnitExponent
                };
              } else {
                ruleEvaluations.currencyDenominationCheck = {
                  passed: true,
                  currency: snapshotPricing.currency,
                  minorUnitExponent: snapshotPricing.minorUnitExponent
                };
              }
            } catch {
              failedRuleCodes.push('PROPOSAL_SNAPSHOT_MISMATCH');
              ruleEvaluations.proposalSnapshotConsistencyCheck = {
                passed: false,
                reason: 'PROPOSAL_OR_SNAPSHOT_FIELDS_MALFORMED'
              };
            }
          }
        } catch {
          failedRuleCodes.push('AUTHORITATIVE_RECORD_LOOKUP_FAILED');
          ruleEvaluations.snapshotIntegrityCheck = {
            passed: false,
            reason: 'DATABASE_LOOKUP_FAILED'
          };
        }
      }
    } else {
      // Development/test compatibility path. This fallback must never run
      // in production, where the authenticated database records are mandatory.
      try {
        const queryConditions = [];
        if (snapshot.snapshotId && mongoose.isValidObjectId(snapshot.snapshotId)) {
          queryConditions.push({ _id: snapshot.snapshotId });
        }
        if (snapshot.proposalId && mongoose.isValidObjectId(snapshot.proposalId)) {
          queryConditions.push({ proposalId: snapshot.proposalId });
        }
        if (
          queryConditions.length > 0 &&
          (CheckoutSnapshot.findOne?._isMockFunction || CheckoutSnapshot.db?.readyState === 1)
        ) {
          storedSnapshotDoc = await CheckoutSnapshot.findOne({ $or: queryConditions });
        }
      } catch {
        // Offline fallback is retained only outside production.
      }
    }

    if (env.NODE_ENV === 'production' && !storedSnapshotDoc) {
      const integrity = ruleEvaluations.snapshotIntegrityCheck || {
        passed: false,
        reason: 'AUTHORITATIVE_SNAPSHOT_UNAVAILABLE'
      };
      return {
        decision: 'BLOCK',
        errorCode: failedRuleCodes[0] || 'AUTHORITATIVE_RECORDS_UNAVAILABLE',
        reason: 'Authoritative intent, proposal, and snapshot verification failed.',
        riskScore: 0.95,
        ruleEvaluations: { snapshotIntegrityCheck: integrity },
        authorization: null
      };
    }

    if (storedSnapshotDoc) {
      const authoritativeHash = storedSnapshotDoc.snapshotHash;
      let recomputedStoredHash;
      let clientPayloadHash;
      try {
        recomputedStoredHash = computeSnapshotCanonicalHash(storedSnapshotDoc.snapshotPayload);
        clientPayloadHash = computeSnapshotCanonicalHash(snapshot);
      } catch {
        return {
          decision: 'BLOCK',
          errorCode: 'SNAPSHOT_TAMPERING_DETECTED',
          reason: 'Stored or submitted snapshot payload is malformed.',
          riskScore: 0.95,
          ruleEvaluations: {
            ...ruleEvaluations,
            snapshotIntegrityCheck: {
              passed: false,
              reason: 'MALFORMED_SNAPSHOT_PAYLOAD'
            }
          },
          authorization: null
        };
      }

      // Verify that stored record itself was not tampered.
      if (
        env.NODE_ENV === 'production' &&
        (String(storedSnapshotDoc.proposalId) !== String(effectiveSnapshot.proposalId || snapshot.proposalId) ||
          String(storedSnapshotDoc.intentId) !== String(effectiveIntent.id))
      ) {
        failedRuleCodes.push('SNAPSHOT_TAMPERING_DETECTED');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'STORED_SNAPSHOT_BINDING_MISMATCH'
        };
      }

      if (authoritativeHash !== recomputedStoredHash) {
        failedRuleCodes.push('SNAPSHOT_TAMPERING_DETECTED');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'STORED_SNAPSHOT_CORRUPTED'
        };
      }

      // Check if client supplied a snapshot hash that mismatches authoritative hash
      if (snapshot.snapshotHash !== authoritativeHash) {
        failedRuleCodes.push('SNAPSHOT_TAMPERING_DETECTED');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'CLIENT_SNAPSHOT_HASH_MISMATCH',
          suppliedHash: snapshot.snapshotHash,
          authoritativeHash
        };
      }

      // Check if client-supplied payload was modified relative to stored authoritative snapshot
      if (clientPayloadHash !== authoritativeHash) {
        failedRuleCodes.push('SNAPSHOT_TAMPERING_DETECTED');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'CLIENT_SNAPSHOT_PAYLOAD_TAMPERED',
          clientPayloadHash,
          authoritativeHash
        };
      }

      // Check individual fields for tampering detection
      const storedPayload = storedSnapshotDoc.snapshotPayload;
      const hasFieldTampering =
        (snapshot.merchantId && snapshot.merchantId !== storedPayload.merchantId) ||
        (snapshot.paypalMerchantId && snapshot.paypalMerchantId !== storedPayload.paypalMerchantId) ||
        (snapshot.pricing?.totalPriceMinor &&
          snapshot.pricing.totalPriceMinor.toString() !== storedPayload.pricing.totalPriceMinor.toString()) ||
        (snapshot.pricing?.basePriceMinor &&
          snapshot.pricing.basePriceMinor.toString() !== storedPayload.pricing.basePriceMinor.toString());

      if (hasFieldTampering) {
        failedRuleCodes.push('SNAPSHOT_TAMPERING_DETECTED');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'SNAPSHOT_FIELDS_TAMPERED'
        };
      }

      // Use authoritative immutable CheckoutSnapshot from DB
      effectiveSnapshot = {
        ...storedPayload,
        snapshotId: storedSnapshotDoc._id.toString(),
        proposalId: storedSnapshotDoc.proposalId.toString(),
        snapshotHash: authoritativeHash
      };
      effectiveSnapshotHash = authoritativeHash;
    } else if (env.NODE_ENV !== 'production') {
      // Offline / in-memory mode: Independently recompute canonical SHA-256 snapshot hash.
      const recomputedHash = computeSnapshotCanonicalHash(snapshot);
      if (snapshot.snapshotHash && snapshot.snapshotHash !== recomputedHash) {
        failedRuleCodes.push('SNAPSHOT_TAMPERING_DETECTED');
        ruleEvaluations.snapshotIntegrityCheck = {
          passed: false,
          reason: 'SNAPSHOT_HASH_RECOMPUTE_MISMATCH',
          suppliedHash: snapshot.snapshotHash,
          recomputedHash
        };
      } else {
        effectiveSnapshotHash = recomputedHash;
      }
    }

    if (!ruleEvaluations.snapshotIntegrityCheck) {
      ruleEvaluations.snapshotIntegrityCheck = {
        passed: true,
        snapshotHash: effectiveSnapshotHash
      };
    }

    // -------------------------------------------------------------------------
    // Rule 1: Budget Ceiling Check
    // -------------------------------------------------------------------------
    const totalMinor = BigInt(effectiveSnapshot.pricing.totalPriceMinor);
    const maxBudgetMinor = BigInt(effectiveIntent.maxBudgetMinor);
    const deltaMinor = totalMinor - maxBudgetMinor;

    if (totalMinor > maxBudgetMinor) {
      failedRuleCodes.push('BUDGET_EXCEEDED');
      ruleEvaluations.budgetCheck = {
        passed: false,
        deltaMinor: Number(deltaMinor),
        totalPriceMinor: totalMinor.toString(),
        maxBudgetMinor: maxBudgetMinor.toString()
      };
    } else {
      ruleEvaluations.budgetCheck = {
        passed: true,
        deltaMinor: Number(deltaMinor)
      };
    }

    // Check against user maximum transaction limit if available
    if (userPreferences?.maxTransactionLimitMinor) {
      const userLimit = BigInt(userPreferences.maxTransactionLimitMinor);
      if (totalMinor > userLimit) {
        failedRuleCodes.push('USER_MAX_LIMIT_EXCEEDED');
        ruleEvaluations.userLimitCheck = {
          passed: false,
          userLimitMinor: userLimit.toString()
        };
      }
    }

    // -------------------------------------------------------------------------
    // Rule 2: Merchant & Payee Directory Check
    // -------------------------------------------------------------------------
    const expectedPayee = VERIFIED_MERCHANTS[effectiveSnapshot.merchantId];
    const isBlocked = userPreferences?.blockedMerchants?.includes(effectiveSnapshot.merchantId);

    if (isBlocked) {
      failedRuleCodes.push('MERCHANT_BLOCKED_BY_USER');
      ruleEvaluations.merchantCheck = {
        passed: false,
        reason: 'Merchant is on user blocked list'
      };
    } else if (!expectedPayee || expectedPayee !== effectiveSnapshot.paypalMerchantId) {
      failedRuleCodes.push('CRITICAL_VIOLATION_MERCHANT_MISMATCH');
      ruleEvaluations.merchantCheck = {
        passed: false,
        detectedMerchant: effectiveSnapshot.paypalMerchantId,
        expectedMerchant: expectedPayee || 'UNKNOWN_MERCHANT'
      };
    } else {
      ruleEvaluations.merchantCheck = {
        passed: true,
        payeeStatus: 'VERIFIED_WHITELIST'
      };
    }

    // -------------------------------------------------------------------------
    // Rule 3: Hidden Recurring Charges Check
    // -------------------------------------------------------------------------
    if (
      effectiveSnapshot.recurring?.isRecurring === true ||
      (effectiveSnapshot.recurring?.billingCycles || 0) > 0
    ) {
      failedRuleCodes.push('UNEXPECTED_RECURRING_CHARGE');
      ruleEvaluations.recurringCheck = {
        passed: false,
        isRecurring: true,
        billingCycles: effectiveSnapshot.recurring.billingCycles
      };
    } else {
      ruleEvaluations.recurringCheck = {
        passed: true,
        isRecurring: false
      };
    }

    // -------------------------------------------------------------------------
    // Rule 4: Specification Deviation Check
    // -------------------------------------------------------------------------
    const requestedSpecs = effectiveIntent.requiredSpecs || {};
    const proposedSpecs = effectiveSnapshot.specifications || {};

    for (const [key, requestedVal] of Object.entries(requestedSpecs)) {
      const proposedVal = proposedSpecs[key];
      if (
        proposedVal !== undefined &&
        String(requestedVal).toLowerCase() !== String(proposedVal).toLowerCase()
      ) {
        // Non-critical spec mismatch triggers REVIEW
        specDifferences.push({
          attribute: key,
          requested: String(requestedVal),
          proposed: String(proposedVal),
          criticality: 'NON_CRITICAL'
        });
      }
    }

    ruleEvaluations.specCheck = {
      passed: specDifferences.length === 0,
      mismatches: specDifferences
    };

    // -------------------------------------------------------------------------
    // Rule 5: Passive Content / Prompt Injection Check
    // -------------------------------------------------------------------------
    // Product descriptions are passive untrusted data.
    // Detection of prompt injection text alone does NOT block legitimate products.
    ruleEvaluations.contentCheck = {
      status: 'PASSIVE_DATA_CONFIRMED'
    };

    // -------------------------------------------------------------------------
    // Decision Formulation
    // -------------------------------------------------------------------------
    let decision = 'PASS';
    let riskScore = 0.02;

    const unacknowledgedDiffs = specDifferences.filter(
      (diff) => !acknowledgedReviewDiffs.includes(diff.attribute || diff.field)
    );

    if (failedRuleCodes.length > 0) {
      decision = 'BLOCK';
      riskScore = 0.95;
    } else if (unacknowledgedDiffs.length > 0) {
      decision = 'REVIEW';
      riskScore = 0.25;
    } else if (specDifferences.length > 0 && unacknowledgedDiffs.length === 0) {
      decision = 'PASS';
      riskScore = 0.15;
    }

    // Record RiskAssessment in DB
    try {
      await RiskAssessment.create({
        proposalId: effectiveSnapshot.proposalId,
        snapshotHash: effectiveSnapshotHash,
        decision,
        riskScore,
        failedRuleCodes,
        specDifferences,
        ruleEvaluationResults: ruleEvaluations,
        evaluatedAt: now
      });
    } catch {
      // In-memory or unseeded fallback during unit tests
    }

    // If BLOCK or REVIEW, return immediately with zero authorization authority
    if (decision === 'BLOCK') {
      return {
        decision: 'BLOCK',
        errorCode: failedRuleCodes[0],
        reason: `Policy check failed: ${failedRuleCodes.join(', ')}`,
        riskScore,
        ruleEvaluations,
        authorization: null
      };
    }

    if (decision === 'REVIEW') {
      return {
        decision: 'REVIEW',
        reviewReason: 'SPECIFICATION_MISMATCH',
        riskScore,
        specDifferences,
        ruleEvaluations,
        requiresExplicitUserConfirmation: true,
        authorization: null
      };
    }

    // -------------------------------------------------------------------------
    // PASS Outcome: Generate Ed25519 Canonical Authorization Record
    // -------------------------------------------------------------------------
    if (
      externalAuthorization &&
      (
        externalAuthorization.protocol !== 'INTENTLOCK_V2_ED25519' ||
        typeof externalAuthorization.tokenId !== 'string' ||
        typeof externalAuthorization.intentHash !== 'string' ||
        typeof externalAuthorization.purchaseHash !== 'string' ||
        typeof externalAuthorization.nonce !== 'string' ||
        typeof externalAuthorization.compactToken !== 'string' ||
        typeof externalAuthorization.publicKey !== 'string' ||
        !Number.isSafeInteger(externalAuthorization.issuedAt) ||
        !Number.isSafeInteger(externalAuthorization.expiresAt) ||
        externalAuthorization.expiresAt <= Math.floor(now.getTime() / 1000)
      )
    ) {
      return {
        decision: 'BLOCK',
        errorCode: 'INVALID_EXTERNAL_AUTHORIZATION',
        reason: 'The signed IntentLock V2 handoff is missing, malformed, or expired.',
        riskScore: 0.95,
        ruleEvaluations,
        authorization: null
      };
    }

    const { publicKeyHex, privateKeyHex } = this.getKeyPair();
    const nonce = generateNonce(32);
    const authorizationId = `auth_${crypto.randomBytes(8).toString('hex')}`;
    const issuedAtStr = now.toISOString();
    const expiresAtDate = new Date(Math.min(
      now.getTime() + 300000,
      externalAuthorization ? externalAuthorization.expiresAt * 1000 : Infinity
    ));
    const expiresAtStr = expiresAtDate.toISOString();

    const authMode = env.USE_MOCK_SECURITY ? 'MOCK_DETERMINISTIC' : 'LIVE_FIREWALL';

    const canonicalAuthPayload = {
      authorizationId,
      intentId: effectiveIntent.id,
      intentVersion: effectiveIntent.version || 1,
      proposalId: effectiveSnapshot.proposalId,
      snapshotId: effectiveSnapshot.snapshotId,
      snapshotHash: effectiveSnapshotHash,
      userId,
      paypalMerchantId: effectiveSnapshot.paypalMerchantId,
      totalPriceMinor: effectiveSnapshot.pricing.totalPriceMinor.toString(),
      currency: effectiveSnapshot.pricing.currency,
      nonce,
      issuedAt: issuedAtStr,
      expiresAt: expiresAtStr,
      authMode
    };
    if (externalAuthorization) {
      canonicalAuthPayload.externalAuthorization = externalAuthorization;
    }

    // RFC 8785 canonical hash
    const canonicalJsonHash = canonicalJsonSha256(canonicalAuthPayload);

    // Sign canonical hash with Ed25519 private key
    const signature = signMessage(canonicalJsonHash, privateKeyHex);

    // Persist the complete signed authorization before returning PASS.
    // A persistence failure must fail closed: an unpersisted authorization cannot be redeemed.
    const authorizationRecordData = {
      authorizationId,
      intentId: effectiveIntent.id,
      intentVersion: effectiveIntent.version || 1,
      proposalId: effectiveSnapshot.proposalId,
      snapshotId: effectiveSnapshot.snapshotId,
      snapshotHash: effectiveSnapshotHash,
      userId,
      paypalMerchantId: effectiveSnapshot.paypalMerchantId,
      authorizedAmountMinor: BigInt(effectiveSnapshot.pricing.totalPriceMinor),
      minorUnitExponent: Number(effectiveSnapshot.pricing.minorUnitExponent ?? 2),
      currency: effectiveSnapshot.pricing.currency,
      nonce,
      canonicalJsonHash,
      signature,
      publicKey: publicKeyHex,
      keyId: env.ED25519_KEY_ID,
      authMode,
      status: 'PENDING',
      issuedAt: now,
      expiresAt: expiresAtDate
    };
    if (externalAuthorization) {
      authorizationRecordData.externalAuthorization = externalAuthorization;
    }
    await authorizationRepository.createAuthorization(authorizationRecordData);

    return {
      decision: 'PASS',
      riskScore,
      ruleEvaluations,
      authorization: {
        authorizationId,
        algorithm: 'Ed25519',
        canonicalJsonHash,
        publicKey: publicKeyHex,
        nonce,
        issuedAt: issuedAtStr,
        expiresAt: expiresAtStr,
        validitySeconds: Math.floor((expiresAtDate.getTime() - now.getTime()) / 1000),
        signature,
        externalProtocol: externalAuthorization?.protocol || null
      }
    };
  }
}

export const securityFirewallService = new SecurityFirewallService();
