"""
Threat Scorer - Workstream 3
Aggregates prompt injection, canary validation, and parameter sanitization into a unified verdict.
"""

from typing import List, Dict, Any
from intentlock.core.models import IntentPayload, WorkstreamVerdict
from .prompt_injection import PromptInjectionDetector
from .canary import CanaryTokenManager
from .sanitizer import PayloadSanitizer

class ThreatScorer:
    def __init__(self, canary_manager: CanaryTokenManager = None):
        self.injection_detector = PromptInjectionDetector()
        self.canary_manager = canary_manager or CanaryTokenManager()
        self.sanitizer = PayloadSanitizer()

    def evaluate_intent(self, intent: IntentPayload) -> WorkstreamVerdict:
        flags: List[str] = []
        highest_risk = 0.0
        details: Dict[str, Any] = {"scanned_targets": []}

        # 1. Scan raw_prompt_context if provided
        if intent.raw_prompt_context:
            detected, risk, rules, det = self.injection_detector.scan_text(intent.raw_prompt_context)
            if detected:
                flags.extend(rules)
                highest_risk = max(highest_risk, risk)
            details["scanned_targets"].append({
                "target": "raw_prompt_context",
                "risk": risk,
                "flags": rules
            })

        # 2. Scan user_notes
        if intent.user_notes:
            detected, risk, rules, det = self.injection_detector.scan_text(intent.user_notes)
            if detected:
                flags.extend(rules)
                highest_risk = max(highest_risk, risk)
            details["scanned_targets"].append({
                "target": "user_notes",
                "risk": risk,
                "flags": rules
            })

        # 3. Scan promo_codes (frequent injection vector in checkout agents)
        for promo in intent.promo_codes:
            detected, risk, rules, det = self.injection_detector.scan_text(promo)
            if detected:
                flags.extend(rules)
                highest_risk = max(highest_risk, risk)
            details["scanned_targets"].append({
                "target": f"promo_code:{promo}",
                "risk": risk,
                "flags": rules
            })

        # 4. Scan item names and metadata
        for item in intent.items:
            detected, risk, rules, det = self.injection_detector.scan_text(item.name)
            if detected:
                flags.extend(rules)
                highest_risk = max(highest_risk, risk)

        # 5. Parameter tampering & prototype pollution inspection
        has_tampering, tamper_flags = self.sanitizer.sanitize_dict_parameters(intent.to_dict())
        if has_tampering:
            flags.extend(tamper_flags)
            highest_risk = max(highest_risk, 0.95)

        # 6. Canary token integrity validation
        if intent.canary_token:
            is_valid_canary = self.canary_manager.verify_canary(intent.canary_token, intent.intent_id)
            if not is_valid_canary:
                flags.append("CANARY_TOKEN_INTEGRITY_FAILURE")
                highest_risk = max(highest_risk, 0.90)
                details["canary_status"] = "INVALID_OR_EXPIRED"
            else:
                details["canary_status"] = "VERIFIED_VALID"

        passed = highest_risk < 0.65
        details["final_threat_risk"] = round(highest_risk, 3)

        return WorkstreamVerdict(
            workstream_name="threat_intel_detection",
            passed=passed,
            risk_score=round(highest_risk, 3),
            flags=list(set(flags)),
            details=details
        )
