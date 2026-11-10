import { AuthorizationRecord } from '../models/index.js';

/**
 * Custom Domain Errors for Authorization Nonce State Management
 */
export class AuthorizationNotFoundError extends Error {
  constructor(message = 'Authorization record not found') {
    super(message);
    this.name = 'AuthorizationNotFoundError';
    this.code = 'AUTHORIZATION_NOT_FOUND';
  }
}

export class DuplicateNonceError extends Error {
  constructor(message = 'Authorization nonce already exists') {
    super(message);
    this.name = 'DuplicateNonceError';
    this.code = 'DUPLICATE_NONCE';
  }
}

export class AuthorizationConflictError extends Error {
  constructor(message = 'Authorization nonce is currently locked in-flight by another operation') {
    super(message);
    this.name = 'AuthorizationConflictError';
    this.code = 'AUTHORIZATION_CONFLICT';
  }
}

export class AuthorizationAlreadyConsumedError extends Error {
  constructor(message = 'Authorization nonce has already been consumed') {
    super(message);
    this.name = 'AuthorizationAlreadyConsumedError';
    this.code = 'AUTHORIZATION_ALREADY_CONSUMED';
  }
}

export class AuthorizationExpiredError extends Error {
  constructor(message = 'Authorization validity window has expired') {
    super(message);
    this.name = 'AuthorizationExpiredError';
    this.code = 'AUTHORIZATION_EXPIRED';
  }
}

export class SnapshotMismatchError extends Error {
  constructor(message = 'Checkout snapshot hash does not match frozen authorization') {
    super(message);
    this.name = 'SnapshotMismatchError';
    this.code = 'SNAPSHOT_MISMATCH';
  }
}

export class AuthorizationUserMismatchError extends Error {
  constructor(message = 'Authorization belongs to a different user') {
    super(message);
    this.name = 'AuthorizationUserMismatchError';
    this.code = 'AUTHORIZATION_USER_MISMATCH';
  }
}

export class InvalidAuthorizationStateError extends Error {
  constructor(message = 'Invalid authorization state transition') {
    super(message);
    this.name = 'InvalidAuthorizationStateError';
    this.code = 'INVALID_AUTHORIZATION_STATE';
  }
}

/**
 * Repository for managing Ed25519 authorization records and atomic nonce lifecycle.
 *
 * CRITICAL INVARIANTS:
 * 1. State machine: PENDING -> IN_FLIGHT -> CONSUMED.
 * 2. Recovery states: RECOVERING, EXPIRED, REVOKED, FAILED_MANUAL_REVIEW.
 * 3. All state transitions execute via single atomic conditional MongoDB operations.
 * 4. Zero automatic TTL deletion. All forensic records preserved permanently.
 */
export class AuthorizationRepository {
  /**
   * Persists a new authorization record in PENDING state.
   *
   * @param {object} recordData
   * @returns {Promise<import('mongoose').Document>}
   */
  async createAuthorization(recordData) {
    try {
      const record = new AuthorizationRecord(recordData);
      return await record.save();
    } catch (err) {
      if (err.code === 11000) {
        throw new DuplicateNonceError(`Authorization nonce "${recordData.nonce}" already exists.`);
      }
      throw err;
    }
  }

  /**
   * Finds an authorization record by unique nonce.
   *
   * @param {string} nonce
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async findByNonce(nonce) {
    return AuthorizationRecord.findOne({ nonce });
  }

  /**
   * Finds an authorization record by idempotencyKey.
   *
   * @param {string} idempotencyKey
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async findByIdempotencyKey(idempotencyKey) {
    return AuthorizationRecord.findOne({ idempotencyKey });
  }

  /**
   * Finds an authorization record by authorizationId (or MongoDB _id).
   *
   * @param {string} authorizationId
   * @returns {Promise<import('mongoose').Document | null>}
   */
  async findByAuthorizationId(authorizationId) {
    if (!authorizationId) return null;
    return AuthorizationRecord.findOne({
      $or: [
        { _id: authorizationId.match(/^[0-9a-fA-F]{24}$/) ? authorizationId : null },
        { authorizationId }
      ]
    });
  }

  /**
   * Atomically claims an authorization nonce (PENDING -> IN_FLIGHT).
   *
   * Atomicity condition:
   * 1. Nonce matches.
   * 2. UserId matches.
   * 3. Status is exactly 'PENDING'.
   * 4. expiresAt > now (authorization has not expired).
   * 5. snapshotHash matches expected frozen snapshot hash.
   *
   * @param {{
   *   nonce: string,
   *   userId: string | import('mongoose').Types.ObjectId,
   *   idempotencyKey: string,
   *   expectedSnapshotHash: string,
   *   now?: Date
   * }} params
   * @returns {Promise<import('mongoose').Document>}
   */
  async claimNonce({ nonce, userId, idempotencyKey, expectedSnapshotHash, now = new Date() }) {
    if (!nonce || !userId || !idempotencyKey || !expectedSnapshotHash) {
      throw new TypeError('nonce, userId, idempotencyKey, and expectedSnapshotHash are required');
    }

    const updated = await AuthorizationRecord.findOneAndUpdate(
      {
        nonce,
        userId,
        status: 'PENDING',
        expiresAt: { $gt: now },
        snapshotHash: expectedSnapshotHash
      },
      {
        $set: {
          status: 'IN_FLIGHT',
          idempotencyKey,
          inFlightStartedAt: now
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (updated) {
      return updated;
    }

    // Atomic claim failed. Query existing state to provide precise, secure error semantics.
    const existing = await this.findByNonce(nonce);
    if (!existing) {
      throw new AuthorizationNotFoundError(`No authorization record found for nonce "${nonce}".`);
    }

    // Idempotent retry check: If already IN_FLIGHT for the identical idempotencyKey, return it safely.
    if (existing.status === 'IN_FLIGHT' && existing.idempotencyKey === idempotencyKey) {
      return existing;
    }

    if (existing.status === 'IN_FLIGHT') {
      throw new AuthorizationConflictError(
        'Authorization is currently IN_FLIGHT under a different idempotency key.'
      );
    }

    if (existing.status === 'CONSUMED') {
      throw new AuthorizationAlreadyConsumedError('Authorization nonce has already been consumed.');
    }

    if (existing.expiresAt <= now) {
      throw new AuthorizationExpiredError(
        `Authorization expired at ${existing.expiresAt.toISOString()}.`
      );
    }

    if (existing.snapshotHash !== expectedSnapshotHash) {
      throw new SnapshotMismatchError(
        'Provided snapshot hash does not match frozen authorization snapshot.'
      );
    }

    if (existing.userId.toString() !== userId.toString()) {
      throw new AuthorizationUserMismatchError(
        'Authorization record belongs to a different authenticated user.'
      );
    }

    throw new InvalidAuthorizationStateError(
      `Cannot claim authorization in state "${existing.status}".`
    );
  }

  /**
   * Atomically transitions an authorization from IN_FLIGHT to CONSUMED.
   *
   * @param {{
   *   nonce: string,
   *   idempotencyKey: string,
   *   now?: Date
   * }} params
   * @returns {Promise<import('mongoose').Document>}
   */
  async markConsumed({ nonce, idempotencyKey, now = new Date() }) {
    if (!nonce || !idempotencyKey) {
      throw new TypeError('nonce and idempotencyKey are required');
    }

    const updated = await AuthorizationRecord.findOneAndUpdate(
      {
        nonce,
        idempotencyKey,
        status: 'IN_FLIGHT'
      },
      {
        $set: {
          status: 'CONSUMED',
          consumedAt: now
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (updated) {
      return updated;
    }

    // Check if already consumed for idempotent reply
    const existing = await this.findByNonce(nonce);
    if (existing && existing.status === 'CONSUMED' && existing.idempotencyKey === idempotencyKey) {
      return existing;
    }

    throw new InvalidAuthorizationStateError(
      `Cannot transition authorization "${nonce}" to CONSUMED: record is not in IN_FLIGHT state with matching idempotency key.`
    );
  }

  /**
   * Transitions an authorization from IN_FLIGHT to RECOVERING during ambiguous failures.
   *
   * @param {{
   *   nonce: string,
   *   idempotencyKey: string,
   *   reason: string,
   *   now?: Date
   * }} params
   * @returns {Promise<import('mongoose').Document>}
   */
  async transitionToRecovering({ nonce, idempotencyKey, reason, now = new Date() }) {
    const updated = await AuthorizationRecord.findOneAndUpdate(
      {
        nonce,
        idempotencyKey,
        status: 'IN_FLIGHT'
      },
      {
        $set: {
          status: 'RECOVERING',
          'metadata.recoveryReason': reason,
          'metadata.recoveringAt': now
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      throw new InvalidAuthorizationStateError(
        `Cannot transition authorization "${nonce}" to RECOVERING: record is not in IN_FLIGHT state.`
      );
    }

    return updated;
  }

  /**
   * Quarantines an authorization to FAILED_MANUAL_REVIEW.
   * Preserves all audit trail and diagnostics permanently.
   *
   * @param {{
   *   nonce: string,
   *   reason: string,
   *   diagnostics?: object,
   *   now?: Date
   * }} params
   * @returns {Promise<import('mongoose').Document>}
   */
  async transitionToFailedManualReview({ nonce, reason, diagnostics = {}, now = new Date() }) {
    const updated = await AuthorizationRecord.findOneAndUpdate(
      {
        nonce,
        status: { $in: ['IN_FLIGHT', 'RECOVERING', 'PENDING'] }
      },
      {
        $set: {
          status: 'FAILED_MANUAL_REVIEW',
          'metadata.failureReason': reason,
          'metadata.diagnostics': diagnostics,
          'metadata.failedAt': now
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updated) {
      const existing = await this.findByNonce(nonce);
      if (!existing) {
        throw new AuthorizationNotFoundError(`No authorization record found for nonce "${nonce}".`);
      }
      throw new InvalidAuthorizationStateError(
        `Cannot quarantine authorization "${nonce}" in terminal state "${existing.status}".`
      );
    }

    return updated;
  }

  /**
   * Retrieves full authorization state for recovery and diagnostic reconciliation.
   *
   * @param {string} nonce
   * @returns {Promise<import('mongoose').Document>}
   */
  async getAuthorizationDiagnostics(nonce) {
    const record = await this.findByNonce(nonce);
    if (!record) {
      throw new AuthorizationNotFoundError(`No authorization record found for nonce "${nonce}".`);
    }
    return record;
  }
}

export const authorizationRepository = new AuthorizationRepository();
