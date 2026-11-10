"""
IntentLock Core Engine Orchestrator
Coordinates parallel verification workstreams, calculates aggregated risk,
and executes cryptographic authorization handoffs.
"""

from typing import Tuple, Optional, Dict
import logging
from intentlock.core.models import (
    IntentPayload, AggregatedSecurityVerdict, WorkstreamVerdict, SignedAuthorizationToken
)
from intentlock.core.config import config, find_project_path, get_trusted_public_key, clean_hex_string
from intentlock.core.errors import CryptographicSignatureError
from intentlock.workstream1_verification.merchant_verifier import MerchantVerifier
from intentlock.workstream1_verification.price_verifier import PriceVerifier
from intentlock.workstream2_hidden_costs.fee_detector import FeeDetector
from intentlock.workstream2_hidden_costs.subscription_guard import SubscriptionGuard
from intentlock.workstream3_threat_intel.threat_scorer import ThreatScorer
from intentlock.workstream4_crypto_auth.canonicalizer import Canonicalizer
from intentlock.workstream4_crypto_auth.signer import Ed25519Signer
from intentlock.workstream4_crypto_auth.nonce_guard import NonceReplayGuard
from intentlock.workstream5_api_db.database import AuditDatabase

logger = logging.getLogger("intentlock.engine")

class IntentLockEngine:
    def __init__(self,
                 db_path: Optional[str] = None,
                 private_key_bytes: Optional[bytes] = None):
        resolved_bytes, is_persistent = self._resolve_private_key(private_key_bytes)
        trusted_pubkey = get_trusted_public_key()

        if resolved_bytes:
            self.signer = Ed25519Signer(resolved_bytes)
            self.is_persistent_key = is_persistent
            if trusted_pubkey:
                if self.signer.public_key_hex.lower() == trusted_pubkey.lower():
                    self.trusted_key_matched = True
                    logger.info(f"[IntentLock] Persistent Ed25519 private key verified against trusted public key ({trusted_pubkey[:16]}...).")
                else:
                    self.trusted_key_matched = False
                    if private_key_bytes is None:
                        raise CryptographicSignatureError(
                            f"Persistent private key mismatch! Loaded key derives public key '{self.signer.public_key_hex}', "
                            f"which does NOT match trusted public key '{trusted_pubkey}' in keys/intentlock_public_key.hex. "
                            "Member 3 token verification will fail. Please configure the matching private key."
                        )
            else:
                self.trusted_key_matched = False
        else:
            self.is_persistent_key = False
            self.trusted_key_matched = False
            if config.REQUIRE_PERSISTENT_KEY:
                raise CryptographicSignatureError(
                    "Persistent Ed25519 key is required (INTENTLOCK_REQUIRE_PERSISTENT_KEY=true), "
                    "but neither INTENTLOCK_PRIVATE_KEY_HEX nor keys/intentlock_private_key.hex was found."
                )
            self.signer = Ed25519Signer()
            logger.warning(
                f"[IntentLock WARNING] No persistent private key found (checked INTENTLOCK_PRIVATE_KEY_HEX and {config.PRIVATE_KEY_PATH}). "
                f"Generated ephemeral keypair (public: {self.signer.public_key_hex[:16]}...).\n"
                f"WARNING: This does NOT match trusted public key ({trusted_pubkey or 'N/A'}). "
                "Member 3 verification will fail. Provide the private key via INTENTLOCK_PRIVATE_KEY_HEX in .env or keys/intentlock_private_key.hex."
            )

        self.merchant_verifier = MerchantVerifier()
        self.price_verifier = PriceVerifier()
        self.fee_detector = FeeDetector()
        self.subscription_guard = SubscriptionGuard()
        self.threat_scorer = ThreatScorer()
        self.nonce_guard = NonceReplayGuard()
        self.db = AuditDatabase(db_path or config.DB_PATH)

    def _resolve_private_key(self, explicit_bytes: Optional[bytes]) -> Tuple[Optional[bytes], bool]:
        """
        Resolves private key bytes from:
        1. Explicit constructor argument
        2. Environment variables (.env or shell environment)
        3. Local key files across directory tree
        Returns (key_bytes, is_persistent)
        """
        import os

        if explicit_bytes is not None:
            return explicit_bytes, True

        # 1. Check environment variables
        env_varnames = [
            "INTENTLOCK_PRIVATE_KEY_HEX",
            "INTENTLOCK_PRIVATE_KEY",
            "PRIVATE_KEY_HEX",
            "PRIVATE_KEY",
            "ED25519_PRIVATE_KEY",
            "INTENTLOCK_SECURITY_PRIVATE_KEY",
            "INTENTLOCK_KEY",
        ]
        for varname in env_varnames:
            raw_val = os.getenv(varname)
            cleaned = clean_hex_string(raw_val)
            if cleaned:
                try:
                    return bytes.fromhex(cleaned), True
                except ValueError:
                    pass

        # 2. Check candidate key files
        file_candidates = [
            config.PRIVATE_KEY_PATH,
            "keys/intentlock_private_key.hex",
            "intentlock_private_key.hex",
            "keys/private_key.hex",
            "private_key.hex",
            ".keys/intentlock_private_key.hex",
        ]
        for candidate in file_candidates:
            key_file_path = find_project_path(candidate)
            if key_file_path and os.path.isfile(key_file_path):
                try:
                    with open(key_file_path, "r", encoding="utf-8-sig", errors="ignore") as f:
                        cleaned = clean_hex_string(f.read())
                        if cleaned:
                            return bytes.fromhex(cleaned), True
                except Exception as e:
                    logger.debug(f"[IntentLock] Could not read candidate {key_file_path}: {e}")

        return None, False

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
