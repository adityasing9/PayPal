"""
Payload Sanitizer - Workstream 3
Detects Unicode homoglyphs, zero-width character smuggling, and AST parameter tampering.
"""

from typing import Tuple, List, Dict, Any
import unicodedata
import re

# Invisible and zero-width codepoints commonly used for evasion
ZERO_WIDTH_CHARS = {
    '\u200B': 'ZERO WIDTH SPACE',
    '\u200C': 'ZERO WIDTH NON-JOINER',
    '\u200D': 'ZERO WIDTH JOINER',
    '\uFEFF': 'ZERO WIDTH NO-BREAK SPACE',
    '\u2060': 'WORD JOINER',
    '\u00AD': 'SOFT HYPHEN'
}

# Confusable homoglyphs mapped to ASCII equivalents
HOMOGLYPH_MAP = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',  # Cyrillic
    'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',  # Cyrillic
    'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
    'ο': 'o', 'ν': 'v', 'α': 'a', 'β': 'b',                                 # Greek
    'Ⅰ': 'I', 'Ⅱ': 'II', 'ⅼ': 'l'                                          # Roman numerals
}

class PayloadSanitizer:
    def detect_evasion(self, text: str) -> Tuple[bool, List[str], str]:
        """
        Analyzes a string for hidden evasion techniques.
        Returns: (has_evasion, list_of_flags, cleaned_normalized_text)
        """
        if not text:
            return False, [], ""

        flags: List[str] = []
        has_evasion = False

        # 1. Zero-width character detection
        found_zero_width = []
        for ch in text:
            if ch in ZERO_WIDTH_CHARS:
                found_zero_width.append(ZERO_WIDTH_CHARS[ch])

        if found_zero_width:
            has_evasion = True
            flags.append(f"ZERO_WIDTH_CHARACTER_SMUGGLING ({len(found_zero_width)} instances)")

        # Strip zero-width chars for further inspection
        stripped = "".join(ch for ch in text if ch not in ZERO_WIDTH_CHARS)

        # 2. Homoglyph / Mixed script detection
        homoglyphs_found = []
        normalized_chars = []
        for ch in stripped:
            if ch in HOMOGLYPH_MAP:
                homoglyphs_found.append(ch)
                normalized_chars.append(HOMOGLYPH_MAP[ch])
            else:
                normalized_chars.append(ch)

        normalized_text = unicodedata.normalize("NFKD", "".join(normalized_chars))

        if homoglyphs_found:
            has_evasion = True
            flags.append(f"UNICODE_HOMOGLYPH_OBFUSCATION ({len(homoglyphs_found)} characters)")

        # 3. Control character check (excluding standard newlines/tabs)
        control_chars = [ch for ch in stripped if unicodedata.category(ch).startswith('C') and ch not in ('\n', '\r', '\t')]
        if control_chars:
            has_evasion = True
            flags.append(f"HIDDEN_CONTROL_CHARACTERS ({len(control_chars)} characters)")

        return has_evasion, flags, normalized_text

    def sanitize_dict_parameters(self, payload: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Scans nested JSON dictionaries for parameter tampering, prototype pollution attempts,
        or unauthorized root-level overrides.
        """
        flags: List[str] = []
        has_tampering = False

        dangerous_keys = {"__proto__", "constructor", "prototype", "$where", "$regex"}

        def _traverse(node: Any, path: str = ""):
            nonlocal has_tampering
            if isinstance(node, dict):
                for k, v in node.items():
                    current_path = f"{path}.{k}" if path else k
                    if k.lower() in dangerous_keys:
                        has_tampering = True
                        flags.append(f"PROTOTYPE_OR_INJECTION_KEY_DETECTED ({current_path})")
                    _traverse(v, current_path)
            elif isinstance(node, list):
                for idx, item in enumerate(node):
                    _traverse(item, f"{path}[{idx}]")

        _traverse(payload)
        return has_tampering, flags
