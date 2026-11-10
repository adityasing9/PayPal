import { PaymentTransaction } from '../models/index.js';
import { generateReturnToken, hashReturnToken } from '../utils/cryptoUtils.js';

/**
 * Custom Domain Errors for Payment Transactions and Return Tokens
 */
export class InvalidReturnTokenError extends Error {
  constructor(message = 'INVALID_OR_EXPIRED_RETURN_TOKEN', statusCode = 401) {
    super(message);
    this.name = 'InvalidReturnTokenError';
    this.code = 'INVALID_OR_EXPIRED_RETURN_TOKEN';
    this.statusCode = statusCode;
  }
}

export class DuplicateTransactionError extends Error {
  constructor(message = 'Payment transaction with this order ID or idempotency key already exists') {
    super(message);
    this.name = 'DuplicateTransactionError';
    this.code = 'DUPLICATE_TRANSACTION';
  }
}

export class TransactionNotFoundError extends Error {
  constructor(message = 'Payment transaction not found') {
    super(message);
    this.name = 'TransactionNotFoundError';
    this.code = 'TRANSACTION_NOT_FOUND';
  }
}

/**
 * Repository for managing payment transactions and single-use return token session recovery.
 *
 * CRITICAL INVARIANTS:
 * 1. Return token plaintext is NEVER stored in the database; only SHA-256 hash is persisted.
 * 2. Atomic 5-field conditional query prevents replay and concurrent consumption races.
 * 3. Generic 401 INVALID_OR_EXPIRED_RETURN_TOKEN prevents token enumeration attacks.
 * 4. Return tokens are strictly isolated: ZERO payment-capture or authorization capability.
 */
export class PaymentTransactionRepository {
  /**
   * Creates a new payment transaction record.
   *
   * @param {object} transactionData
   * @returns {Promise<import('mongoose').Document>}
   */
  async createTransaction(transactionData) {
    try {
      const transaction = new PaymentTransaction(transactionData);
      return await transaction.save();
    } catch (err) {
      if (err.code === 11000) {
        throw new DuplicateTransactionError(
          'Transaction with this paypalOrderId, idempotencyKey, or authorizationId already exists.'
        );
      }
      throw err;
    }
  }

  /**
   * Finds a transaction by its MongoDB ObjectId.
   *
   * @param {string | import('mongoose').Types.ObjectId} id
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async findById(id) {
    return PaymentTransaction.findById(id);
  }

  /**
   * Finds a transaction by PayPal Order ID.
   *
   * @param {string} paypalOrderId
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async findByOrderId(paypalOrderId) {
    return PaymentTransaction.findOne({ paypalOrderId });
  }

  /**
   * Finds a transaction by client Idempotency-Key.
   *
   * @param {string} idempotencyKey
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async findByIdempotencyKey(idempotencyKey) {
    return PaymentTransaction.findOne({ idempotencyKey });
  }

  /**
   * Finds a transaction by AuthorizationRecord ID.
   *
   * @param {string | import('mongoose').Types.ObjectId} authorizationId
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async findByAuthorizationId(authorizationId) {
    return PaymentTransaction.findOne({ authorizationId });
  }

  /**
   * Atomically claims or reclaims an exclusive capture lease on a transaction (SEC-06 & SEC-10).
   * Monotonically increments attemptVersion as a fencing token.
   *
   * @param {{
   *   transactionId: string | import('mongoose').Types.ObjectId,
   *   attemptId: string,
   *   leaseDurationMs?: number,
   *   workerId?: string,
   *   now?: Date
   * }} params
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async claimCaptureLease({
    transactionId,
    attemptId,
    leaseDurationMs = 15000,
    workerId = 'worker',
    now = new Date()
  }) {
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    return PaymentTransaction.findOneAndUpdate(
      {
        _id: transactionId,
        $or: [
          { status: { $in: ['CREATED', 'APPROVED_BY_USER'] } },
          { status: 'CAPTURING', leaseExpiresAt: { $lt: now } } // Reclaim expired lease
        ]
      },
      {
        $set: {
          status: 'CAPTURING',
          captureAttemptId: attemptId,
          leaseOwner: workerId,
          leaseExpiresAt,
          capturingStartedAt: now
        },
        $inc: { attemptVersion: 1 } // Monotonic fencing token
      },
      {
        new: true,
        runValidators: true
      }
    );
  }

  /**
   * Atomically settles capture verifying the monotonic fencing token (SEC-10).
   * Stale workers with superseded attemptVersion cannot overwrite newer state.
   *
   * @param {{
   *   transactionId: string | import('mongoose').Types.ObjectId,
   *   attemptId: string,
   *   attemptVersion: number,
   *   paypalCaptureId: string,
   *   payerEmail?: string,
   *   sellerProtectionStatus?: string,
   *   now?: Date
   * }} params
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async settleCapture({
    transactionId,
    attemptId,
    attemptVersion,
    paypalCaptureId,
    payerEmail = 'buyer@sandbox.paypal.com',
    sellerProtectionStatus = 'ELIGIBLE',
    now = new Date()
  }) {
    return PaymentTransaction.findOneAndUpdate(
      {
        _id: transactionId,
        captureAttemptId: attemptId,
        attemptVersion, // Fencing token verification
        status: 'CAPTURING'
      },
      {
        $set: {
          status: 'COMPLETED',
          paypalCaptureId,
          payerEmail,
          sellerProtectionStatus,
          settledAt: now
        }
      },
      {
        new: true,
        runValidators: true
      }
    );
  }

  /**
   * Generates and attaches an ephemeral single-use return token to a transaction.
   * Persists ONLY the SHA-256 hash in the database with a 60-second default TTL.
   *
   * @param {{
   *   transactionId: string | import('mongoose').Types.ObjectId,
   *   ttlMs?: number,
   *   now?: Date
   * }} params
   * @returns {Promise<{ plaintextToken: string, expiresAt: Date }>}
   */
  async attachReturnToken({ transactionId, ttlMs = 60000, now = new Date() }) {
    const plaintextToken = generateReturnToken();
    const tokenHash = hashReturnToken(plaintextToken);
    const expiresAt = new Date(now.getTime() + ttlMs);

    const updated = await PaymentTransaction.findByIdAndUpdate(
      transactionId,
      {
        $set: {
          returnSessionToken: {
            tokenHash,
            expiresAt,
            consumed: false,
            consumedAt: null
          }
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      throw new TransactionNotFoundError(`Transaction "${transactionId}" not found.`);
    }

    // Return the plaintext token ONLY here; never stored in DB or logged
    return {
      plaintextToken,
      expiresAt
    };
  }

  /**
   * Atomically consumes a single-use return token for SameSite=Strict cross-site navigation session recovery.
   *
   * ATOMIC 5-FIELD QUERY:
   * 1. _id === transactionId
   * 2. userId === expectedUserId
   * 3. paypalOrderId === expectedPaypalOrderId
   * 4. 'returnSessionToken.tokenHash' === hash(returnToken)
   * 5. 'returnSessionToken.consumed' === false
   * 6. 'returnSessionToken.expiresAt' > now
   *
   * @param {{
   *   returnToken: string,
   *   transactionId: string | import('mongoose').Types.ObjectId,
   *   userId: string | import('mongoose').Types.ObjectId,
   *   paypalOrderId: string,
   *   now?: Date
   * }} params
   * @returns {Promise<import('mongoose').Document>}
   * @throws {InvalidReturnTokenError} If token is invalid, mismatched, already consumed, or expired.
   */
  async consumeReturnToken({ returnToken, transactionId, userId, paypalOrderId, now = new Date() }) {
    if (!returnToken || !transactionId || !userId || !paypalOrderId) {
      throw new InvalidReturnTokenError('INVALID_OR_EXPIRED_RETURN_TOKEN');
    }

    const tokenHash = hashReturnToken(returnToken);

    const transaction = await PaymentTransaction.findOneAndUpdate(
      {
        _id: transactionId,
        userId,
        paypalOrderId,
        'returnSessionToken.tokenHash': tokenHash,
        'returnSessionToken.consumed': false,
        'returnSessionToken.expiresAt': { $gt: now }
      },
      {
        $set: {
          'returnSessionToken.consumed': true,
          'returnSessionToken.consumedAt': now
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!transaction) {
      // Generic privacy-preserving failure response (prevents enumeration)
      throw new InvalidReturnTokenError('INVALID_OR_EXPIRED_RETURN_TOKEN');
    }

    return transaction;
  }

  /**
   * Updates transaction status.
   *
   * @param {{
   *   transactionId: string | import('mongoose').Types.ObjectId,
   *   status: string,
   *   paypalCaptureId?: string,
   *   failureReason?: string
   * }} params
   * @returns {Promise<import('mongoose').Document>}
   */
  async updateStatus({ transactionId, status, paypalCaptureId, failureReason }) {
    const update = { status };
    if (paypalCaptureId) update.paypalCaptureId = paypalCaptureId;
    if (failureReason) update.failureReason = failureReason;

    const transaction = await PaymentTransaction.findByIdAndUpdate(
      transactionId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!transaction) {
      throw new TransactionNotFoundError(`Transaction "${transactionId}" not found.`);
    }

    return transaction;
  }
}

export const paymentTransactionRepository = new PaymentTransactionRepository();
