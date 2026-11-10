"""
Subscription Guard - Workstream 2
Guards against deceptive recurring billing, negative-option trial traps, and hidden subscriptions.
"""

from typing import List
import re
from intentlock.core.models import CartItem, SubscriptionTerms, WorkstreamVerdict

# Keywords signalling recurring billing commitments in item titles or metadata
RECURRING_KEYWORDS = [
    r"\bmonthly\b", r"\bannual(ly)?\b", r"\brecurring\b", r"\bauto-?renew\b",
    r"\bmembership\b", r"\bsubscription\b", r"\bbilled\s+(every|each|monthly)\b",
    r"\bfree\s+trial\b", r"\btrial\s+period\b", r"\brenews\s+at\b", r"\bvip\s+pass\b"
]

class SubscriptionGuard:
    def __init__(self, require_explicit_opt_in: bool = True):
        self.require_explicit_opt_in = require_explicit_opt_in

    def evaluate(self, items: List[CartItem], subscription: SubscriptionTerms) -> WorkstreamVerdict:
        flags: List[str] = []
        risk_score = 0.0
        details = {}
        covert_matches = []

        # 1. Check item text for covert/unflagged subscriptions
        for item in items:
            text_corpus = f"{item.name} {item.category} {item.metadata}".lower()
            for pattern in RECURRING_KEYWORDS:
                if re.search(pattern, text_corpus):
                    covert_matches.append({"item_id": item.item_id, "pattern": pattern, "item_name": item.name})

        # 2. Covert subscription trap: items contain recurring keywords, but subscription is marked False
        if covert_matches and not subscription.is_subscription:
            flags.append("COVERT_SUBSCRIPTION_TRAP_DETECTED")
            risk_score = max(risk_score, 0.90)
            details["covert_subscription_matches"] = covert_matches

        # 3. Explicit subscription checks
        if subscription.is_subscription:
            details["subscription_declared"] = True
            details["interval"] = subscription.billing_interval
            details["renewal_price"] = subscription.renewal_price

            # Enforce buyer explicit opt-in (pre-checked checkboxes prohibited)
            if self.require_explicit_opt_in and not subscription.explicit_opt_in:
                flags.append("UNAUTHORIZED_SUBSCRIPTION_NO_EXPLICIT_OPT_IN")
                risk_score = max(risk_score, 0.95)
                details["opt_in_violation"] = "Explicit buyer opt-in consent is missing"

            # Deceptive trial trap: 0-dollar or low trial that auto-renews at high price without clear disclosure
            if subscription.trial_period_days > 0 and subscription.auto_renews:
                if subscription.trial_period_days < 7 and subscription.renewal_price > 49.0:
                    flags.append("HIGH_RISK_SHORT_TRIAL_EXPENSIVE_RENEWAL")
                    risk_score = max(risk_score, 0.75)
                    details["trial_warning"] = (
                        f"Short trial ({subscription.trial_period_days} days) "
                        f"renews automatically at ${subscription.renewal_price}"
                    )

            # Auto-renew without valid interval
            if subscription.auto_renews and subscription.billing_interval not in {"weekly", "monthly", "yearly", "quarterly"}:
                flags.append("AMBIGUOUS_RECURRING_INTERVAL")
                risk_score = max(risk_score, 0.70)
                details["interval_error"] = f"Unrecognized billing interval: {subscription.billing_interval}"

        passed = risk_score < 0.70

        return WorkstreamVerdict(
            workstream_name="subscription_guard",
            passed=passed,
            risk_score=round(risk_score, 3),
            flags=flags,
            details=details
        )
