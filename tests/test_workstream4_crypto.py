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

    def test_verify_compact_token_rejects_expired(self):
        """Ed25519Signer.verify_compact_token strictly rejects expired tokens."""
        token = self.signer.create_authorization_token(
            intent_id="INTENT_EXP",
            intent_hash="HASH_SAMPLE",
            nonce="nonce_exp_123",
            validity_seconds=60
        )
        # Evaluate after expiration (now > expires_at + 15s leeway)
        is_valid, claims = Ed25519Signer.verify_compact_token(
            token.compact_token,
            self.signer.public_key_hex,
            current_time=token.expires_at + 20
        )
        self.assertFalse(is_valid, "verify_compact_token must reject expired token")
        self.assertIsNone(claims)

    def test_verify_compact_token_rejects_future_timestamp(self):
        """Ed25519Signer.verify_compact_token strictly rejects future issued_at timestamps."""
        token = self.signer.create_authorization_token(
            intent_id="INTENT_FUT",
            intent_hash="HASH_SAMPLE",
            nonce="nonce_fut_123",
            validity_seconds=60
        )
        # Evaluate before token was issued (issued_at > now + leeway)
        is_valid, claims = Ed25519Signer.verify_compact_token(
            token.compact_token,
            self.signer.public_key_hex,
            current_time=token.issued_at - 100
        )
        self.assertFalse(is_valid, "verify_compact_token must reject future-timestamped token")
        self.assertIsNone(claims)

    def test_verify_compact_token_rejects_tampered_header(self):
        """Tokens with forged alg (e.g. 'none') or wrong typ must be rejected."""
        from intentlock.workstream4_crypto_auth.signer import _b64url_encode, _b64url_decode
        token = self.signer.create_authorization_token("INTENT_HDR", "HASH", "nonce_hdr")
        parts = token.compact_token.split('.')

        # Tamper header to alg: none
        fake_header = b'{"alg":"none","typ":"INTENTLOCK-AUTH"}'
        tampered_token = f"{_b64url_encode(fake_header)}.{parts[1]}.{parts[2]}"

        is_valid, claims = Ed25519Signer.verify_compact_token(tampered_token, self.signer.public_key_hex)
        self.assertFalse(is_valid, "Token with tampered alg='none' must be rejected")
        self.assertIsNone(claims)

    def test_verify_compact_token_rejects_invalid_public_key_format(self):
        """Tokens verified against malformed or non-64-character public keys must be rejected."""
        token = self.signer.create_authorization_token("INTENT_KEY", "HASH", "nonce_key")
        # 32 characters (16 bytes) instead of 64 characters (32 bytes)
        is_valid, _ = Ed25519Signer.verify_compact_token(token.compact_token, "0123456789abcdef0123456789abcdef")
        self.assertFalse(is_valid, "Short public key must be rejected")

        # Non-hex public key
        is_valid, _ = Ed25519Signer.verify_compact_token(token.compact_token, "z" * 64)
        self.assertFalse(is_valid, "Non-hex public key must be rejected")

    def test_verify_compact_token_rejects_far_future_lifetime(self):
        """Tokens with excessive lifetime window (> 1 hour) are rejected as lifetime injection attacks."""
        issued = int(time.time())
        far_future_expiry = issued + 86400 * 365  # 1 year validity exploit
        claims = f"tok_hack:INTENT_HACK:HASH:nonce_hack:{issued}:{far_future_expiry}"
        claims_bytes = claims.encode('utf-8')
        sig_bytes = self.signer.sign_message(claims_bytes)

        from intentlock.workstream4_crypto_auth.signer import _b64url_encode
        header = b'{"alg":"Ed25519","typ":"INTENTLOCK-AUTH"}'
        hack_token = f"{_b64url_encode(header)}.{_b64url_encode(claims_bytes)}.{_b64url_encode(sig_bytes)}"

        is_valid, _ = Ed25519Signer.verify_compact_token(hack_token, self.signer.public_key_hex)
        self.assertFalse(is_valid, "Far-future token lifetime must be rejected")

    def test_key_environment_resolution_and_health_integration(self):
        import os
        import tempfile
        from intentlock.engine import IntentLockEngine
        from intentlock.core.errors import CryptographicSignatureError

        # Generate a test key
        dummy_signer = Ed25519Signer.generate_keypair()
        dummy_hex = dummy_signer.private_key_hex
        dummy_pub = dummy_signer.public_key_hex

        # Test resolution from explicit argument
        engine_explicit = IntentLockEngine(private_key_bytes=bytes.fromhex(dummy_hex))
        self.assertEqual(engine_explicit.public_key_hex, dummy_pub)
        self.assertTrue(engine_explicit.is_persistent_key)

        # Test resolution from environment variable
        old_env = os.environ.get("INTENTLOCK_PRIVATE_KEY_HEX")
        try:
            os.environ["INTENTLOCK_PRIVATE_KEY_HEX"] = dummy_hex
            # When trusted public key exists and doesn't match dummy_hex, IntentLockEngine catches mismatch
            with self.assertRaises(CryptographicSignatureError):
                IntentLockEngine()
        finally:
            if old_env is not None:
                os.environ["INTENTLOCK_PRIVATE_KEY_HEX"] = old_env
            else:
                os.environ.pop("INTENTLOCK_PRIVATE_KEY_HEX", None)

    def test_interop_fixture_vectors_v1(self):
        import json
        from intentlock.core.config import find_project_path

        fixture_path = find_project_path("contracts/test_vectors_interop_v1.json")
        self.assertIsNotNone(fixture_path, "test_vectors_interop_v1.json must exist")

        with open(fixture_path, "r", encoding="utf-8") as f:
            fixture = json.load(f)

        trusted_pk = fixture["trusted_public_key_hex"]
        vectors = {v["id"]: v for v in fixture["test_vectors"]}

        # Vector 1: Simple message verification
        v1 = vectors["vector_1_simple_message"]
        v1_valid = Ed25519Signer.verify_signature(
            bytes.fromhex(trusted_pk),
            v1["message_utf8"].encode("utf-8"),
            bytes.fromhex(v1["signature_hex"])
        )
        self.assertTrue(v1_valid)

        # Vector 2: RFC 8785 Canonicalization & SHA-512
        v2 = vectors["vector_2_rfc8785_canonicalization"]
        canonical_bytes = Canonicalizer.canonicalize(v2["raw_object"])
        self.assertEqual(canonical_bytes.decode("utf-8"), v2["canonical_json"])
        self.assertEqual(Canonicalizer.hash_intent_sha512(canonical_bytes), v2["sha512_digest"])

        # Vector 3: Compact token verification (evaluated at issuance time)
        v3 = vectors["vector_3_compact_authorization_token"]
        is_valid, claims = Ed25519Signer.verify_compact_token(
            v3["compact_token"],
            trusted_pk,
            current_time=v3["claims"]["issued_at"] + 10
        )
        self.assertTrue(is_valid)
        self.assertEqual(claims["token_id"], v3["claims"]["token_id"])
        self.assertEqual(claims["intent_id"], v3["claims"]["intent_id"])
        self.assertEqual(claims["intent_hash"], v3["claims"]["intent_hash"])
        self.assertEqual(claims["nonce"], v3["claims"]["nonce"])
        self.assertEqual(claims["issued_at"], v3["claims"]["issued_at"])
        self.assertEqual(claims["expires_at"], v3["claims"]["expires_at"])

        # Stale token must be rejected under current wall-clock time
        stale_valid, _ = Ed25519Signer.verify_compact_token(
            v3["compact_token"],
            trusted_pk,
            enforce_expiry=True
        )
        self.assertFalse(stale_valid, "Vector 3 token must be rejected as expired under current time")

if __name__ == "__main__":
    unittest.main()
