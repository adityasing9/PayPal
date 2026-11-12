
import mongoose from 'mongoose';

const { Schema } = mongoose;

const ExternalAuthorizationSchema = new Schema(
  {
    protocol: {
      type: String,
      enum: ['INTENTLOCK_V2_ED25519'],
      required: true
    },
    tokenId: { type: String, required: true },
    intentHash: { type: String, required: true },
    purchaseHash: { type: String, required: true },
    merchantId: { type: String, required: true },
    nonce: { type: String, required: true },
    issuedAt: { type: Number, required: true },
    expiresAt: { type: Number, required: true },
    compactToken: { type: String, required: true },
    publicKey: { type: String, required: true }
  },
  {
    _id: false,
    strict: true
  }
);

/**
 * AuthorizationRecord Schema.
 *
 * CRITICAL FINANCIAL & AUDIT INVARIANTS:
 * 1. Zero automatic TTL deletion. Authorization evidence must be
 *    preserved permanently.
 * 2. Nonce state machine: PENDING -> IN_FLIGHT -> CONSUMED.
 * 3. Unique nonce index prevents replay at database level.
 * 4. A unique partial idempotency index prevents duplicate
 *    authorization records for the same idempotency key.
 */
export const AuthorizationRecordSchema = new Schema(
  {
    authorizationId: {
      type: String,
      required: [true, 'Authorization ID is required'],
      unique: true,
      index: true
    },

    proposalId: {
      type: Schema.Types.ObjectId,
      ref: 'ProductProposal',
      required: [true, 'Proposal ID is required']
    },

    intentId: {
      type: Schema.Types.ObjectId,
      ref: 'PaymentIntent',
      required: [true, 'Intent ID is required']
    },

    intentVersion: {
      type: Number,
      required: [true, 'Intent version is required'],
      default: 1
    },

    snapshotId: {
      type: Schema.Types.ObjectId,
      ref: 'CheckoutSnapshot',
      required: [true, 'Snapshot ID is required']
    },

    snapshotHash: {
      type: String,
      required: [true, 'Snapshot hash is required']
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },

    // PayPal merchant binding
    paypalMerchantId: {
      type: String,
      required: [true, 'PayPal merchant ID is required'],
      index: true
    },

    algorithm: {
      type: String,
      default: 'Ed25519',
      required: true
    },

    publicKey: {
      type: String,
      required: [true, 'Public key is required']
    },

    keyId: {
      type: String,
      default: 'FIREWALL_KEY_PRIMARY',
      required: true
    },

    nonce: {
      type: String,
      required: [true, 'Cryptographic nonce is required'],
      unique: true
    },

    canonicalJsonHash: {
      type: String,
      required: [true, 'Canonical JSON hash is required']
    },

    authorizedAmountMinor: {
      type: Schema.Types.BigInt,
      required: [true, 'Authorized minor units required'],
      validate: {
        validator: (value) =>
          value === undefined || value === null || value >= 0n,
        message: 'Authorized amount must be non-negative'
      },
      alias: 'totalPriceMinor'
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      default: 'USD'
    },

    minorUnitExponent: {
      type: Number,
      default: 2,
      required: true
    },

    signature: {
      type: String,
      required: [true, 'Ed25519 signature is required']
    },

    externalAuthorization: {
      type: ExternalAuthorizationSchema,
      default: undefined
    },

    authMode: {
      type: String,
      enum: ['LIVE_FIREWALL', 'MOCK_DETERMINISTIC'],
      default: 'LIVE_FIREWALL',
      required: true
    },

    status: {
      type: String,
      enum: [
        'PENDING',
        'IN_FLIGHT',
        'CONSUMED',
        'RECOVERING',
        'EXPIRED',
        'REVOKED',
        'FAILED_MANUAL_REVIEW'
      ],
      default: 'PENDING',
      required: true
    },

    idempotencyKey: {
      type: String,
      default: null
    },

    inFlightStartedAt: {
      type: Date,
      default: null
    },

    issuedAt: {
      type: Date,
      required: [true, 'Authorization issue timestamp is required']
    },

    expiresAt: {
      type: Date,
      required: [true, 'Authorization expiry timestamp is required']
    },

    consumedAt: {
      type: Date,
      default: null
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    collection: 'authorization_records',
    strict: true
  }
);

// Unique authorization ID and nonce indexes are declared
// directly on their respective schema fields above.

// PayPal merchant lookup index is also declared on its field.

// Unique partial idempotency index:
// null or missing keys are excluded from the unique constraint.
AuthorizationRecordSchema.index(
  { idempotencyKey: 1 },
  {
    name: 'uniq_authorization_idempotency_key',
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: 'string' }
    }
  }
);

// Status query index.
AuthorizationRecordSchema.index({ status: 1 });

// Standard expiry lookup index. NEVER configure this as a TTL index.
AuthorizationRecordSchema.index({ expiresAt: 1 });

// Prevent duplicate external authorization nonces.
AuthorizationRecordSchema.index(
  { 'externalAuthorization.nonce': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'externalAuthorization.nonce': { $type: 'string' }
    }
  }
);

export const AuthorizationRecord =
  mongoose.models.AuthorizationRecord ||
  mongoose.model('AuthorizationRecord', AuthorizationRecordSchema);
