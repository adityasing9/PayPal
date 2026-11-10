"""
Tests for Workstream 4: Cryptographic Transaction Authorization
"""

import unittest
import time
from intentlock.workstream4_crypto_auth.canonicalizer import Canonicalizer
from intentlock.workstream4_crypto_auth.signer import Ed25519Signer
from intentlock.workstream4_crypto_auth.nonce_guard import NonceReplayGuard
from intentlock.core.errors import ReplayAttackDetected

class TestWorkstream4(unittest.TestCase):
    def setUp(self):
        self.signer = Ed25519Signer.generate_keypair()
        self.nonce_guard = NonceReplayGuard(validity_window_seconds=60, clock_skew_leeway=15)

    def test_canonical_json_deterministic_ordering(self):
        # Two dictionaries with identical keys and values in different order
        dict_a = {"z": 100, "a": "hello", "m": [3, 2, 1]}
        dict_b = {"a": "hello", "m": [3, 2, 1], "z": 100}

        bytes_a = Canonicalizer.canonicalize(dict_a)
        bytes_b = Canonicalizer.canonicalize(dict_b)

        self.assertEqual(bytes_a, bytes_b)
        self.assertEqual(
            Canonicalizer.hash_intent_sha512(bytes_a),
            Canonicalizer.hash_intent_sha512(bytes_b)
        )

    def test_ed25519_sign_and_verify_roundtrip(self):
        message = b"Tamper-proof intent authorization test message"
        signature = self.signer.sign_message(message)

        # Genuine verification must pass
        is_valid = Ed25519Signer.verify_signature(
            bytes.fromhex(self.signer.public_key_hex),
            message,
            signature
        )
        self.assertTrue(is_valid)

        # Mutated message must fail
        tampered_valid = Ed25519Signer.verify_signature(
            bytes.fromhex(self.signer.public_key_hex),
            message + b"_TAMPERED",
            signature
        )
        self.assertFalse(tampered_valid)

    def test_compact_token_creation_and_verification(self):
        token = self.signer.create_authorization_token(
            intent_id="INTENT_101",
            intent_hash="SHA512_HASH_EXAMPLE",
            nonce="0123456789abcdef",
            validity_seconds=60
        )

        self.assertTrue(token.compact_token)
        is_valid, claims = Ed25519Signer.verify_compact_token(
            token.compact_token,
            self.signer.public_key_hex
        )
        self.assertTrue(is_valid)
        self.assertEqual(claims["intent_id"], "INTENT_101")
        self.assertEqual(claims["nonce"], "0123456789abcdef")

    def test_nonce_replay_attack_rejected(self):
        nonce = self.nonce_guard.generate_nonce()
        now = time.time()

        # First use must succeed
        self.nonce_guard.validate_and_record_nonce(nonce, "INTENT_1", now)

        # Reusing the exact same nonce must trigger ReplayAttackDetected
        with self.assertRaises(ReplayAttackDetected):
            self.nonce_guard.validate_and_record_nonce(nonce, "INTENT_2_REPLAY", now)

    def test_expired_token_rejected(self):
        nonce = self.nonce_guard.generate_nonce()
        stale_time = time.time() - 120  # 120 seconds in past (past 60s window)

        with self.assertRaises(ReplayAttackDetected):
            self.nonce_guard.validate_and_record_nonce(nonce, "INTENT_EXPIRED", stale_time)

    def test_future_timestamp_manipulation_rejected(self):
        nonce = self.nonce_guard.generate_nonce()
        future_time = time.time() + 3600  # 1 hour in future

        with self.assertRaises(ReplayAttackDetected):
            self.nonce_guard.validate_and_record_nonce(nonce, "INTENT_FUTURE", future_time)

if __name__ == "__main__":
    unittest.main()
