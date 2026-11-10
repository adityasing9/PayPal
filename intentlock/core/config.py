"""
Configuration parameters and security thresholds for IntentLock Engine.
"""

from dataclasses import dataclass
import os

@dataclass(frozen=True)
class SecurityConfig:
    # Price verification thresholds
    MAX_PRICE_DEVIATION_RATIO: float = 0.15      # 15% deviation triggers anomaly
    CRITICAL_PRICE_DEVIATION_RATIO: float = 0.30  # 30% deviation auto-rejects
    MINIMUM_UNIT_PRICE: float = 0.01             # Catch zero or negative price exploits

    # Hidden cost thresholds
    MAX_DRIP_FEE_PERCENTAGE: float = 0.08        # Max 8% unexplained fees allowed
    MAX_SERVICE_FEE_ABS: float = 25.0            # Absolute maximum service fee before flagging

    # Subscription protection
    REQUIRE_EXPLICIT_OPT_IN_FOR_RECURRING: bool = True

    # Threat & Prompt Injection thresholds
    PROMPT_INJECTION_RISK_BLOCK: float = 0.65
    CANARY_TOKEN_HEADER: str = "X-IntentLock-Canary"

    # Cryptographic Authorization constraints
    TOKEN_VALIDITY_WINDOW_SECONDS: int = 60      # Tokens expire 60s after generation
    MAX_CLOCK_SKEW_SECONDS: int = 15             # 15s leeway for network clock sync
    NONCE_BYTE_LENGTH: int = 16                  # 128-bit cryptographic nonces

    # Risk Engine Verdict Thresholds
    GLOBAL_RISK_BLOCK_THRESHOLD: float = 0.70    # >= 0.70 Auto-Block
    GLOBAL_RISK_CHALLENGE_THRESHOLD: float = 0.40 # 0.40 - 0.69 Step-Up Verification

    # Persistence
    DB_PATH: str = os.getenv("INTENTLOCK_DB_PATH", "intentlock_audit.db")

config = SecurityConfig()
