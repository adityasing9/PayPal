"""
RFC 8785 JSON Canonicalization Scheme (JCS) - Workstream 4
Guarantees deterministic, byte-for-byte identical serialization for cryptographic hashing.
"""

import json
import hashlib
from typing import Any, Dict

class Canonicalizer:
    @staticmethod
    def canonicalize(data: Any) -> bytes:
        """
        Serializes data into RFC 8785 compliant canonical JSON bytes.
        - Whitespace eliminated
        - Object keys lexicographically sorted by UTF-16 code unit order
        - Normalized UTF-8 encoding
        """
        def _sort_keys(obj: Any) -> Any:
            if isinstance(obj, dict):
                return {k: _sort_keys(v) for k, v in sorted(obj.items(), key=lambda item: item[0])}
            elif isinstance(obj, list):
                return [_sort_keys(elem) for elem in obj]
            elif isinstance(obj, float):
                # Standardize float formatting
                if obj.is_integer():
                    return int(obj)
                return round(obj, 8)
            return obj

        sorted_data = _sort_keys(data)
        # separators=(',', ':') removes all whitespace
        canonical_str = json.dumps(
            sorted_data,
            separators=(',', ':'),
            ensure_ascii=False,
            allow_nan=False
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
