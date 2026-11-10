"""
Prompt Injection Detector - Workstream 3
Detects direct & indirect prompt injection, jailbreaks, delimiter abuse, and commerce bypass directives.
"""

from typing import List, Tuple, Dict
import re
from .sanitizer import PayloadSanitizer

# Compiled threat patterns with severity weights (0.0 to 1.0)
INJECTION_SIGNATURES: List[Tuple[str, str, float]] = [
    # 1. System instruction override
    (r"ignore\s+(all\s+)?(prior|previous|above)\s+(instructions|prompts|rules)", "SYSTEM_OVERRIDE_IGNORE_PRIOR", 0.95),
    (r"disregard\s+(all\s+)?(previous|prior)\s+(directives|constraints)", "SYSTEM_OVERRIDE_DISREGARD", 0.95),
    (r"you\s+are\s+now\s+in\s+(developer|maintenance|god|debug)\s+mode", "JAILBREAK_MODE_ACTIVATION", 0.90),
    (r"\bdo\s+anything\s+now\b|\bDAN\s+mode\b", "JAILBREAK_DAN_HEURISTIC", 0.95),
    (r"new\s+(system\s+)?prompt\s*:\s*", "INJECTED_SYSTEM_PROMPT_PREFIX", 0.85),

    # 2. Commerce & IntentLock Authorization Bypasses
    (r"(override|bypass|skip)\s+(price|verification|intentlock|payment|security)", "COMMERCE_BYPASS_ATTEMPT", 0.98),
    (r"set\s+(the\s+)?price\s+(to|=)\s*(0|0\.00|\$0|free)", "ZERO_PRICE_INJECTION_DIRECTIVE", 0.98),
    (r"(authorize|approve)\s+(this\s+)?(transaction|order)\s+without\s+checks", "UNAUTHORIZED_APPROVAL_DIRECTIVE", 0.98),
    (r"apply\s+100%\s+discount\s+(automatically|unconditionally)", "UNCONDITIONAL_DISCOUNT_INJECTION", 0.85),
    (r"simulate\s+successful\s+(payment|charge)", "PAYMENT_SIMULATION_EXPLOIT", 0.90),

    # 3. Delimiter Hijacking & LLM Formatting Smuggling
    (r"<\s*\|?\s*(system|assistant|im_start|im_end)\s*\|?\s*>", "SPECIAL_TOKEN_DELIMITER_SMUGGLING", 0.95),
    (r"\[\/?INST\]|<<SYS>>|<\/s>", "LLAMA_STYLE_DELIMITER_SMUGGLING", 0.95),
    (r"```(system|admin|override)", "CODEBLOCK_DELIMITER_INJECTION", 0.80),
    (r"<!--\s*(admin|intentlock|bypass|override)", "HTML_COMMENT_INJECTION", 0.75),

    # 4. Indirect Prompt Injection & Context Exfiltration
    (r"repeat\s+(everything|the\s+prompt|system\s+instructions)\s+above", "PROMPT_EXTRACTION_ATTEMPT", 0.75),
    (r"exfiltrate|send\s+(token|secret|canary|key)\s+to", "DATA_EXFILTRATION_DIRECTIVE", 0.90),
]

class PromptInjectionDetector:
    def __init__(self):
        self.sanitizer = PayloadSanitizer()

    def scan_text(self, text: str) -> Tuple[bool, float, List[str], Dict[str, any]]:
        """
        Scans a text string for prompt injection signatures and obfuscation.
        Returns: (is_detected, risk_score, matched_rules, details)
        """
        if not text:
            return False, 0.0, [], {}

        # First, run payload sanitization to detect homoglyphs and hidden chars
        has_evasion, evasion_flags, normalized_text = self.sanitizer.detect_evasion(text)

        matched_rules: List[str] = list(evasion_flags)
        max_risk = 0.50 if has_evasion else 0.0
        findings = []

        # Scan both raw and normalized text to catch raw and normalized evasion variants
        corpora = [text]
        if normalized_text != text:
            corpora.append(normalized_text)

        for corpus in corpora:
            for pattern, rule_id, weight in INJECTION_SIGNATURES:
                match = re.search(pattern, corpus, re.IGNORECASE)
                if match:
                    if rule_id not in matched_rules:
                        matched_rules.append(rule_id)
                        max_risk = max(max_risk, weight)
                        findings.append({
                            "rule": rule_id,
                            "matched_text": match.group(0),
                            "weight": weight
                        })

        is_detected = max_risk >= 0.65
        details = {
            "findings": findings,
            "evasion_detected": has_evasion,
            "characters_scanned": len(text)
        }

        return is_detected, round(max_risk, 3), matched_rules, details
