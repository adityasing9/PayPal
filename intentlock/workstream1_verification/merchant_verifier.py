"""
Merchant Verifier - Workstream 1
Validates merchant identity, domain legitimacy, reputation scores, and typosquatting attacks.
"""

from typing import List, Tuple
import re
from intentlock.core.models import MerchantInfo, WorkstreamVerdict

# Suspicious TLDs frequently abused in commerce phishing
SUSPICIOUS_TLDS = {".zip", ".mov", ".top", ".tk", ".ml", ".ga", ".cf", ".gq"}

# Known typosquatting pattern signatures targeting major payment/retail brands
KNOWN_BRAND_TYPOS = [
    r"paypa[l1i]\b", r"p[a@]ypal", r"amaz[o0]n", r"app[l1]e-pay", r"eb[a@]y", r"wa[l1]mart"
]

# Trusted merchant whitelist (high baseline trust)
TRUSTED_MERCHANTS = {
    "paypal.com", "store.google.com", "apple.com", "amazon.com", "ebay.com", "walmart.com", "target.com"
}

class MerchantVerifier:
    def __init__(self, reputation_threshold: float = 0.65):
        self.reputation_threshold = reputation_threshold

    def verify(self, merchant: MerchantInfo) -> WorkstreamVerdict:
        flags: List[str] = []
        risk_score = 0.0
        details = {}

        domain = merchant.domain.lower().strip()
        name = merchant.name.strip()

        # 1. Domain format sanity check
        if not domain or "." not in domain or " " in domain:
            flags.append("INVALID_DOMAIN_FORMAT")
            risk_score = max(risk_score, 0.90)
            details["domain_error"] = "Domain is empty or malformed"

        # 2. Localhost or private IP spoofing check
        if domain.startswith("localhost") or domain.startswith("127.") or domain.startswith("192.168."):
            flags.append("PRIVATE_OR_LOCAL_DOMAIN_PROHIBITED")
            risk_score = max(risk_score, 0.95)
            details["spoof_error"] = "Internal network domain detected"

        # 3. Known brand typosquatting / Impersonation check
        for pattern in KNOWN_BRAND_TYPOS:
            if re.search(pattern, domain) and domain not in TRUSTED_MERCHANTS:
                flags.append("BRAND_TYPOSQUATTING_DETECTED")
                risk_score = max(risk_score, 0.95)
                details["typosquat_pattern"] = pattern
                break

        # 4. Suspicious TLD check
        for tld in SUSPICIOUS_TLDS:
            if domain.endswith(tld):
                flags.append("HIGH_RISK_TLD")
                risk_score = max(risk_score, 0.60)
                details["tld_flagged"] = tld
                break

        # 5. Reputation score verification
        if merchant.reputation_score < self.reputation_threshold:
            flags.append("LOW_MERCHANT_REPUTATION")
            # Proportional risk increase based on score deficit
            deficit = (self.reputation_threshold - merchant.reputation_score) / self.reputation_threshold
            risk_score = max(risk_score, 0.50 + (deficit * 0.45))
            details["reputation_score"] = merchant.reputation_score

        # 6. Unverified merchant penalty
        if not merchant.is_verified:
            flags.append("MERCHANT_NOT_VERIFIED")
            risk_score = max(risk_score, 0.45)
            details["verified_status"] = False
        else:
            details["verified_status"] = True

        passed = risk_score < 0.70
        details["final_merchant_risk"] = risk_score

        return WorkstreamVerdict(
            workstream_name="merchant_verification",
            passed=passed,
            risk_score=round(risk_score, 3),
            flags=flags,
            details=details
        )
