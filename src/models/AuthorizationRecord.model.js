import mongoose from 'mongoose';

const { Schema } = mongoose;
const ExternalAuthorizationSchema = new Schema(
  {
    protocol: { type: String, enum: ['INTENTLOCK_V2_ED25519'], required: true },
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
  { _id: false, strict: true }
);

/**
 * AuthorizationRecord Schema.
 *
 * CRITICAL FINANCIAL & AUDIT INVARIANTS:
 * 1. Zero automatic TTL deletion: NEVER configure { expireAfterSeconds }.
 *    Forensic authorization evidence and recovery records (IN_FLIGHT, RECOVERING, FAILED_MANUAL_REVIEW)
 *    must be preserved permanently.
 * 2. Nonce state machine: PENDING -> IN_FLIGHT -> CONSUMED.
 * 3. Unique index on nonce ensures replay protection at database engine level.
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
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },
    snapshotId: {
      type: String,
      required: [true, 'Snapshot ID is required']
    },
    snapshotHash: {
      type: String,
      required: [true, 'Snapshot hash is required']
    },
    paypalMerchantId: {
      type: String,
      required: [true, 'PayPal merchant ID is required']
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
      min: [0n, 'Authorized amount must be non-negative']
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
      required: [true, 'Authorization expiry timestamp is required'],
      index: true // Standard query index ONLY - NEVER TTL
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

// Indexes: Note that expiresAt is a standard B-tree index, NOT a TTL index.
AuthorizationRecordSchema.index({ authorizationId: 1 }, { unique: true });
AuthorizationRecordSchema.index({ nonce: 1 }, { unique: true });
AuthorizationRecordSchema.index(
  { idempotencyKey: 1 },
  {
    name: 'uniq_authorization_idempotency_key',
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);
AuthorizationRecordSchema.index({ status: 1 });
AuthorizationRecordSchema.index({ expiresAt: 1 });
AuthorizationRecordSchema.index(
  { 'externalAuthorization.nonce': 1 },
  {
    unique: true,
    partialFilterExpression: { 'externalAuthorization.nonce': { $type: 'string' } }
  }
);

export const AuthorizationRecord =
  mongoose.models.AuthorizationRecord ||
  mongoose.model('AuthorizationRecord', AuthorizationRecordSchema);
