import { env } from '../config/env.js';

/**
 * Custom Error for TrustedKeyRegistry operations.
 */
export class TrustedKeyError extends Error {
  constructor(message = 'Trusted key error', code = 'TRUSTED_KEY_ERROR', statusCode = 403) {
    super(message);
    this.name = 'TrustedKeyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Independent In-Memory Trusted Ed25519 Public Key Registry (SEC-09).
 *
 * CRITICAL SECURITY INVARIANT:
 * The public key retrieved from a mutable database record must NEVER be treated
 * as the root of cryptographic trust. Verification must resolve public keys
 * exclusively from this tamper-proof registry loaded from trusted configuration.
 */
export class TrustedKeyRegistry {
  constructor(config = env) {
    this._activeKeyId = (config.ED25519_KEY_ID || 'FIREWALL_KEY_PRIMARY').trim();
    this._keys = new Map();
    this._loadInitialKeys(config);
  }

  /**
   * Initializes key registry from environment configuration.
   *
   * @param {object} config
   */
  _loadInitialKeys(config = env) {
    const activeKeyId = (config.ED25519_KEY_ID || 'FIREWALL_KEY_PRIMARY').trim();
    this._activeKeyId = activeKeyId;

    // 1. Primary Active Public Key from Environment
    if (config.ED25519_PUBLIC_KEY) {
      this.registerKey({
        keyId: activeKeyId,
        publicKeyHex: config.ED25519_PUBLIC_KEY,
        status: 'ACTIVE',
        activatedAt: new Date()
      });
    }

    // 2. Retired / Rotated / Revoked Keys from Environment
    if (config.ED25519_RETIRED_KEYS) {
      try {
        const raw = typeof config.ED25519_RETIRED_KEYS === 'string'
          ? JSON.parse(config.ED25519_RETIRED_KEYS)
          : config.ED25519_RETIRED_KEYS;

        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (item && item.keyId && item.publicKeyHex) {
              this.registerKey({
                keyId: item.keyId,
                publicKeyHex: item.publicKeyHex,
                status: item.revoked || item.status === 'REVOKED' ? 'REVOKED' : 'RETIRED',
                retiredAt: item.retiredAt ? new Date(item.retiredAt) : new Date(),
                revokedAt: item.revokedAt ? new Date(item.revokedAt) : null,
                gracePeriodMs: item.gracePeriodMs || 300000
              });
            }
          }
        } else if (raw && typeof raw === 'object') {
          for (const [keyId, item] of Object.entries(raw)) {
            if (item && item.publicKeyHex) {
              this.registerKey({
                keyId,
                publicKeyHex: item.publicKeyHex,
                status: item.revoked || item.status === 'REVOKED' ? 'REVOKED' : 'RETIRED',
                retiredAt: item.retiredAt ? new Date(item.retiredAt) : new Date(),
                revokedAt: item.revokedAt ? new Date(item.revokedAt) : null,
                gracePeriodMs: item.gracePeriodMs || 300000
              });
            }
          }
        }
      } catch (err) {
        throw new Error(`Failed to parse ED25519_RETIRED_KEYS: ${err.message}`);
      }
    }
  }

  /**
   * Registers or updates a trusted public key in the registry.
   *
   * @param {{
   *   keyId: string,
   *   publicKeyHex: string,
   *   status?: 'ACTIVE' | 'RETIRED' | 'REVOKED',
   *   activatedAt?: Date,
   *   retiredAt?: Date,
   *   revokedAt?: Date,
   *   gracePeriodMs?: number
   * }} params
   */
  registerKey({
    keyId,
    publicKeyHex,
    status = 'ACTIVE',
    activatedAt = new Date(),
    retiredAt = null,
    revokedAt = null,
    gracePeriodMs = 300000
  }) {
    if (!keyId || typeof keyId !== 'string' || keyId.trim().length === 0) {
      throw new TypeError('Invalid keyId: non-empty string required');
    }
    if (!publicKeyHex || typeof publicKeyHex !== 'string') {
      throw new TypeError('Invalid publicKeyHex: non-empty hex string required');
    }

    const cleanKeyId = keyId.trim();
    const cleanPubHex = publicKeyHex.toLowerCase().trim();

    this._keys.set(cleanKeyId, {
      keyId: cleanKeyId,
      publicKeyHex: cleanPubHex,
      status,
      activatedAt: activatedAt instanceof Date ? activatedAt : new Date(activatedAt),
      retiredAt: retiredAt ? (retiredAt instanceof Date ? retiredAt : new Date(retiredAt)) : null,
      revokedAt: revokedAt ? (revokedAt instanceof Date ? revokedAt : new Date(revokedAt)) : null,
      gracePeriodMs
    });
  }

  /**
   * Retires an active key with a grace period for in-flight authorizations.
   *
   * @param {string} keyId
   * @param {Date} [retiredAt=new Date()]
   * @param {number} [gracePeriodMs=300000] Default 5 minutes (300 seconds)
   */
  retireKey(keyId, retiredAt = new Date(), gracePeriodMs = 300000) {
    const entry = this._keys.get(keyId);
    if (!entry) {
      throw new TrustedKeyError(`Cannot retire unknown key ID: "${keyId}".`, 'UNKNOWN_SIGNING_KEY', 404);
    }
    entry.status = 'RETIRED';
    entry.retiredAt = retiredAt instanceof Date ? retiredAt : new Date(retiredAt);
    entry.gracePeriodMs = gracePeriodMs;
  }

  /**
   * Revokes a key immediately. Revoked keys are rejected unconditionally.
   *
   * @param {string} keyId
   * @param {string} [reason='Administrative revocation']
   */
  revokeKey(keyId, reason = 'Administrative revocation') {
    const entry = this._keys.get(keyId);
    if (!entry) {
      throw new TrustedKeyError(`Cannot revoke unknown key ID: "${keyId}".`, 'UNKNOWN_SIGNING_KEY', 404);
    }
    entry.status = 'REVOKED';
    entry.revokedAt = new Date();
    entry.revocationReason = reason;
  }

  /**
   * Resolves an independently trusted Ed25519 public key.
   *
   * Security rules:
   * 1. Key must exist in registry; unknown keyId throws 403 UNKNOWN_SIGNING_KEY.
   * 2. Revoked key throws 403 REVOKED_SIGNING_KEY unconditionally.
   * 3. Retired key checks grace period: throws 403 EXPIRED_SIGNING_KEY if grace period exceeded.
   * 4. Retired key rejects authorizations issued after key retirement date.
   *
   * @param {string} keyId
   * @param {Date|string} [authorizationIssuedAt=new Date()]
   * @param {Date} [now=new Date()]
   * @returns {string} 64-character lowercase Ed25519 public key hex string
   */
  resolveTrustedPublicKey(keyId, authorizationIssuedAt = new Date(), now = new Date()) {
    if (!keyId || typeof keyId !== 'string' || keyId.trim().length === 0) {
      throw new TrustedKeyError('Signing key ID is required.', 'INVALID_KEY_ID', 400);
    }

    const cleanKeyId = keyId.trim();
    const entry = this._keys.get(cleanKeyId);

    if (!entry) {
      throw new TrustedKeyError(
        `Unknown authorization signing key ID: "${cleanKeyId}".`,
        'UNKNOWN_SIGNING_KEY',
        403
      );
    }

    if (entry.status === 'REVOKED') {
      throw new TrustedKeyError(
        `Signing key ID "${cleanKeyId}" has been revoked.`,
        'REVOKED_SIGNING_KEY',
        403
      );
    }

    if (entry.status === 'RETIRED') {
      const gracePeriodMs = entry.gracePeriodMs || 300000;
      const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
      const retiredMs = entry.retiredAt instanceof Date ? entry.retiredAt.getTime() : new Date(entry.retiredAt).getTime();

      // Grace period expired
      if (nowMs - retiredMs > gracePeriodMs) {
        throw new TrustedKeyError(
          `Signing key ID "${cleanKeyId}" has expired past its retirement grace period.`,
          'EXPIRED_SIGNING_KEY',
          403
        );
      }

      // Check if authorization was illegally issued after the key was already retired
      if (authorizationIssuedAt) {
        const issuedMs = authorizationIssuedAt instanceof Date
          ? authorizationIssuedAt.getTime()
          : new Date(authorizationIssuedAt).getTime();

        if (issuedMs > retiredMs) {
          throw new TrustedKeyError(
            `Signing key ID "${cleanKeyId}" was already retired when authorization was issued.`,
            'RETIRED_KEY_USED_AFTER_RETIREMENT',
            403
          );
        }
      }
    }

    return entry.publicKeyHex;
  }

  /**
   * Returns active primary key ID.
   *
   * @returns {string}
   */
  getActiveKeyId() {
    return this._activeKeyId;
  }

  /**
   * Sets active primary key ID.
   *
   * @param {string} keyId
   */
  setActiveKeyId(keyId) {
    this._activeKeyId = keyId;
  }

  /**
   * Checks whether key ID exists in registry.
   *
   * @param {string} keyId
   * @returns {boolean}
   */
  hasKey(keyId) {
    return this._keys.has(keyId);
  }

  /**
   * Returns key metadata entry.
   *
   * @param {string} keyId
   * @returns {object|undefined}
   */
  getKey(keyId) {
    return this._keys.get(keyId);
  }

  /**
   * Resets registry to initial state from configuration.
   *
   * @param {object} [config=env]
   */
  reset(config = env) {
    this._keys.clear();
    this._loadInitialKeys(config);
  }
}

export const trustedKeyRegistry = new TrustedKeyRegistry();
