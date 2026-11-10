"""
IntentLock Core Engine Orchestrator
Coordinates parallel verification workstreams, calculates aggregated risk,
and executes cryptographic authorization handoffs.
"""

from typing import Tuple, Optional, Dict
from intentlock.core.models import (
    IntentPayload, AggregatedSecurityVerdict, WorkstreamVerdict, SignedAuthorizationToken
)
from intentlock.core.config import config
from intentlock.workstream1_verification.merchant_verifier import MerchantVerifier
from intentlock.workstream1_verification.price_verifier import PriceVerifier
from intentlock.workstream2_hidden_costs.fee_detector import FeeDetector
from intentlock.workstream2_hidden_costs.subscription_guard import SubscriptionGuard
from intentlock.workstream3_threat_intel.threat_scorer import ThreatScorer
from intentlock.workstream4_crypto_auth.canonicalizer import Canonicalizer
from intentlock.workstream4_crypto_auth.signer import Ed25519Signer
from intentlock.workstream4_crypto_auth.nonce_guard import NonceReplayGuard
from intentlock.workstream5_api_db.database import AuditDatabase

class IntentLockEngine:
    def __init__(self,
                 db_path: Optional[str] = None,
                 private_key_bytes: Optional[bytes] = None):
        import os
        if private_key_bytes is None and os.path.exists("keys/intentlock_private_key.hex"):
            try:
                with open("keys/intentlock_private_key.hex", "r") as f:
                    hex_key = f.read().strip()
                    if len(hex_key) == 64:
                        private_key_bytes = bytes.fromhex(hex_key)
            except Exception:
                pass

        self.merchant_verifier = MerchantVerifier()
        self.price_verifier = PriceVerifier()
        self.fee_detector = FeeDetector()
        self.subscription_guard = SubscriptionGuard()
        self.threat_scorer = ThreatScorer()
        self.signer = Ed25519Signer(private_key_bytes)
        self.nonce_guard = NonceReplayGuard()
        self.db = AuditDatabase(db_path or config.DB_PATH)

    @property
    def public_key_hex(self) -> str:
        return self.signer.public_key_hex

    def verify_intent(self, intent: IntentPayload) -> AggregatedSecurityVerdict:
        """
        Runs all independent verification workstreams and computes aggregated risk score.
        """
        # Execute Workstream 1
        v_merchant = self.merchant_verifier.verify(intent.merchant)
        v_price = self.price_verifier.verify(intent.items, intent.costs)

        # Execute Workstream 2
        v_fees = self.fee_detector.detect(intent.costs)
        v_sub = self.subscription_guard.evaluate(intent.items, intent.subscription)

        # Execute Workstream 3
        v_threat = self.threat_scorer.evaluate_intent(intent)

        verdicts: Dict[str, WorkstreamVerdict] = {
            "merchant_verification": v_merchant,
            "price_verification": v_price,
            "hidden_costs": v_fees,
            "subscription_guard": v_sub,
            "threat_intelligence": v_threat
        }

        # Weighted composite risk scoring
        weights = {
            "merchant_verification": 0.15,
            "price_verification": 0.25,
            "hidden_costs": 0.15,
            "subscription_guard": 0.20,
            "threat_intelligence": 0.25
        }

        composite_risk = sum(verdicts[k].risk_score * weights[k] for k in weights)

        # Critical failure veto (e.g. prompt injection, non-positive price, or covert subscription)
        reasons = []
        is_blocked = False

        for k, v in verdicts.items():
            if not v.passed or v.risk_score >= config.GLOBAL_RISK_BLOCK_THRESHOLD:
                is_blocked = True
                reasons.extend(v.flags)

        overall_risk = max(composite_risk, 0.90 if is_blocked else 0.0)
        overall_risk = min(1.0, round(overall_risk, 3))

        is_authorized = not is_blocked and overall_risk < config.GLOBAL_RISK_CHALLENGE_THRESHOLD
        requires_challenge = not is_blocked and (
            config.GLOBAL_RISK_CHALLENGE_THRESHOLD <= overall_risk < config.GLOBAL_RISK_BLOCK_THRESHOLD
        )

        return AggregatedSecurityVerdict(
            intent_id=intent.intent_id,
            is_authorized=is_authorized,
            requires_challenge=requires_challenge,
            overall_risk_score=overall_risk,
            verdicts=verdicts,
            reasons=reasons
        )

    def authorize_intent(self, intent: IntentPayload) -> Tuple[bool, AggregatedSecurityVerdict, Optional[SignedAuthorizationToken]]:
        """
        Evaluates the intent and, if risk criteria are satisfied, issues a signed Ed25519 token.
        Persists cryptographic audit trail to the SQLite database.
        """
        verdict = self.verify_intent(intent)

        # Calculate RFC 8785 canonical hash commitment
        canonical_bytes = Canonicalizer.canonicalize(intent.to_dict())
        intent_hash = Canonicalizer.hash_intent_sha512(canonical_bytes)

        # Persist verdict to audit log
        self.db.record_verdict(
            intent_id=intent.intent_id,
            buyer_id=intent.buyer_id,
            merchant_id=intent.merchant.merchant_id,
            intent_hash=intent_hash,
            verdict=verdict
        )

        if not verdict.is_authorized:
            return False, verdict, None

        # Issue cryptographic Ed25519 token
        nonce = self.nonce_guard.generate_nonce()
        token = self.signer.create_authorization_token(
            intent_id=intent.intent_id,
            intent_hash=intent_hash,
            nonce=nonce,
            validity_seconds=config.TOKEN_VALIDITY_WINDOW_SECONDS
        )

        # Record nonce in replay guard
        self.nonce_guard.validate_and_record_nonce(nonce, intent.intent_id, token.issued_at)

        # Store token in database
        self.db.record_token(token)

        return True, verdict, token
