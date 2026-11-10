"""
Nonce & Replay Guard - Workstream 4
Guarantees single-use authorization tokens and thwarts replay attacks and clock manipulation.
"""

import time
import secrets
import threading
from typing import Dict, Tuple, Optional
from intentlock.core.config import config
from intentlock.core.errors import ReplayAttackDetected

class NonceReplayGuard:
    def __init__(self,
                 validity_window_seconds: int = config.TOKEN_VALIDITY_WINDOW_SECONDS,
                 clock_skew_leeway: int = config.MAX_CLOCK_SKEW_SECONDS):
        self.validity_window_seconds = validity_window_seconds
        self.clock_skew_leeway = clock_skew_leeway
        self._lock = threading.Lock()
        # In-memory nonce cache: nonce -> (intent_id, recorded_at, expires_at)
        self._seen_nonces: Dict[str, Tuple[str, float, float]] = {}

    def generate_nonce(self) -> str:
        """Generates a fresh 128-bit cryptographic hex nonce."""
        return secrets.token_hex(config.NONCE_BYTE_LENGTH)

    def validate_and_record_nonce(self,
                                  nonce: str,
                                  intent_id: str,
                                  token_timestamp: float) -> bool:
        """
        Validates token freshness and records the nonce.
        Raises ReplayAttackDetected if nonce was previously used or timestamp is invalid.
        """
        now = time.time()

        # 1. Clock skew / Future timestamp defense
        if token_timestamp > (now + self.clock_skew_leeway):
            raise ReplayAttackDetected(
                f"Token timestamp {token_timestamp} is in the future (exceeds clock skew of {self.clock_skew_leeway}s)"
            )

        # 2. Expiration defense
        if (now - token_timestamp) > self.validity_window_seconds:
            raise ReplayAttackDetected(
                f"Token expired: generated at {token_timestamp}, current time is {now} (window: {self.validity_window_seconds}s)"
            )

        with self._lock:
            # 3. Nonce uniqueness check (Replay defense)
            if nonce in self._seen_nonces:
                prev_intent, prev_time, _ = self._seen_nonces[nonce]
                raise ReplayAttackDetected(
                    f"Replay attack detected: Nonce '{nonce}' was already used by intent '{prev_intent}' at {prev_time}"
                )

            # Record nonce
            expires_at = now + self.validity_window_seconds + self.clock_skew_leeway
            self._seen_nonces[nonce] = (intent_id, now, expires_at)

            # Clean expired nonces to prevent unbounded memory growth
            self._purge_expired(now)

        return True

    def _purge_expired(self, current_time: float):
        """Purges nonces that are past their expiration and skew window."""
        expired = [n for n, (_, _, exp) in self._seen_nonces.items() if exp < current_time]
        for n in expired:
            del self._seen_nonces[n]

    def is_nonce_used(self, nonce: str) -> bool:
        with self._lock:
            return nonce in self._seen_nonces
