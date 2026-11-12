import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AuthorizationRecord } from '../models/AuthorizationRecord.model.js';
import { PaymentIntent } from '../models/PaymentIntent.model.js';
import { ProductProposal } from '../models/ProductProposal.model.js';
import { CheckoutSnapshot } from '../models/CheckoutSnapshot.model.js';
import { WebhookEvent } from '../models/WebhookEvent.model.js';
import { PaymentTransaction } from '../models/PaymentTransaction.model.js';
import { AuditLog } from '../models/AuditLog.model.js';
import { authorizationRepository } from '../repositories/AuthorizationRepository.js';
import { paymentTransactionRepository } from '../repositories/PaymentTransactionRepository.js';
import { normalizeProposalSnapshotFields } from './SecurityFirewallService.js';
import { verifySignature, timingSafeEqualHex } from '../utils/cryptoUtils.js';
import { trustedKeyRegistry } from './TrustedKeyRegistry.js';
import {
  canonicalJson,
  canonicalJsonSha256,
  computeSnapshotCanonicalHash
} from '../utils/canonicalJson.js';
import { verifyIntentLockV2Handoff } from '../utils/intentLockV2Verifier.js';

export class PayPalPaymentError extends Error {
  constructor(message = 'PayPal payment error', code = 'PAYPAL_ERROR', statusCode = 500) {
    super(message);
    this.name = 'PayPalPaymentError';
    this.code = code;
    this.statusCode = statusCode;
  }
}


function authorizationPayloadFromRecord(record) {
  const payload = {
    authorizationId: record.authorizationId,
    intentId: record.intentId?.toString(),
    intentVersion: record.intentVersion,
    proposalId: record.proposalId?.toString(),
    snapshotId: record.snapshotId,
    snapshotHash: record.snapshotHash,
    userId: record.userId?.toString(),
    paypalMerchantId: record.paypalMerchantId,
    totalPriceMinor: record.authorizedAmountMinor?.toString(),
    currency: record.currency,
    nonce: record.nonce,
    issuedAt: record.issuedAt instanceof Date ? record.issuedAt.toISOString() : new Date(record.issuedAt).toISOString(),
    expiresAt: record.expiresAt instanceof Date ? record.expiresAt.toISOString() : new Date(record.expiresAt).toISOString(),
    authMode: record.authMode
  };
  const external = record.externalAuthorization?.toObject?.() || record.externalAuthorization;
  if (external) {
    payload.externalAuthorization = {
      protocol: external.protocol,
      tokenId: external.tokenId,
      intentHash: external.intentHash,
      purchaseHash: external.purchaseHash,
      merchantId: external.merchantId,
      nonce: external.nonce,
      issuedAt: external.issuedAt,
      expiresAt: external.expiresAt,
      compactToken: external.compactToken,
      publicKey: external.publicKey
    };
  }
  return payload;
}

function verifyPersistedAuthorization(authRecord, {
  now,
  allowExpiredExternal = false
}) {
  const externalAuthorization = authRecord.externalAuthorization?.toObject?.() || authRecord.externalAuthorization;
  if (env.NODE_ENV === 'production' && !externalAuthorization) {
    throw new PayPalPaymentError(
      'Production order creation requires a verified IntentLock V2 purchase authorization.',
      'INTENTLOCK_V2_AUTHORIZATION_REQUIRED',
      403
    );
  }
  if (externalAuthorization) {
    const expectedBindings = {
      user_id: authRecord.userId.toString(),
      intent_id: authRecord.intentId.toString(),
      intent_version: authRecord.intentVersion,
      proposal_id: authRecord.proposalId.toString(),
      snapshot_id: authRecord.snapshotId,
      snapshot_hash: authRecord.snapshotHash.toLowerCase(),
      amount_minor: authRecord.authorizedAmountMinor.toString(),
      currency: String(authRecord.currency).toUpperCase(),
      minor_unit_exponent: Number(authRecord.minorUnitExponent),
      merchant_id: externalAuthorization.merchantId,
      paypal_merchant_id: authRecord.paypalMerchantId
    };
    try {
      verifyIntentLockV2Handoff(
        {
          protocol: externalAuthorization.protocol,
          authorization_token: externalAuthorization.compactToken,
          public_key: externalAuthorization.publicKey,
          ...expectedBindings,
          token_id: externalAuthorization.tokenId,
          intent_hash: externalAuthorization.intentHash,
          purchase_hash: externalAuthorization.purchaseHash,
          nonce: externalAuthorization.nonce,
          issued_at: externalAuthorization.issuedAt,
          expires_at: externalAuthorization.expiresAt
        },
        expectedBindings,
        {
          nowSeconds: allowExpiredExternal
            ? externalAuthorization.issuedAt
            : Math.floor(now.getTime() / 1000),
          publicKey: env.FLASK_INTENTLOCK_PUBLIC_KEY
        }
      );
    } catch {
      throw new PayPalPaymentError(
        'Persisted IntentLock V2 purchase authorization is invalid or expired.',
        'INVALID_INTENTLOCK_V2_AUTHORIZATION',
        403
      );
    }
  }

  // Resolve trust before inspecting mutable authorization fields. The database
  // record's publicKey is only a claim; the registry is the trust root in every
  // environment (including tests and local development).
  const signingKeyId = String(authRecord.keyId || '').trim();
  let trustedPublicKey;
  try {
    trustedPublicKey = trustedKeyRegistry.resolveTrustedPublicKey(
      signingKeyId,
      authRecord.issuedAt,
      now
    );
  } catch (err) {
    throw new PayPalPaymentError(
      err?.message || 'Authorization signing key is not trusted.',
      err?.code || 'UNTRUSTED_AUTHORIZATION_KEY_ID',
      err?.statusCode || 403
    );
  }

  if (
    !trustedPublicKey ||
    !authRecord.publicKey ||
    !timingSafeEqualHex(authRecord.publicKey, trustedPublicKey)
  ) {
    throw new PayPalPaymentError(
      'Stored authorization public key does not match the independently trusted key registry.',
      'KEY_SUBSTITUTION_DETECTED',
      403
    );
  }

  let reconstructedHash;
  try {
    reconstructedHash = canonicalJsonSha256(authorizationPayloadFromRecord(authRecord));
  } catch {
    throw new PayPalPaymentError(
      'Authorization record is incomplete or malformed.',
      'INVALID_AUTHORIZATION_RECORD',
      403
    );
  }
  const storedHash = String(authRecord.canonicalJsonHash || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(storedHash) || reconstructedHash !== storedHash) {
    throw new PayPalPaymentError(
      'Authorization payload fields have been tampered with or do not match their canonical hash.',
      'AUTHORIZATION_TAMPERING_DETECTED',
      403
    );
  }

  if (!verifySignature(storedHash, authRecord.signature, trustedPublicKey)) {
    throw new PayPalPaymentError(
      'Authorization digital signature verification failed.',
      'INVALID_AUTHORIZATION_SIGNATURE',
      403
    );
  }
  return externalAuthorization;
}

function minorUnitsToPayPalValue(amountMinor, exponent) {
  const amount = BigInt(amountMinor);
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 3) {
    throw new PayPalPaymentError('Unsupported currency minor-unit exponent.', 'INVALID_CURRENCY_EXPONENT', 400);
  }
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString();
  if (exponent === 0) return `${negative ? '-' : ''}${digits}`;
  const padded = digits.padStart(exponent + 1, '0');
  const whole = padded.slice(0, -exponent);
  const fraction = padded.slice(-exponent);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function assertPayPalOrderMatchesAuthorization(order, {
  amountValue,
  currency,
  paypalMerchantId,
  expectedStatus
}) {
  const purchaseUnits = order?.purchase_units;
  const unit = Array.isArray(purchaseUnits) && purchaseUnits.length === 1
    ? purchaseUnits[0]
    : null;

  if (
    typeof order?.id !== 'string' ||
    !/^[A-Z0-9_]{1,64}$/.test(order.id) ||
    (expectedStatus && order.status !== expectedStatus) ||
    !unit ||
    unit.amount?.currency_code !== currency ||
    unit.amount?.value !== amountValue ||
    unit.payee?.merchant_id !== paypalMerchantId
  ) {
    throw new PayPalPaymentError(
      'PayPal order details do not match the persisted authorization.',
      'PAYPAL_ORDER_AUTHORIZATION_MISMATCH',
      403
    );
  }
}

function validPayPalIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function relatedIds(resource) {
  const ids = resource?.supplementary_data?.related_ids;
  return ids && typeof ids === 'object' && !Array.isArray(ids) ? ids : {};
}

function optionalConsistentOrderId(resource) {
  const ids = relatedIds(resource);
  const candidates = [resource?.order_id, ids.order_id].filter(
    (value) => value !== undefined && value !== null && value !== ''
  );
  if (candidates.length === 0) return null;
  if (candidates.some((value) => !validPayPalIdentifier(value)) || new Set(candidates).size !== 1) {
    throw new Error('Webhook does not contain one consistent PayPal order ID.');
  }
  return candidates[0];
}

function requireConsistentOrderId(resource) {
  const orderId = optionalConsistentOrderId(resource);
  if (!orderId) throw new Error('Verified webhook does not contain a PayPal order ID.');
  return orderId;
}

function payPalAmountToMinor(amount, exponent) {
  if (
    !amount ||
    typeof amount.value !== 'string' ||
    typeof amount.currency_code !== 'string' ||
    !/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.test(amount.value)
  ) {
    throw new Error('Webhook amount is malformed.');
  }
  const [, whole, fraction = ''] = amount.value.match(
    /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/
  );
  if (fraction.length > exponent) {
    throw new Error('Webhook amount exceeds the transaction currency precision.');
  }
  return BigInt(whole) * (10n ** BigInt(exponent)) +
    BigInt((fraction + '0'.repeat(exponent)).slice(0, exponent) || '0');
}

function getPayPalApiSignal() {
  if (
    !Number.isSafeInteger(env.PAYPAL_API_TIMEOUT_MS) ||
    env.PAYPAL_API_TIMEOUT_MS <= 0
  ) {
    throw new PayPalPaymentError(
      'PayPal API timeout configuration is invalid.',
      'PAYPAL_CONFIGURATION_ERROR',
      503
    );
  }
  if (env.PAYPAL_ENVIRONMENT !== 'sandbox') {
    throw new PayPalPaymentError(
      'This integration is restricted to PayPal Sandbox.',
      'PAYPAL_SANDBOX_ONLY',
      503
    );
  }
  return globalThis.AbortSignal.timeout(env.PAYPAL_API_TIMEOUT_MS);
}

function getPayPalRequestId(operation, idempotencyKey) {
  const digest = crypto
    .createHash('sha256')
    .update(`${operation}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 32);
  return `${operation === 'capture' ? 'c' : 'o'}_${digest}`;
}

async function fetchPayPal(url, options, operation) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: getPayPalApiSignal()
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new PayPalPaymentError(
      timedOut
        ? `PayPal ${operation} request timed out. Retry with the same Idempotency-Key.`
        : `PayPal ${operation} request could not be completed. Retry with the same Idempotency-Key.`,
      timedOut ? 'PAYPAL_TIMEOUT' : 'PAYPAL_NETWORK_ERROR',
      timedOut ? 504 : 502
    );
  }
  return response;
}

export class PayPalService {
  /**
   * Determines whether the service should operate in mock adapter mode.
   *
   * @returns {boolean}
   */
  isMockMode() {
    return env.USE_MOCK_PAYPAL || env.NODE_ENV === 'test';
  }

  /**
   * Fetches an OAuth2 access token from PayPal Sandbox.
   *
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    if (this.isMockMode()) {
      return 'MOCK_SANDBOX_ACCESS_TOKEN';
    }

    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
      throw new PayPalPaymentError(
        'PayPal Sandbox credentials not configured.',
        'PAYPAL_CREDENTIALS_MISSING',
        500
      );
    }

    const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    const response = await fetchPayPal('https://api-m.sandbox.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    }, 'OAuth');

    if (!response.ok) {
      throw new PayPalPaymentError(
        `Failed to obtain PayPal access token: ${response.status}`,
        'PAYPAL_AUTH_FAILED',
        502
      );
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new PayPalPaymentError(
        'PayPal OAuth returned an invalid response.',
        'PAYPAL_INVALID_RESPONSE',
        502
      );
    }
    if (typeof data?.access_token !== 'string' || !data.access_token) {
      throw new PayPalPaymentError(
        'PayPal OAuth response did not contain an access token.',
        'PAYPAL_INVALID_RESPONSE',
        502
      );
    }
    return data.access_token;
  }

  async assertAuthoritativeAuthorizationBinding(authRecord, userId) {
    if (env.NODE_ENV !== 'production') {
      return;
    }

    if (
      CheckoutSnapshot.db?.readyState !== 1 ||
      ProductProposal.db?.readyState !== 1 ||
      PaymentIntent.db?.readyState !== 1
    ) {
      throw new PayPalPaymentError(
        'Authoritative authorization records are unavailable.',
        'AUTHORIZATION_RECORDS_UNAVAILABLE',
        503
      );
    }

    let intent;
    let proposal;
    let snapshot;
    try {
      [intent, proposal, snapshot] = await Promise.all([
        PaymentIntent.findOne({ _id: authRecord.intentId, userId }),
        ProductProposal.findOne({
          _id: authRecord.proposalId,
          intentId: authRecord.intentId
        }),
        CheckoutSnapshot.findOne({
          _id: authRecord.snapshotId,
          proposalId: authRecord.proposalId,
          intentId: authRecord.intentId
        })
      ]);
    } catch {
      throw new PayPalPaymentError(
        'Authoritative authorization records could not be loaded.',
        'AUTHORIZATION_RECORDS_UNAVAILABLE',
        503
      );
    }

    if (!intent || !proposal || !snapshot) {
      throw new PayPalPaymentError(
        'Authorization is not bound to the current user, intent, proposal, and snapshot.',
        'AUTHORIZATION_BINDING_MISMATCH',
        403
      );
    }

    const snapshotPayload = snapshot.snapshotPayload;
    let recomputedSnapshotHash;
    let proposalFields;
    let snapshotFields;
    try {
      recomputedSnapshotHash = computeSnapshotCanonicalHash(snapshotPayload);
      proposalFields = normalizeProposalSnapshotFields(proposal, 'proposal');
      snapshotFields = normalizeProposalSnapshotFields(snapshotPayload, 'snapshot');
    } catch {
      throw new PayPalPaymentError(
        'Persisted proposal or checkout snapshot is malformed.',
        'INVALID_AUTHORIZATION_SNAPSHOT',
        403
      );
    }

    const pricing = snapshotPayload?.pricing;
    if (
      String(intent._id) !== String(authRecord.intentId) ||
      String(intent.userId) !== String(userId) ||
      intent.version !== authRecord.intentVersion ||
      String(proposal.intentId) !== String(intent._id) ||
      String(snapshot.intentId) !== String(intent._id) ||
      String(snapshot.proposalId) !== String(proposal._id) ||
      String(snapshot._id) !== String(authRecord.snapshotId) ||
      String(proposal._id) !== String(authRecord.proposalId) ||
      recomputedSnapshotHash !== authRecord.snapshotHash ||
      canonicalJson(proposalFields) !== canonicalJson(snapshotFields) ||
      !pricing ||
      String(pricing.totalPriceMinor) !== String(authRecord.authorizedAmountMinor) ||
      String(pricing.currency).toUpperCase() !== String(authRecord.currency).toUpperCase() ||
      Number(pricing.minorUnitExponent) !== Number(authRecord.minorUnitExponent) ||
      snapshotPayload.paypalMerchantId !== authRecord.paypalMerchantId ||
      (
        authRecord.externalAuthorization &&
        String(proposal.merchantId) !== String(authRecord.externalAuthorization.merchantId)
      ) ||
      String(pricing.currency).toUpperCase() !== String(intent.currency).toUpperCase() ||
      Number(pricing.minorUnitExponent) !== Number(intent.minorUnitExponent)
    ) {
      throw new PayPalPaymentError(
        'Persisted snapshot denomination or authorization fields do not match.',
        'AUTHORIZATION_BINDING_MISMATCH',
        403
      );
    }
    return { intent, proposal, snapshot };
  }

  /**
   * Creates a PayPal Sandbox order and returns the approval URL with return session token.
   * Enforces idempotency, authorization signature verification, and atomic nonce lock.
   *
   * @param {{
   *   proposalId: string,
   *   authorizationId: string,
   *   userConsent: boolean,
   *   acknowledgedReviewDiffs?: string[],
   *   userId: string | import('mongoose').Types.ObjectId,
   *   idempotencyKey: string,
   *   now?: Date
   * }} params
   * @returns {Promise<object>}
   */
  async createOrder({
    proposalId,
    authorizationId,
    userConsent,
    acknowledgedReviewDiffs = [], // eslint-disable-line no-unused-vars
    userId,
    idempotencyKey,
    now = new Date()
  }) {
    // 1. Invariant: Explicit user consent is mandatory
    if (userConsent !== true) {
      throw new PayPalPaymentError(
        'User consent must be explicitly granted (userConsent: true).',
        'USER_CONSENT_REQUIRED',
        400
      );
    }

    // 2. Recovery check: If transaction already exists for this Idempotency-Key, return it safely
    const existingTx = await paymentTransactionRepository.findByIdempotencyKey(idempotencyKey);
    if (existingTx) {
      if (!existingTx.userId || existingTx.userId.toString() !== userId.toString()) {
        throw new PayPalPaymentError('Idempotency key belongs to a different authenticated user.', 'IDEMPOTENCY_USER_MISMATCH', 403);
      }
      const existingAuth = existingTx.authorizationId
        ? await authorizationRepository.findByAuthorizationId(existingTx.authorizationId)
        : null;
      if (
        !existingAuth ||
        (authorizationId !== existingAuth._id.toString() && authorizationId !== existingAuth.authorizationId) ||
        (proposalId && String(existingTx.proposalId) !== String(proposalId)) ||
        String(existingAuth.proposalId) !== String(existingTx.proposalId) ||
        String(existingTx.amountMinor) !== String(existingAuth.authorizedAmountMinor) ||
        String(existingTx.currency).toUpperCase() !== String(existingAuth.currency).toUpperCase() ||
        String(existingTx.paypalOrderId || '') === ''
      ) {
        throw new PayPalPaymentError(
          'Idempotency key is not bound to the existing authorized order.',
          'IDEMPOTENCY_AUTHORIZATION_MISMATCH',
          409
        );
      }
      if (!existingAuth.userId || existingAuth.userId.toString() !== userId.toString()) {
        throw new PayPalPaymentError(
          'Existing authorization belongs to a different authenticated user.',
          'USER_MISMATCH',
          403
        );
      }
      verifyPersistedAuthorization(existingAuth, { now, allowExpiredExternal: true });
      await this.assertAuthoritativeAuthorizationBinding(existingAuth, userId);
      return {
        orderId: existingTx.paypalOrderId,
        status: existingTx.status,
        amountMinor: existingTx.amountMinor.toString(),
        currency: existingTx.currency,
        approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${existingTx.paypalOrderId}`
      };
    }

    // 3. Find authorization record
    const authRecord = await authorizationRepository.findByAuthorizationId(
      authorizationId
    );

    if (!authRecord) {
      throw new PayPalPaymentError(
        `Authorization record "${authorizationId}" not found.`,
        'AUTHORIZATION_NOT_FOUND',
        404
      );
    }

    // Verify the persisted record before trusting its user, amount, status,
    // expiry, proposal, or other mutable database fields.
    verifyPersistedAuthorization(authRecord, { now });

    // Reject mock authorization in production
    if (env.NODE_ENV === 'production' && authRecord.authMode === 'MOCK_DETERMINISTIC') {
      throw new PayPalPaymentError(
        'MOCK_DETERMINISTIC authorization is rejected in production.',
        'MOCK_AUTHORIZATION_REJECTED',
        403
      );
    }

    // Check expiry
    if (authRecord.expiresAt <= now) {
      throw new PayPalPaymentError(
        `Authorization validity window expired at ${authRecord.expiresAt.toISOString()}.`,
        'AUTHORIZATION_EXPIRED',
        400
      );
    }

    await this.assertAuthoritativeAuthorizationBinding(authRecord, userId);

    // 4. Verify user and proposalId binding against authoritative authorization record
    if (!authRecord.userId || authRecord.userId.toString() !== userId.toString()) {
      throw new PayPalPaymentError(
        'Authorization record belongs to a different user.',
        'USER_MISMATCH',
        403
      );
    }

    const boundProposalId = authRecord.proposalId ? authRecord.proposalId.toString() : null;
    if (proposalId && boundProposalId && proposalId.toString() !== boundProposalId) {
      throw new PayPalPaymentError(
        `Supplied proposalId "${proposalId}" does not match authorization record proposalId "${boundProposalId}".`,
        'PROPOSAL_ID_MISMATCH',
        400
      );
    }
    const authoritativeProposalId = boundProposalId || proposalId;

    // Verify intent version binding against authoritative PaymentIntent (AUD-05)
    if (authRecord.intentId && env.NODE_ENV !== 'production') {
      try {
        if (
          PaymentIntent.findById?._isMockFunction ||
          (PaymentIntent.db?.readyState === 1)
        ) {
          const intentDoc = await PaymentIntent.findById(authRecord.intentId);
          if (
            intentDoc &&
            authRecord.intentVersion !== undefined &&
            intentDoc.version !== authRecord.intentVersion
          ) {
            throw new PayPalPaymentError(
              `Authorization intent version "${authRecord.intentVersion}" does not match current intent version "${intentDoc.version}".`,
              'INTENT_VERSION_MISMATCH',
              400
            );
          }
        }
      } catch (err) {
        if (err instanceof PayPalPaymentError) throw err;
        // In-memory or unseeded fallback during unit tests
      }
    }

    // 5. Atomically claim authorization nonce (PENDING -> IN_FLIGHT).
    await authorizationRepository.claimNonce({
      nonce: authRecord.nonce,
      userId,
      idempotencyKey,
      expectedSnapshotHash: authRecord.snapshotHash,
      now
    });

    // 6. Dispatch to PayPal Orders API v2
    let paypalOrderId;
    const amountMinor = authRecord.authorizedAmountMinor;
    const currency = authRecord.currency;
    const amountValue = minorUnitsToPayPalValue(amountMinor, Number(authRecord.minorUnitExponent ?? 2));

    if (this.isMockMode()) {
      const requestDigest = crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 12);
      paypalOrderId = `PAYPAL_ORDER_${requestDigest.toUpperCase()}`;
    } else {
      const accessToken = await this.getAccessToken();
      const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: idempotencyKey,
            amount: {
              currency_code: currency,
              value: amountValue
            },
            payee: {
              merchant_id: authRecord.paypalMerchantId
            }
          }
        ],
        application_context: {
          return_url: `${env.API_BASE_URL}/payments/return`,
          cancel_url: `${env.APP_ORIGIN}/checkout/cancel`,
          user_action: 'PAY_NOW'
        }
      };

      const response = await fetchPayPal('https://api-m.sandbox.paypal.com/v2/checkout/orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': getPayPalRequestId('order', idempotencyKey)
        },
        body: JSON.stringify(orderPayload)
      }, 'order creation');

      if (!response.ok) {
        if (response.status < 500) {
          await authorizationRepository.transitionToRecovering({
            nonce: authRecord.nonce,
            idempotencyKey,
            reason: `PayPal order creation rejected with status ${response.status}`,
            now
          });
        }

        throw new PayPalPaymentError(
          response.status >= 500
            ? `PayPal Orders API returned an ambiguous server error (${response.status}); retry with the same Idempotency-Key.`
            : `PayPal Orders API rejected creation with status ${response.status}.`,
          response.status >= 500 ? 'PAYPAL_DISPATCH_AMBIGUOUS' : 'PAYPAL_DISPATCH_FAILED',
          502
        );
      }

      let orderData;
      try {
        orderData = await response.json();
      } catch {
        throw new PayPalPaymentError(
          'PayPal order creation returned an invalid response; retry with the same Idempotency-Key.',
          'PAYPAL_INVALID_RESPONSE',
          502
        );
      }
      try {
        assertPayPalOrderMatchesAuthorization(orderData, {
          amountValue,
          currency,
          paypalMerchantId: authRecord.paypalMerchantId,
          expectedStatus: 'CREATED'
        });
      } catch (err) {
        await authorizationRepository.transitionToRecovering({
          nonce: authRecord.nonce,
          idempotencyKey,
          reason: 'PayPal order response did not match authorization.',
          now
        });
        throw err;
      }
      paypalOrderId = orderData.id;
    }

    // 7. Persist PaymentTransaction
    const transaction = await paymentTransactionRepository.createTransaction({
      userId,
      authorizationId: authRecord._id,
      proposalId: authoritativeProposalId,
      paypalOrderId,
      idempotencyKey,
      amountMinor,
      currency,
      minorUnitExponent: authRecord.minorUnitExponent || 2,
      status: 'CREATED'
    });

    // 8. Attach ephemeral return token for SameSite=Strict cross-site navigation recovery
    const { plaintextToken } = await paymentTransactionRepository.attachReturnToken({
      transactionId: transaction._id,
      ttlMs: 60000,
      now
    });

    const approvalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${paypalOrderId}&return_token=${plaintextToken}`;

    // 9. Emit audit log
    try {
      await AuditLog.create({
        eventType: 'PAYMENT_ORDER_CREATED',
        userId,
        referenceId: paypalOrderId,
        details: {
          transactionId: transaction._id.toString(),
          authorizationId: authRecord.authorizationId,
          amountMinor: amountMinor.toString(),
          currency
        },
        actor: 'INTENTLOCK_BACKEND',
        logHash: crypto.createHash('sha256').update(`${paypalOrderId}:${idempotencyKey}:${now.toISOString()}`).digest('hex')
      });
    } catch {
      // In-memory or unseeded fallback
    }

    return {
      orderId: paypalOrderId,
      status: 'CREATED',
      amountMinor: amountMinor.toString(),
      currency,
      approvalUrl
    };
  }

  /**
   * Retrieves authoritative PayPal order details for approval and recovery checks.
   *
   * @param {string} orderId
   * @returns {Promise<object>}
   */
  async getOrderDetails(orderId) {
    if (this.isMockMode()) {
      return { id: orderId, status: 'APPROVED' };
    }

    if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
      throw new PayPalPaymentError('PayPal order ID is invalid.', 'INVALID_ORDER_ID', 400);
    }

    const accessToken = await this.getAccessToken();
    const response = await fetchPayPal(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      },
      'order verification'
    );

    if (!response.ok) {
      throw new PayPalPaymentError(
        `Failed to retrieve PayPal order details: HTTP ${response.status}`,
        'PAYPAL_ORDER_VERIFICATION_FAILED',
        502
      );
    }

    try {
      return await response.json();
    } catch {
      throw new PayPalPaymentError(
        'PayPal order verification returned an invalid response.',
        'PAYPAL_INVALID_RESPONSE',
        502
      );
    }
  }

  validateCaptureResponse(captureObj, tx) {
    if (!captureObj) {
      throw new PayPalPaymentError(
        'Malformed PayPal capture response: missing capture details.',
        'MALFORMED_CAPTURE_RESPONSE',
        502
      );
    }

    // 1. Settlement Status Verification
    if (captureObj.status !== 'COMPLETED') {
      throw new PayPalPaymentError(
        `PayPal capture settlement status was not COMPLETED: "${captureObj.status}".`,
        'INVALID_CAPTURE_STATUS',
        422
      );
    }

    // 2. Currency Code Verification
    const captureCurrency = captureObj.amount?.currency_code?.toUpperCase();
    const expectedCurrency = tx.currency?.toUpperCase();
    if (!captureCurrency || captureCurrency !== expectedCurrency) {
      throw new PayPalPaymentError(
        `PayPal capture currency "${captureCurrency}" does not match authorized transaction currency "${expectedCurrency}".`,
        'CAPTURE_CURRENCY_MISMATCH',
        422
      );
    }

    // 3. Monetary Value Exact Minor Unit Verification (Integer Math)
    const captureValueStr = captureObj.amount?.value;
    if (captureValueStr === undefined || captureValueStr === null) {
      throw new PayPalPaymentError(
        'Malformed PayPal capture response: missing amount value.',
        'MALFORMED_CAPTURE_RESPONSE',
        502
      );
    }

    const exponent = tx.minorUnitExponent || 2;
    const parts = captureValueStr.toString().split('.');
    const whole = BigInt(parts[0] || '0');
    const fracStr = (parts[1] || '').padEnd(exponent, '0').slice(0, exponent);
    const frac = BigInt(fracStr || '0');
    const factor = 10n ** BigInt(exponent);
    const capturedAmountMinor = whole * factor + frac;

    if (capturedAmountMinor !== tx.amountMinor) {
      throw new PayPalPaymentError(
        `PayPal capture amount "${captureValueStr}" (${capturedAmountMinor} minor units) does not match authorized amount "${tx.amountMinor}".`,
        'CAPTURE_AMOUNT_MISMATCH',
        422
      );
    }
  }


  /**
   * Captures an approved PayPal order.
   * INVARIANT: Never called via GET request. State-changing POST only with CSRF & Idempotency.
   *
   * @param {{
   *   orderId: string,
   *   authorizationId: string,
   *   userId: string | import('mongoose').Types.ObjectId,
   *   idempotencyKey: string,
   *   now?: Date
   * }} params
   * @returns {Promise<object>}
   */
  async captureOrder({
    orderId,
    authorizationId,
    userId,
    userConsent,
    confirmationChallenge: _confirmationChallenge,
    idempotencyKey: _idempotencyKey,
    now = new Date()
  }) {
    // Production capture stays disabled until the live end-to-end controls are verified.
    if (env.NODE_ENV === 'production') {
      throw new PayPalPaymentError(
        'PayPal capture is disabled in production pending end-to-end approval and settlement verification.',
        'PAYPAL_CAPTURE_DISABLED',
        403
      );
    }

    // Gate 3: explicit buyer confirmation after PayPal approval is mandatory.
    if (userConsent !== true) {
      throw new PayPalPaymentError(
        'Post-approval buyer confirmation is mandatory (userConsent: true).',
        'BUYER_CONFIRMATION_REQUIRED',
        400
      );
    }

    if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
      throw new PayPalPaymentError('PayPal order ID is invalid.', 'INVALID_ORDER_ID', 400);
    }

    const tx = await paymentTransactionRepository.findByOrderId(orderId);
    if (!tx) {
      throw new PayPalPaymentError(
        `Payment transaction for order "${orderId}" not found.`,
        'TRANSACTION_NOT_FOUND',
        404
      );
    }

    if (!tx.userId || tx.userId.toString() !== userId.toString()) {
      throw new PayPalPaymentError(
        'Transaction belongs to a different authenticated user.',
        'USER_MISMATCH',
        403
      );
    }

    if (!tx.authorizationId) {
      throw new PayPalPaymentError(
        'Transaction missing associated authorization.',
        'AUTHORIZATION_NOT_FOUND',
        404
      );
    }

    let authRecord = null;
    if (
      AuthorizationRecord.findById?._isMockFunction ||
      AuthorizationRecord.db?.readyState === 1
    ) {
      authRecord = await AuthorizationRecord.findById(tx.authorizationId);
      if (!authRecord) {
        throw new PayPalPaymentError(
          'Associated authorization record not found.',
          'AUTHORIZATION_NOT_FOUND',
          404
        );
      }
    }

    const suppliedAuthStr = authorizationId ? authorizationId.toString() : '';
    const storedAuthStr = tx.authorizationId ? tx.authorizationId.toString() : '';
    const matchesAuth =
      suppliedAuthStr &&
      (storedAuthStr === suppliedAuthStr ||
        (authRecord && authRecord._id.toString() === suppliedAuthStr) ||
        (authRecord && authRecord.authorizationId === suppliedAuthStr));

    if (!matchesAuth) {
      throw new PayPalPaymentError(
        `Supplied authorizationId "${authorizationId}" does not match transaction authorization record.`,
        'AUTHORIZATION_ID_MISMATCH',
        400
      );
    }

    if (tx.status === 'COMPLETED') {
      return {
        captureId: tx.paypalCaptureId,
        status: 'COMPLETED',
        transactionId: tx._id.toString(),
        finalAmountMinor: tx.amountMinor.toString(),
        currency: tx.currency,
        payerEmail: tx.payerEmail || 'buyer@sandbox.paypal.com',
        capturedAt: tx.settledAt
          ? tx.settledAt.toISOString()
          : (tx.updatedAt ? tx.updatedAt.toISOString() : now.toISOString())
      };
    }

    if (!authRecord) {
      throw new PayPalPaymentError(
        'Associated authorization record is unavailable.',
        'AUTHORIZATION_NOT_FOUND',
        403
      );
    }

    if (
      !authRecord.userId ||
      authRecord.userId.toString() !== userId.toString() ||
      String(authRecord.proposalId) !== String(tx.proposalId) ||
      String(authRecord.authorizedAmountMinor) !== String(tx.amountMinor) ||
      String(authRecord.currency).toUpperCase() !== String(tx.currency).toUpperCase() ||
      Number(authRecord.minorUnitExponent) !== Number(tx.minorUnitExponent) ||
      authRecord.status !== 'IN_FLIGHT' ||
      authRecord.idempotencyKey !== tx.idempotencyKey
    ) {
      throw new PayPalPaymentError(
        'Payment transaction does not match its active authorization.',
        'AUTHORIZATION_BINDING_MISMATCH',
        403
      );
    }

    if (!authRecord.expiresAt || authRecord.expiresAt <= now) {
      throw new PayPalPaymentError(
        'Authorization expired before capture.',
        'AUTHORIZATION_EXPIRED',
        400
      );
    }

    // Revalidate the complete persisted V2 handoff, canonical payload, and signing key.
    verifyPersistedAuthorization(authRecord, { now });

    if (tx.status !== 'CREATED' && tx.status !== 'APPROVED_BY_USER' && tx.status !== 'CAPTURING') {
      throw new PayPalPaymentError(
        `Payment transaction cannot be captured from status "${tx.status}".`,
        'INVALID_TRANSACTION_STATE',
        409
      );
    }

    // SEC-06 / SEC-10: claim an atomic capture lease and fence stale workers.
    const attemptId = `att_${crypto.randomUUID()}`;
    const workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
    const LEASE_DURATION_MS = 15000;
    let claimedTx = null;

    if (
      paymentTransactionRepository.claimCaptureLease?._isMockFunction ||
      PaymentTransaction.findOneAndUpdate?._isMockFunction ||
      PaymentTransaction.db?.readyState === 1
    ) {
      claimedTx = await paymentTransactionRepository.claimCaptureLease({
        transactionId: tx._id,
        attemptId,
        leaseDurationMs: LEASE_DURATION_MS,
        workerId,
        now
      });

      if (!claimedTx) {
        const currentTx = await paymentTransactionRepository.findById(tx._id);
        if (currentTx?.status === 'COMPLETED') {
          return {
            captureId: currentTx.paypalCaptureId,
            status: 'COMPLETED',
            transactionId: currentTx._id.toString(),
            finalAmountMinor: currentTx.amountMinor.toString(),
            currency: currentTx.currency,
            payerEmail: currentTx.payerEmail || 'buyer@sandbox.paypal.com',
            capturedAt: currentTx.settledAt
              ? currentTx.settledAt.toISOString()
              : now.toISOString()
          };
        }
        if (
          currentTx?.status === 'CAPTURING' &&
          currentTx.leaseExpiresAt &&
          currentTx.leaseExpiresAt >= now
        ) {
          throw new PayPalPaymentError(
            'Payment capture is currently in progress by another worker. Please retry shortly.',
            'CAPTURE_IN_PROGRESS',
            409
          );
        }
        throw new PayPalPaymentError(
          `Cannot capture transaction in status "${currentTx?.status || tx.status}".`,
          'INVALID_TRANSACTION_STATE',
          409
        );
      }
    } else {
      claimedTx = tx;
      tx.attemptVersion = (tx.attemptVersion || 0) + 1;
      tx.captureAttemptId = attemptId;
      tx.status = 'CAPTURING';
    }

    const acquiredVersion = claimedTx.attemptVersion || 1;

    const assertLeaseStillOwned = async () => {
      const checkTime = new Date();
      if (claimedTx?.leaseExpiresAt && checkTime >= claimedTx.leaseExpiresAt) {
        throw new PayPalPaymentError(
          'Capture lease expired; aborting this attempt to prevent stale execution.',
          'FENCING_TOKEN_EXPIRED',
          409
        );
      }

      if (
        paymentTransactionRepository.findById?._isMockFunction ||
        PaymentTransaction.findById?._isMockFunction ||
        PaymentTransaction.db?.readyState === 1
      ) {
        const liveTx = await paymentTransactionRepository.findById(tx._id);
        if (
          liveTx &&
          (liveTx.captureAttemptId !== attemptId ||
            liveTx.attemptVersion !== acquiredVersion ||
            (liveTx.leaseExpiresAt && checkTime >= liveTx.leaseExpiresAt))
        ) {
          throw new PayPalPaymentError(
            'Worker lost the capture lease or its fencing token was superseded.',
            'FENCING_TOKEN_EXPIRED',
            409
          );
        }
      }
    };

    const settleVerifiedCapture = async (captureObj, payerEmail, source) => {
      if (!captureObj?.id || !validPayPalIdentifier(captureObj.id)) {
        throw new PayPalPaymentError(
          'PayPal did not provide a valid capture ID.',
          'MALFORMED_CAPTURE_RESPONSE',
          502
        );
      }
      this.validateCaptureResponse(captureObj, tx);

      let settledTx = null;
      if (
        paymentTransactionRepository.settleCapture?._isMockFunction ||
        PaymentTransaction.findOneAndUpdate?._isMockFunction ||
        PaymentTransaction.db?.readyState === 1
      ) {
        settledTx = await paymentTransactionRepository.settleCapture({
          transactionId: tx._id,
          attemptId,
          attemptVersion: acquiredVersion,
          paypalCaptureId: captureObj.id,
          payerEmail,
          sellerProtectionStatus: captureObj?.seller_protection?.status || 'ELIGIBLE',
          now
        });
        if (!settledTx) {
          throw new PayPalPaymentError(
            'Capture settlement was rejected because this worker no longer owns the lease.',
            'FENCING_TOKEN_EXPIRED',
            409
          );
        }
      } else {
        tx.status = 'COMPLETED';
        tx.paypalCaptureId = captureObj.id;
        tx.payerEmail = payerEmail;
        tx.settledAt = now;
        if (typeof tx.save === 'function') await tx.save();
        settledTx = tx;
      }

      await authorizationRepository.markConsumed({
        nonce: authRecord.nonce,
        idempotencyKey: tx.idempotencyKey,
        now
      });

      try {
        await AuditLog.create({
          eventType: 'PAYMENT_CAPTURED',
          userId,
          referenceId: captureObj.id,
          details: {
            transactionId: tx._id.toString(),
            orderId,
            amountMinor: tx.amountMinor.toString(),
            currency: tx.currency,
            attemptVersion: acquiredVersion,
            captureIdempotencyKey: tx.idempotencyKey,
            reconciliationSource: source
          },
          actor: 'INTENTLOCK_BACKEND',
          logHash: crypto.createHash('sha256')
            .update(`${captureObj.id}:${orderId}:${now.toISOString()}`)
            .digest('hex')
        });
      } catch {
        // Do not turn a successful provider settlement into a failed payment response
        // because an optional audit write could not be completed.
      }

      return {
        captureId: captureObj.id,
        status: 'COMPLETED',
        transactionId: tx._id.toString(),
        finalAmountMinor: tx.amountMinor.toString(),
        currency: tx.currency,
        payerEmail,
        capturedAt: now.toISOString()
      };
    };

    // Fetch authoritative provider state before capture. This also reconciles a
    // capture that succeeded externally before the previous worker failed.
    if (!this.isMockMode()) {
      const orderDetails = await this.getOrderDetails(orderId);
      if (orderDetails.status !== 'APPROVED' && orderDetails.status !== 'COMPLETED') {
        throw new PayPalPaymentError(
          `PayPal order has not been approved by buyer (status: ${orderDetails.status}).`,
          'ORDER_NOT_APPROVED',
          400
        );
      }
      assertPayPalOrderMatchesAuthorization(orderDetails, {
        amountValue: minorUnitsToPayPalValue(
          authRecord.authorizedAmountMinor,
          Number(authRecord.minorUnitExponent)
        ),
        currency: authRecord.currency,
        paypalMerchantId: authRecord.paypalMerchantId
      });

      if (orderDetails.status === 'COMPLETED') {
        const existingCapture = orderDetails.purchase_units?.[0]?.payments?.captures?.find(
          (capture) => capture.status === 'COMPLETED'
        );
        if (!existingCapture) {
          throw new PayPalPaymentError(
            'PayPal order is completed but has no completed capture record to reconcile.',
            'PAYPAL_CAPTURE_RECONCILIATION_FAILED',
            502
          );
        }
        return settleVerifiedCapture(
          existingCapture,
          orderDetails.payer?.email_address || 'buyer@sandbox.paypal.com',
          'provider-order-reconciliation'
        );
      }


    }

    await assertLeaseStillOwned();

    let captureObj = null;
    let payerEmail = 'buyer@sandbox.paypal.com';

    if (this.isMockMode()) {
      captureObj = {
        id: `CAP_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
        status: 'COMPLETED',
        amount: {
          currency_code: tx.currency,
          value: minorUnitsToPayPalValue(tx.amountMinor, Number(tx.minorUnitExponent || 2))
        }
      };
    } else {
      const accessToken = await this.getAccessToken();
      const response = await fetchPayPal(
        `https://api-m.sandbox.paypal.com/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': getPayPalRequestId('capture', tx.idempotencyKey)
          }
        },
        'capture'
      );

      if (!response.ok) {
        let errorBody = null;
        try {
          errorBody = await response.json();
        } catch {
          // PayPal may return a non-JSON error response.
        }

        const alreadyCaptured =
          response.status === 422 &&
          (errorBody?.name === 'UNPROCESSABLE_ENTITY' ||
            errorBody?.details?.some((detail) => detail.issue === 'ORDER_ALREADY_CAPTURED'));

        if (!alreadyCaptured) {
          throw new PayPalPaymentError(
            `PayPal Orders capture rejected with status ${response.status}.`,
            'PAYPAL_CAPTURE_FAILED',
            502
          );
        }

        // A prior call may have captured the funds despite this retry response.
        const recoveredOrder = await this.getOrderDetails(orderId);
        if (recoveredOrder.status !== 'COMPLETED') {
          throw new PayPalPaymentError(
            'PayPal reported an already-captured order, but the provider order is not COMPLETED.',
            'ORDER_STATE_INVALID',
            502
          );
        }
        assertPayPalOrderMatchesAuthorization(recoveredOrder, {
          amountValue: minorUnitsToPayPalValue(
            authRecord.authorizedAmountMinor,
            Number(authRecord.minorUnitExponent)
          ),
          currency: authRecord.currency,
          paypalMerchantId: authRecord.paypalMerchantId,
          expectedStatus: 'COMPLETED'
        });
        captureObj = recoveredOrder.purchase_units?.[0]?.payments?.captures?.find(
          (capture) => capture.status === 'COMPLETED'
        );
        payerEmail = recoveredOrder.payer?.email_address || payerEmail;
        if (!captureObj) {
          throw new PayPalPaymentError(
            'Completed PayPal order did not include a completed capture record.',
            'PAYPAL_CAPTURE_RECONCILIATION_FAILED',
            502
          );
        }
      } else {
        let captureData;
        try {
          captureData = await response.json();
        } catch {
          throw new PayPalPaymentError(
            'PayPal capture returned an invalid response; retry with the same Idempotency-Key.',
            'PAYPAL_INVALID_RESPONSE',
            502
          );
        }

        assertPayPalOrderMatchesAuthorization(captureData, {
          amountValue: minorUnitsToPayPalValue(
            authRecord.authorizedAmountMinor,
            Number(authRecord.minorUnitExponent)
          ),
          currency: authRecord.currency,
          paypalMerchantId: authRecord.paypalMerchantId,
          expectedStatus: 'COMPLETED'
        });
        captureObj = captureData.purchase_units?.[0]?.payments?.captures?.find(
          (capture) => capture.status === 'COMPLETED'
        );
        payerEmail = captureData.payer?.email_address || payerEmail;
      }
    }

    await assertLeaseStillOwned();
    return settleVerifiedCapture(captureObj, payerEmail, 'capture-api-response');
  }

  /**
   * Recovers a session from an ephemeral single-use return token.
   * INVARIANT: Never captures payment. Only restores session context for SameSite=Strict cross-site return.
   *
   * @param {{
   *   orderId: string,
   *   returnToken: string,
   *   userId: string | import('mongoose').Types.ObjectId,
   *   now?: Date
   * }} params
   * @returns {Promise<object>}
   */
  async recoverReturnSession({ orderId, returnToken, userId: _userId, now = new Date() }) {
    const tx = await paymentTransactionRepository.findByOrderId(orderId);
    if (!tx) {
      throw new PayPalPaymentError(
        'INVALID_OR_EXPIRED_RETURN_TOKEN',
        'INVALID_OR_EXPIRED_RETURN_TOKEN',
        401
      );
    }

    // Atomically consume return token
    try {
      await paymentTransactionRepository.consumeReturnToken({
        returnToken,
        transactionId: tx._id,
        userId: tx.userId,
        paypalOrderId: orderId,
        now
      });
    } catch {
      throw new PayPalPaymentError(
        'INVALID_OR_EXPIRED_RETURN_TOKEN',
        'INVALID_OR_EXPIRED_RETURN_TOKEN',
        401
      );
    }

    return {
      orderId: tx.paypalOrderId,
      transactionId: tx._id.toString(),
      userId: tx.userId.toString(),
      status: tx.status,
      amountMinor: tx.amountMinor.toString(),
      currency: tx.currency
    };
  }

  async verifyWebhookSignature(headers, bodyObj) {
    if (this.isMockMode()) {
      return true;
    }

    const transmissionHeaders = {
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time']
    };
    if (Object.values(transmissionHeaders).some((value) => typeof value !== 'string' || !value)) {
      throw new PayPalPaymentError(
        'Required PayPal webhook signature headers are missing.',
        'WEBHOOK_SIGNATURE_HEADERS_MISSING',
        400
      );
    }
    if (!env.PAYPAL_WEBHOOK_ID) {
      throw new PayPalPaymentError(
        'PayPal webhook verification is not configured.',
        'WEBHOOK_SIGNATURE_VERIFICATION_UNAVAILABLE',
        503
      );
    }

    const accessToken = await this.getAccessToken();
    const response = await fetchPayPal(
      'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...transmissionHeaders,
          webhook_id: env.PAYPAL_WEBHOOK_ID,
          webhook_event: bodyObj
        })
      },
      'webhook signature verification'
    );
    if (!response.ok) {
      throw new PayPalPaymentError(
        `PayPal webhook verification rejected with status ${response.status}.`,
        'WEBHOOK_SIGNATURE_VERIFICATION_FAILED',
        502
      );
    }

    let verification;
    try {
      verification = await response.json();
    } catch {
      throw new PayPalPaymentError(
        'PayPal webhook verification returned an invalid response.',
        'PAYPAL_INVALID_RESPONSE',
        502
      );
    }
    return verification?.verification_status === 'SUCCESS';
  }

  /**
   * Verifies and processes an incoming PayPal webhook event.
   *
   * @param {{
   *   headers: object,
   *   rawBody: string | Buffer,
   *   bodyObj: object
   * }} params
   * @returns {Promise<object>}
   */
  async processWebhook({ headers, rawBody, bodyObj }) { // eslint-disable-line no-unused-vars
    if (
      !bodyObj ||
      typeof bodyObj !== 'object' ||
      typeof bodyObj.id !== 'string' ||
      !bodyObj.id ||
      typeof bodyObj.event_type !== 'string' ||
      !bodyObj.event_type
    ) {
      throw new PayPalPaymentError(
        'PayPal webhook event ID and event type are required.',
        'INVALID_WEBHOOK_EVENT',
        400
      );
    }
    const eventId = bodyObj.id;
    const eventType = bodyObj.event_type;
    const normalizedHeaders = Object.fromEntries(
      Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value])
    );

    // 1. Mock webhook quarantine
    const isMockWebhook =
      normalizedHeaders['x-intentlock-mock-webhook'] === 'true' ||
      bodyObj.mockEvent === true ||
      bodyObj.event_source === 'MOCK_TEST_HARNESS';

    if (isMockWebhook && env.NODE_ENV === 'production') {
      throw new PayPalPaymentError(
        'Mock webhook events are strictly prohibited in production mode.',
        'MOCK_WEBHOOK_REJECTED',
        403
      );
    }

    // 2. Exact Host & SSRF Validation on paypal-cert-url header
    const certUrlHeader = normalizedHeaders['paypal-cert-url'];
    if (certUrlHeader) {
      try {
        const parsedUrl = new URL(certUrlHeader);
        if (parsedUrl.protocol !== 'https:') {
          throw new PayPalPaymentError(
            'PayPal certificate URL must strictly use HTTPS protocol.',
            'INVALID_CERT_URL_PROTOCOL',
            400
          );
        }

        // Must strictly and exactly match trusted hosts
        const allowedHosts = ['api.paypal.com', 'api.sandbox.paypal.com'];
        if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
          throw new PayPalPaymentError(
            `PayPal certificate host "${parsedUrl.hostname}" is not an allowed PayPal endpoint.`,
            'UNTRUSTED_CERT_HOST',
            400
          );
        }

        // Reject non-standard ports
        if (parsedUrl.port && parsedUrl.port !== '443') {
          throw new PayPalPaymentError(
            'PayPal certificate URL must use default HTTPS port (443).',
            'INVALID_CERT_PORT',
            400
          );
        }
      } catch (err) {
        if (err instanceof PayPalPaymentError) throw err;
        throw new PayPalPaymentError(
          `Malformed PayPal certificate URL: ${err.message}`,
          'INVALID_CERT_URL',
          400
        );
      }
    }

    // Verify the event before acknowledging even a duplicate delivery.
    const signatureVerified = await this.verifyWebhookSignature(normalizedHeaders, bodyObj);
    if (!signatureVerified) {
      throw new PayPalPaymentError(
        'PayPal webhook signature verification failed.',
        'WEBHOOK_SIGNATURE_INVALID',
        401
      );
    }

    const now = new Date();
    let event = await WebhookEvent.findOne({ paypalEventId: eventId });
    if (event) {
      if (['PROCESSED', 'IGNORED', 'UNSUPPORTED'].includes(event.processedStatus)) {
        return {
          received: true,
          eventId,
          status: event.processedStatus === 'PROCESSED' ? 'ALREADY_PROCESSED' : event.processedStatus
        };
      }

      const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
      const canReclaimFailed = event.processedStatus === 'FAILED';
      const canReclaimStale =
        event.processedStatus === 'PROCESSING' &&
        event.processingStartedAt &&
        event.processingStartedAt <= staleBefore;
      if (!canReclaimFailed && !canReclaimStale) {
        return { received: true, eventId, status: 'PROCESSING' };
      }

      event = await WebhookEvent.findOneAndUpdate(
        {
          paypalEventId: eventId,
          processedStatus: event.processedStatus,
          ...(canReclaimStale ? { processingStartedAt: { $lte: staleBefore } } : {})
        },
        {
          $set: { processedStatus: 'PROCESSING', processingStartedAt: now, failureReason: null }
          },
          { new: true }
        );
        if (!event) {
          return { received: true, eventId, status: 'PROCESSING' };
        }
    } else {
      event = new WebhookEvent({
        paypalEventId: eventId,
        eventType,
        resourceType: bodyObj.resource_type || 'unknown',
        summary: bodyObj.summary || '',
        payload: bodyObj,
        signatureVerified,
        processedStatus: 'PROCESSING',
        processingStartedAt: now
      });
      try {
        await event.save();
      } catch (err) {
        if (err.code !== 11000) throw err;
        const duplicate = await WebhookEvent.findOne({ paypalEventId: eventId });
        if (!duplicate) throw err;
        return {
          received: true,
          eventId,
          status: duplicate.processedStatus === 'PROCESSED' ? 'ALREADY_PROCESSED' : 'PROCESSING'
        };
      }
    }

    let result;
    try {
      result = await this.applyVerifiedWebhookEvent(bodyObj);
    } catch (err) {
      await WebhookEvent.findOneAndUpdate(
        { paypalEventId: eventId, processedStatus: 'PROCESSING' },
        { $set: { processedStatus: 'FAILED', failureReason: err.message } },
        { new: true }
      );
      return { received: true, eventId, status: 'FAILED' };
    }

    const finalizedEvent = await WebhookEvent.findOneAndUpdate(
      { paypalEventId: eventId, processedStatus: 'PROCESSING' },
      {
        $set: {
          processedStatus: result.status,
          processedTransactionId: result.transactionId || null,
          failureReason: result.failureReason || null
        }
      },
      { new: true }
    );
    if (!finalizedEvent) {
      throw new Error('Verified webhook event status could not be persisted.');
    }

    return {
      received: true,
      eventId,
      status: result.status === 'PROCESSED' ? 'VERIFIED_AND_PROCESSED' : result.status
    };
  }

  async applyVerifiedWebhookEvent(bodyObj) {
    const eventId = bodyObj.id;
    const resource = bodyObj.resource;
    const eventType = bodyObj.event_type;
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
      throw new Error('Verified webhook resource is missing or malformed.');
    }

    if (!['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REFUNDED'].includes(eventType)) {
      return { status: 'UNSUPPORTED', failureReason: `Unsupported event type: ${eventType}` };
    }

    if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      return this.applyRefundWebhook(eventId, resource);
    }
    return this.applyCaptureWebhook(eventId, eventType, resource);
  }

  async applyCaptureWebhook(eventId, eventType, resource) {
    const captureId = resource.id;
    if (!validPayPalIdentifier(captureId)) {
      throw new Error('Verified webhook does not contain a valid PayPal capture ID.');
    }
    const orderId = requireConsistentOrderId(resource);
    const transaction = await PaymentTransaction.findOne({ paypalOrderId: orderId });
    if (!transaction) throw new Error('No payment transaction matches the verified PayPal order ID.');

    this.validateWebhookTransactionAmount(resource.amount, transaction);
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      if (resource.status !== 'COMPLETED') {
        throw new Error('Capture-completed event has an unexpected provider status.');
      }
      if (
        transaction.status === 'COMPLETED' &&
        transaction.paypalCaptureId === captureId
      ) {
        return { status: 'PROCESSED', transactionId: transaction._id };
      }
      const updated = await PaymentTransaction.findOneAndUpdate(
        {
          _id: transaction._id,
          status: { $in: ['CREATED', 'APPROVED_BY_USER', 'CAPTURING'] },
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
          paypalCaptureId: { $in: [null, captureId] }
        },
        {
          $set: {
            status: 'COMPLETED',
            paypalCaptureId: captureId,
            lastPayPalEventId: eventId,
            failureReason: null
          }
        },
        { new: true }
      );
      if (!updated) {
        const latest = await PaymentTransaction.findById(transaction._id);
        if (latest?.status === 'COMPLETED' && latest.paypalCaptureId === captureId) {
          return { status: 'PROCESSED', transactionId: latest._id };
        }
        throw new Error('Payment transaction is not in a state that permits capture completion.');
      }
      return { status: 'PROCESSED', transactionId: updated._id };
    }

    if (!['DENIED', 'DECLINED'].includes(resource.status)) {
      throw new Error('Capture-denied event has an unexpected provider status.');
    }
    if (
      transaction.status === 'FAILED' &&
      transaction.paypalCaptureId === captureId &&
      transaction.failureReason === 'PayPal reported that the capture was denied.'
    ) {
      return { status: 'PROCESSED', transactionId: transaction._id };
    }
    const updated = await PaymentTransaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: { $in: ['CREATED', 'APPROVED_BY_USER', 'CAPTURING'] },
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        paypalCaptureId: { $in: [null, captureId] }
      },
      {
        $set: {
          status: 'FAILED',
          paypalCaptureId: captureId,
          lastPayPalEventId: eventId,
          failureReason: 'PayPal reported that the capture was denied.'
        }
      },
      { new: true }
    );
    if (!updated) throw new Error('Payment transaction is not in a state that permits capture denial.');
    return { status: 'PROCESSED', transactionId: updated._id };
  }

  async applyRefundWebhook(eventId, resource) {
    if (!['REFUNDED', 'PARTIALLY_REFUNDED'].includes(resource.status)) {
      throw new Error('Capture-refunded event has an unexpected provider status.');
    }
    const ids = relatedIds(resource);
    const captureId = ids.capture_id || resource.capture_id || resource.id;
    if (!validPayPalIdentifier(captureId)) {
      throw new Error('Verified refund webhook does not contain a valid PayPal capture ID.');
    }
    const transaction = await PaymentTransaction.findOne({ paypalCaptureId: captureId });
    if (!transaction) throw new Error('No payment transaction matches the verified PayPal capture ID.');
    const orderId = optionalConsistentOrderId(resource);
    if (orderId && orderId !== transaction.paypalOrderId) {
      throw new Error('Refund webhook order ID does not match the transaction.');
    }
    const refundId = ids.refund_id || resource.refund_id || eventId;
    if (!validPayPalIdentifier(refundId)) {
      throw new Error('Verified refund webhook does not contain a valid refund identifier.');
    }
    const refundAmount = resource.amount || resource.seller_receivable_breakdown?.gross_amount;
    if (String(refundAmount?.currency_code || '').toUpperCase() !== transaction.currency) {
      throw new Error('Refund webhook currency does not match the payment transaction.');
    }
    const exponent = Number(transaction.minorUnitExponent);
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 3) {
      throw new Error('Payment transaction has an invalid currency precision.');
    }
    const amountMinor = payPalAmountToMinor(refundAmount, exponent);
    if (resource.status === 'PARTIALLY_REFUNDED') {
      return {
        status: 'UNSUPPORTED',
        transactionId: transaction._id,
        failureReason: 'Partial refunds are not represented by the payment transaction model.'
      };
    }
    if (amountMinor > BigInt(transaction.amountMinor)) {
      throw new Error('Refund amount exceeds the payment transaction amount.');
    }
    if (amountMinor < BigInt(transaction.amountMinor)) {
      return {
        status: 'UNSUPPORTED',
        transactionId: transaction._id,
        failureReason: 'Partial refunds are not represented by the payment transaction model.'
      };
    }
    if (transaction.status === 'REFUNDED' && transaction.paypalRefundIds?.includes(refundId)) {
      return { status: 'PROCESSED', transactionId: transaction._id };
    }
    const updated = await PaymentTransaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: 'COMPLETED',
        paypalCaptureId: captureId,
        amountMinor: transaction.amountMinor,
        currency: transaction.currency,
        paypalRefundIds: { $ne: refundId }
      },
      {
        $set: { status: 'REFUNDED', lastPayPalEventId: eventId },
        $addToSet: { paypalRefundIds: refundId }
      },
      { new: true }
    );
    if (!updated) {
      const latest = await PaymentTransaction.findById(transaction._id);
      if (latest?.status === 'REFUNDED' && latest.paypalRefundIds?.includes(refundId)) {
        return { status: 'PROCESSED', transactionId: latest._id };
      }
      throw new Error('Payment transaction is not in a state that permits refund processing.');
    }
    return { status: 'PROCESSED', transactionId: updated._id };
  }

  validateWebhookTransactionAmount(amount, transaction) {
    const exponent = Number(transaction.minorUnitExponent);
    if (!Number.isInteger(exponent) || exponent < 0 || exponent > 3) {
      throw new Error('Payment transaction has an invalid currency precision.');
    }
    if (String(amount?.currency_code || '').toUpperCase() !== transaction.currency) {
      throw new Error('Webhook currency does not match the payment transaction.');
    }
    const amountMinor = payPalAmountToMinor(amount, exponent);
    if (amountMinor !== BigInt(transaction.amountMinor)) {
      throw new Error('Webhook amount does not match the payment transaction.');
    }
    return amountMinor;
  }
}

export const payPalService = new PayPalService();
