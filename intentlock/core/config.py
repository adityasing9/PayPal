"""
Configuration parameters and security thresholds for IntentLock Engine.
"""

from dataclasses import dataclass
from typing import Optional
import os


def _load_dotenv_if_present() -> None:
    """Zero-dependency loader that searches for .env in current and parent directories."""
    search_starts = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    checked = set()
    for start in search_starts:
        curr = os.path.abspath(start)
        while curr and curr not in checked:
            checked.add(curr)
            env_file = os.path.join(curr, ".env")
            if os.path.isfile(env_file):
                try:
                    with open(env_file, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith("#") and "=" in line:
                                k, v = line.split("=", 1)
                                k, v = k.strip(), v.strip().strip('"').strip("'")
                                if k and k not in os.environ:
                                    os.environ[k] = v
                    return
                except Exception:
                    pass
            parent = os.path.dirname(curr)
            if parent == curr:
                break
            curr = parent


_load_dotenv_if_present()


def find_project_path(rel_path: str) -> Optional[str]:
    """Resolves a relative path against CWD and the repository root."""
    if not rel_path:
        return None
    if os.path.isabs(rel_path) and os.path.exists(rel_path):
        return rel_path

    # Check CWD
    cwd_path = os.path.abspath(rel_path)
    if os.path.exists(cwd_path):
        return cwd_path

    # Check repository root
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    candidate = os.path.join(repo_root, rel_path)
    if os.path.exists(candidate):
        return candidate
    return None


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

    # Key Management Configuration
    PRIVATE_KEY_PATH: str = os.getenv("INTENTLOCK_PRIVATE_KEY_PATH", "keys/intentlock_private_key.hex")
    PUBLIC_KEY_PATH: str = os.getenv("INTENTLOCK_PUBLIC_KEY_PATH", "keys/intentlock_public_key.hex")
    REQUIRE_PERSISTENT_KEY: bool = os.getenv("INTENTLOCK_REQUIRE_PERSISTENT_KEY", "false").lower() in ("1", "true", "yes")

    # Risk Engine Verdict Thresholds
    GLOBAL_RISK_BLOCK_THRESHOLD: float = 0.70    # >= 0.70 Auto-Block
    GLOBAL_RISK_CHALLENGE_THRESHOLD: float = 0.40 # 0.40 - 0.69 Step-Up Verification

    # Persistence
    DB_PATH: str = os.getenv("INTENTLOCK_DB_PATH", "intentlock_audit.db")


config = SecurityConfig()


def get_trusted_public_key() -> Optional[str]:
    """Reads the trusted public key hex from the repository keys file if available."""
    pub_path = find_project_path(config.PUBLIC_KEY_PATH)
    if pub_path and os.path.isfile(pub_path):
        try:
            with open(pub_path, "r", encoding="utf-8") as f:
                val = f.read().strip()
                if len(val) == 64:
                    return val
        except Exception:
            pass
    return None

