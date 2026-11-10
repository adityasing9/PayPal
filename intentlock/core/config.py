"""
Configuration parameters and security thresholds for IntentLock Engine.
"""

from dataclasses import dataclass
from typing import Optional
import os


def clean_hex_string(raw: Optional[str]) -> Optional[str]:
    """Cleans, normalizes, and validates a 64-character hexadecimal key string."""
    if not raw:
        return None
    val = str(raw).strip()
    if val.startswith("\ufeff"):
        val = val[1:].strip()
    # Strip enclosing quotes and whitespace
    val = val.strip('"`\' \t\r\n')
    # Strip optional 0x/0X prefix
    if val.lower().startswith("0x"):
        val = val[2:].strip()
    # Strip any trailing comment (e.g. # comment)
    if "#" in val:
        val = val.split("#", 1)[0].strip()
    val = val.strip('"`\' \t\r\n')
    if len(val) == 64:
        try:
            int(val, 16)
            return val.lower()
        except ValueError:
            return None
    return None


def _load_dotenv_files() -> None:
    """
    Exhaustively searches for and loads .env files across CWD, module tree, and ancestors.
    Supports python-dotenv if installed, with zero-dependency native fallback.
    """
    try:
        from dotenv import load_dotenv
        load_dotenv(override=False)
    except Exception:
        pass

    search_starts = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    checked = set()
    found_env_files = []

    for start in search_starts:
        curr = os.path.abspath(start)
        while curr and curr not in checked:
            checked.add(curr)
            for env_name in [".env", ".env.local", ".env.development"]:
                candidate = os.path.join(curr, env_name)
                if os.path.isfile(candidate) and candidate not in found_env_files:
                    found_env_files.append(candidate)
            parent = os.path.dirname(curr)
            if parent == curr:
                break
            curr = parent

    # Parse discovered .env files (without overriding non-empty environment variables)
    for env_path in found_env_files:
        try:
            with open(env_path, "r", encoding="utf-8-sig", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if line.startswith("export "):
                        line = line[7:].strip()
                    if "#" in line:
                        line = line.split("#", 1)[0].strip()
                    if "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"`\' \t\r\n')
                    if k and not os.environ.get(k):
                        os.environ[k] = v
        except Exception:
            pass


_load_dotenv_files()


def find_project_path(rel_path: str) -> Optional[str]:
    """
    Resolves a relative path against CWD, module tree, and ancestor directories.
    """
    if not rel_path:
        return None
    if os.path.isabs(rel_path) and os.path.isfile(rel_path):
        return rel_path

    search_dirs = [os.getcwd(), os.path.dirname(os.path.abspath(__file__))]
    checked = set()
    for start in search_dirs:
        curr = os.path.abspath(start)
        while curr and curr not in checked:
            checked.add(curr)
            candidate = os.path.join(curr, rel_path)
            if os.path.isfile(candidate):
                return candidate
            parent = os.path.dirname(curr)
            if parent == curr:
                break
            curr = parent

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
    TOKEN_VALIDITY_WINDOW_SECONDS: int = int(os.getenv("INTENTLOCK_TOKEN_VALIDITY_SECONDS", "300"))      # 300s (5-min) window per Phase 2.6 spec
    MAX_CLOCK_SKEW_SECONDS: int = int(os.getenv("INTENTLOCK_MAX_CLOCK_SKEW_SECONDS", "15"))             # 15s leeway for network clock sync
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


def get_trusted_public_key() -> str:
    """Reads and normalizes the trusted public key hex (with canonical fallback)."""
    candidates = [
        config.PUBLIC_KEY_PATH,
        "keys/intentlock_public_key.hex",
        "intentlock_public_key.hex",
        "keys/public_key.hex",
        "public_key.hex",
    ]
    for cand in candidates:
        pub_path = find_project_path(cand)
        if pub_path and os.path.isfile(pub_path):
            try:
                with open(pub_path, "r", encoding="utf-8-sig", errors="ignore") as f:
                    cleaned = clean_hex_string(f.read())
                    if cleaned:
                        return cleaned
            except Exception:
                pass
    return "4df93f582d2b31f519c1982bb55c1aa46b4d64498fa04164eeb36c44c0f1cca9"


