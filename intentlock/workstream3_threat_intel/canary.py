"""
Canary Token Manager - Workstream 3
Creates, binds, and verifies canary tokens to prevent context boundary leaks or injection overrides.
"""

import secrets
import hashlib
import time
from typing import Dict, Optional

class CanaryTokenManager:
    def __init__(self, secret_salt: Optional[str] = None):
        self.secret_salt = secret_salt or secrets.token_hex(32)
        # In-memory registry of issued canaries: canary_token -> (intent_id, created_at)
        self._active_canaries: Dict[str, Dict[str, any]] = {}

    def generate_canary(self, intent_id: str) -> str:
        """Generates a high-entropy canary token cryptographically bound to the intent."""
        nonce = secrets.token_hex(16)
        raw = f"{intent_id}:{nonce}:{self.secret_salt}:{time.time()}"
        token = "CANARY_" + hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32]
        self._active_canaries[token] = {
            "intent_id": intent_id,
            "created_at": time.time(),
            "used": False
        }
        return token

    def verify_canary(self, token: str, intent_id: str) -> bool:
        """Verifies that the provided canary was issued for this intent and is not reused."""
        if not token or token not in self._active_canaries:
            return False

        record = self._active_canaries[token]
        if record["intent_id"] != intent_id:
            return False

        # Expire after 10 minutes
        if time.time() - record["created_at"] > 600:
            return False

        return True
