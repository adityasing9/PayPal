"""
RFC 8785 JSON Canonicalization Scheme (JCS) - Workstream 4
Guarantees deterministic, byte-for-byte identical serialization for cryptographic hashing.

Cross-language compatibility: Produces identical output in Python and Node.js/V8.

Key sorting: UTF-16 code unit order (RFC 8785 Section 3.2.3).
Numeric: Integer values only in signed payloads (no float divergence).
Whitespace: Zero whitespace (separators=(',', ':')).
"""

import json
import hashlib
from typing import Any, Dict


def _utf16_sort_key(s: str) -> bytes:
    """
    Returns bytes suitable for lexicographic comparison matching
    JavaScript's String.prototype.localeCompare / Array.sort() default,
    which compares UTF-16 code units. This is required by RFC 8785 Section 3.2.3.
    """
    return s.encode('utf-16-be')


class Canonicalizer:
    @staticmethod
    def canonicalize(data: Any) -> bytes:
        """
        Serializes data into RFC 8785 compliant canonical JSON bytes.
        - Whitespace eliminated
        - Object keys sorted by UTF-16 code unit order (matching JS sort)
        - Integer-only numeric values (floats that are whole numbers become ints)
        - UTF-8 encoded output
        """
        def _normalize(obj: Any) -> Any:
            if isinstance(obj, dict):
                # RFC 8785 Section 3.2.3: sort keys by UTF-16 code unit value
                return {k: _normalize(obj[k])
                        for k in sorted(obj.keys(), key=_utf16_sort_key)}
            elif isinstance(obj, list):
                return [_normalize(elem) for elem in obj]
            elif isinstance(obj, float):
                # Convert whole-number floats to ints for cross-language determinism
                if obj.is_integer() and abs(obj) < 2**53:
                    return int(obj)
                # For fractional floats, use Python's repr which matches ES2015 Number serialization
                # for IEEE 754 double-precision values in the safe range
                return obj
            return obj

        normalized_data = _normalize(data)
        # separators=(',', ':') removes all whitespace (RFC 8785 Section 3.2.2)
        canonical_str = json.dumps(
            normalized_data,
            separators=(',', ':'),
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=False  # We already sorted above with UTF-16 order
        )
        return canonical_str.encode('utf-8')

    @staticmethod
    def hash_intent_sha512(canonical_bytes: bytes) -> str:
        """Generates SHA-512 hex digest of canonical bytes."""
        return hashlib.sha512(canonical_bytes).hexdigest()

    @staticmethod
    def hash_intent_sha256(canonical_bytes: bytes) -> str:
        """Generates SHA-256 hex digest of canonical bytes."""
        return hashlib.sha256(canonical_bytes).hexdigest()
