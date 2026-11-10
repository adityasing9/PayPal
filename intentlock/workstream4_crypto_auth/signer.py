"""
Ed25519 Cryptographic Signer - Workstream 4
Implements RFC 8032 compliant Ed25519 Edwards-curve Digital Signature Algorithm
with zero external C-dependencies, providing quantum-resistant-adjacent, collision-resistant signing.
"""

import hashlib
import secrets
import base64
import time
from typing import Tuple, Optional
from intentlock.core.models import SignedAuthorizationToken
from intentlock.core.errors import CryptographicSignatureError

# --- RFC 8032 Curve25519 / Ed25519 Parameters ---
_q = 2**255 - 19
_l = 2**252 + 27742317777372353535851937790883648493

def _inv(x: int) -> int:
    return pow(x, _q - 2, _q)

_d = -121665 * _inv(121666) % _q
_I = pow(2, (_q - 1) // 4, _q)

def _xrecover(y: int) -> int:
    xx = (y * y - 1) * _inv(_d * y * y + 1)
    x = pow(xx, (_q + 3) // 8, _q)
    if (x * x - xx) % _q != 0:
        x = (x * _I) % _q
    if x % 2 != 0:
        x = _q - x
    return x

_By = 4 * _inv(5) % _q
_Bx = _xrecover(_By)
_B = (_Bx, _By)

def _edwards_add(P: Tuple[int, int], Q: Tuple[int, int]) -> Tuple[int, int]:
    x1, y1 = P
    x2, y2 = Q
    x3 = (x1 * y2 + x2 * y1) * _inv(1 + _d * x1 * x2 * y1 * y2) % _q
    y3 = (y1 * y2 + x1 * x2) * _inv(1 - _d * x1 * x2 * y1 * y2) % _q
    return (x3, y3)

def _scalarmult(P: Tuple[int, int], e: int) -> Tuple[int, int]:
    if e == 0:
        return (0, 1)
    Q = _scalarmult(P, e // 2)
    Q = _edwards_add(Q, Q)
    if e & 1:
        Q = _edwards_add(Q, P)
    return Q

def _bit(h: bytes, i: int) -> int:
    return (h[i // 8] >> (i % 8)) & 1

def _encodeint(y: int) -> bytes:
    bits = [(y >> i) & 1 for i in range(256)]
    return bytes(sum([bits[i * 8 + j] << j for j in range(8)]) for i in range(32))

def _encodepoint(P: Tuple[int, int]) -> bytes:
    x, y = P
    bits = [(y >> i) & 1 for i in range(255)] + [x & 1]
    return bytes(sum([bits[i * 8 + j] << j for j in range(8)]) for i in range(32))

def _decodeint(s: bytes) -> int:
    return sum(2**i * _bit(s, i) for i in range(256))

def _decodepoint(s: bytes) -> Tuple[int, int]:
    y = sum(2**i * _bit(s, i) for i in range(255))
    x = _xrecover(y)
    if x & 1 != _bit(s, 255):
        x = _q - x
    return (x, y)

def _H(m: bytes) -> bytes:
    return hashlib.sha512(m).digest()

def _clamp_scalar(h_bytes: bytes) -> int:
    """
    RFC 8032 Section 5.1.5: Clamp the first 32 bytes of SHA-512(sk).
    Clear bits 0,1,2 of the first byte, clear bit 7 of the last byte, set bit 6 of the last byte.
    """
    a_bytes = bytearray(h_bytes[:32])
    a_bytes[0] &= 248
    a_bytes[31] &= 127
    a_bytes[31] |= 64
    return int.from_bytes(a_bytes, 'little')


def _publickey(sk: bytes) -> bytes:
    """RFC 8032 Section 5.1.5: Derive Ed25519 public key from 32-byte private seed."""
    h = _H(sk)
    a = _clamp_scalar(h)
    A = _scalarmult(_B, a)
    return _encodepoint(A)


def _sign_raw(m: bytes, sk: bytes, pk: bytes) -> bytes:
    """
    RFC 8032 Section 5.1.6: Ed25519 signing.
    All SHA-512 digests are interpreted as 512-bit little-endian integers
    before reduction mod l, ensuring cross-platform deterministic signatures.
    """
    h = _H(sk)
    a = _clamp_scalar(h)

    # r = SHA-512(h[32:] + m) interpreted as 512-bit LE integer, reduced mod l
    r = int.from_bytes(_H(h[32:] + m), 'little')
    R = _scalarmult(_B, r)
    R_bytes = _encodepoint(R)

    # k = SHA-512(R + pk + m) interpreted as 512-bit LE integer, reduced mod l
    k = int.from_bytes(_H(R_bytes + pk + m), 'little')
    S = (r + k * a) % _l
    return R_bytes + S.to_bytes(32, 'little')


def _verify_raw(s: bytes, m: bytes, pk: bytes) -> bool:
    """
    RFC 8032 Section 5.1.7: Ed25519 verification.
    Compatible with Node.js crypto.verify(), OpenSSL, libsodium, and all
    standard Ed25519 implementations.
    """
    if len(s) != 64 or len(pk) != 32:
        return False
    try:
        R = _decodepoint(s[:32])
        A = _decodepoint(pk)
        S = int.from_bytes(s[32:], 'little')
        k = int.from_bytes(_H(s[:32] + pk + m), 'little')
        return _scalarmult(_B, S) == _edwards_add(R, _scalarmult(A, k))
    except Exception:
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def _b64url_decode(s: str) -> bytes:
    padding = '=' * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s + padding)


class Ed25519Signer:
    """High-level Ed25519 signer and token generator."""
    def __init__(self, private_key_bytes: Optional[bytes] = None):
        if private_key_bytes:
            if len(private_key_bytes) != 32:
                raise CryptographicSignatureError("Private key must be exactly 32 bytes")
            self.private_key = private_key_bytes
        else:
            self.private_key = secrets.token_bytes(32)

        self.public_key = _publickey(self.private_key)

    @classmethod
    def generate_keypair(cls) -> "Ed25519Signer":
        return cls(secrets.token_bytes(32))

    @property
    def public_key_hex(self) -> str:
        return self.public_key.hex()

    @property
    def private_key_hex(self) -> str:
        return self.private_key.hex()

    def sign_message(self, message: bytes) -> bytes:
        """Signs arbitrary bytes with the private key."""
        return _sign_raw(message, self.private_key, self.public_key)

    @staticmethod
    def verify_signature(public_key_bytes: bytes, message: bytes, signature_bytes: bytes) -> bool:
        """Verifies an Ed25519 signature against arbitrary bytes."""
        return _verify_raw(signature_bytes, message, public_key_bytes)

    def create_authorization_token(self,
                                  intent_id: str,
                                  intent_hash: str,
                                  nonce: str,
                                  validity_seconds: int = 60) -> SignedAuthorizationToken:
        """
        Creates a signed IntentLock authorization token for a verified commerce intent.
        Timestamps are integer Unix epoch seconds for cross-language determinism.
        """
        issued_at = int(time.time())
        expires_at = issued_at + validity_seconds
        token_id = secrets.token_hex(16)

        # Structure payload to be signed (colon-separated, integer timestamps)
        claims = f"{token_id}:{intent_id}:{intent_hash}:{nonce}:{issued_at}:{expires_at}"
        claims_bytes = claims.encode('utf-8')

        sig_bytes = self.sign_message(claims_bytes)
        sig_hex = sig_bytes.hex()

        # Build compact URL-safe token format: header.payload.signature
        header = b'{"alg":"Ed25519","typ":"INTENTLOCK-AUTH"}'
        compact_token = (
            f"{_b64url_encode(header)}."
            f"{_b64url_encode(claims_bytes)}."
            f"{_b64url_encode(sig_bytes)}"
        )

        return SignedAuthorizationToken(
            token_id=token_id,
            intent_id=intent_id,
            intent_hash=intent_hash,
            issued_at=issued_at,
            expires_at=expires_at,
            nonce=nonce,
            signature=sig_hex,
            public_key=self.public_key_hex,
            algorithm="Ed25519",
            compact_token=compact_token
        )

    @staticmethod
    def verify_compact_token(compact_token: str, public_key_hex: str) -> Tuple[bool, Optional[dict]]:
        """
        Validates a compact token string and returns parsed claims if valid.
        """
        try:
            parts = compact_token.split('.')
            if len(parts) != 3:
                return False, None

            header_bytes = _b64url_decode(parts[0])
            claims_bytes = _b64url_decode(parts[1])
            sig_bytes = _b64url_decode(parts[2])

            pk_bytes = bytes.fromhex(public_key_hex)
            if not _verify_raw(sig_bytes, claims_bytes, pk_bytes):
                return False, None

            claims_str = claims_bytes.decode('utf-8')
            token_id, intent_id, intent_hash, nonce, issued_at, expires_at = claims_str.split(':')

            # Parse timestamps (supports both integer and float for backward compatibility)
            def _parse_ts(s):
                return int(s) if '.' not in s else float(s)

            return True, {
                "token_id": token_id,
                "intent_id": intent_id,
                "intent_hash": intent_hash,
                "nonce": nonce,
                "issued_at": _parse_ts(issued_at),
                "expires_at": _parse_ts(expires_at)
            }
        except Exception:
            return False, None
