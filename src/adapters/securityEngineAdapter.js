import { env } from '../config/env.js';
import { securityFirewallService } from '../services/SecurityFirewallService.js';

/**
 * Member 2 (diago-1) Mock Security Engine Adapter.
 * Reuses the authoritative SecurityFirewallService implementation to evaluate deterministic policies,
 * handle REVIEW spec diff acknowledgments, and issue Ed25519 authorizations.
 *
 * SECURITY INVARIANTS:
 * 1. Strictly barred in production environments.
 * 2. forceOutcome overrides are strictly prohibited outside NODE_ENV === 'test'.
 * 3. Does NOT create a competing policy engine.
 */
export class SecurityEngineAdapter {
  /**
   * Asserts runtime environment safety.
   *
   * @private
   */
  _assertNonProduction() {
    if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY VIOLATION: Mock security engine adapter is strictly barred in production.');
    }
  }

  /**
   * Evaluates a proposal snapshot against intent constraints.
   * Reuses the existing SecurityFirewallService directly.
   *
   * @param {{
   *   intent: object,
   *   snapshot: object,
   *   userId: string,
   *   userPreferences?: object,
   *   acknowledgedReviewDiffs?: string[],
   *   forceOutcome?: 'PASS' | 'REVIEW' | 'BLOCK',
   *   now?: Date
   * }} params
   * @returns {Promise<object>}
   */
  async verifyProposal({
    intent,
    snapshot,
    userId,
    userPreferences,
    acknowledgedReviewDiffs = [],
    forceOutcome,
    now = new Date()
  }) {
    this._assertNonProduction();

    // Invariant: forceOutcome is strictly restricted to test environments
    if (forceOutcome) {
      if (process.env.NODE_ENV !== 'test') {
        throw new Error('SECURITY VIOLATION: forceOutcome overrides are restricted to test environments.');
      }

      if (forceOutcome === 'BLOCK') {
        return {
          decision: 'BLOCK',
          errorCode: 'FORCED_TEST_BLOCK',
          reason: 'Test harness forced BLOCK decision.',
          riskScore: 1.0,
          ruleEvaluations: {},
          authorization: null
        };
      }

      if (forceOutcome === 'REVIEW') {
        return {
          decision: 'REVIEW',
          reviewReason: 'FORCED_TEST_REVIEW',
          riskScore: 0.25,
          specDifferences: [{ field: 'switchType', requested: 'linear', actual: 'tactile' }],
          ruleEvaluations: {},
          requiresExplicitUserConfirmation: true,
          authorization: null
        };
      }
    }

    // Authoritative execution via existing SecurityFirewallService
    return securityFirewallService.evaluateProposal({
      intent,
      snapshot,
      userId,
      userPreferences,
      acknowledgedReviewDiffs,
      now
    });
  }

  /**
   * Re-evaluates a proposal previously marked REVIEW after explicit user acknowledgment.
   *
   * @param {{
   *   intent: object,
   *   snapshot: object,
   *   userId: string,
   *   acknowledgedReviewDiffs: string[],
   *   userPreferences?: object,
   *   now?: Date
   * }} params
   * @returns {Promise<object>}
   */
  async reEvaluateReviewProposal({
    intent,
    snapshot,
    userId,
    acknowledgedReviewDiffs,
    userPreferences,
    now = new Date()
  }) {
    this._assertNonProduction();

    if (!Array.isArray(acknowledgedReviewDiffs) || acknowledgedReviewDiffs.length === 0) {
      throw new Error('Explicit user acknowledgment array (acknowledgedReviewDiffs) is required to clear REVIEW status.');
    }

    return securityFirewallService.evaluateProposal({
      intent,
      snapshot,
      userId,
      userPreferences,
      acknowledgedReviewDiffs,
      now
    });
  }
}

export const securityEngineAdapter = new SecurityEngineAdapter();
