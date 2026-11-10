"""
Fee Detector - Workstream 2
Identifies drip pricing, unannounced service surcharges, and deceptive itemized fees.
"""

from typing import List, Dict
import re
from intentlock.core.models import CostBreakdown, WorkstreamVerdict
from intentlock.core.config import config

DECEPTIVE_FEE_PATTERNS = [
    r"convenience\s*fee",
    r"recovery\s*(fee|surcharge)",
    r"restocking\s*(fee|charge)",
    r"processing\s*(surcharge|add-on)",
    r"platform\s*(maintenance|access)\s*fee",
    r"administrative\s*overhead",
    r"fuel\s*surcharge"
]

class FeeDetector:
    def __init__(self,
                 max_drip_ratio: float = config.MAX_DRIP_FEE_PERCENTAGE,
                 max_service_fee_abs: float = config.MAX_SERVICE_FEE_ABS):
        self.max_drip_ratio = max_drip_ratio
        self.max_service_fee_abs = max_service_fee_abs

    def detect(self, costs: CostBreakdown) -> WorkstreamVerdict:
        flags: List[str] = []
        risk_score = 0.0
        details: Dict[str, any] = {}

        subtotal = max(costs.subtotal, 0.01)
        total_unbundled_fees = costs.service_fee + costs.regulatory_fee

        # 1. Total fee percentage relative to subtotal
        fee_ratio = total_unbundled_fees / subtotal
        details["fee_ratio"] = round(fee_ratio, 4)
        details["total_unbundled_fees"] = round(total_unbundled_fees, 2)

        if fee_ratio > (self.max_drip_ratio * 2):  # E.g. > 16% in hidden fees
            flags.append("CRITICAL_DRIP_PRICING_DETECTED")
            risk_score = max(risk_score, 0.85)
        elif fee_ratio > self.max_drip_ratio:     # E.g. > 8%
            flags.append("ELEVATED_HIDDEN_FEE_RATIO")
            risk_score = max(risk_score, 0.50)

        # 2. Absolute service fee threshold check
        if costs.service_fee > self.max_service_fee_abs:
            flags.append("EXCESSIVE_ABSOLUTE_SERVICE_FEE")
            risk_score = max(risk_score, 0.65)
            details["excessive_service_fee"] = costs.service_fee

        # 3. Itemized fee semantic inspection (looking for junk fee nomenclature)
        flagged_line_items = []
        for fee_name, fee_amt in costs.itemized_fees.items():
            fee_lower = fee_name.lower()
            for pattern in DECEPTIVE_FEE_PATTERNS:
                if re.search(pattern, fee_lower):
                    flags.append("DECEPTIVE_JUNK_FEE_DESCRIPTOR")
                    risk_score = max(risk_score, 0.70)
                    flagged_line_items.append({"fee_name": fee_name, "amount": fee_amt, "pattern": pattern})
                    break

        details["flagged_line_items"] = flagged_line_items

        # 4. Tip percentage sanity check (preventing 50%+ pre-selected tip shock)
        if costs.tip > 0:
            tip_ratio = costs.tip / subtotal
            if tip_ratio > 0.35:
                flags.append("SUSPICIOUS_EXCESSIVE_TIP_INFLATION")
                risk_score = max(risk_score, 0.60)
                details["tip_ratio"] = round(tip_ratio, 2)

        passed = risk_score < 0.70

        return WorkstreamVerdict(
            workstream_name="hidden_cost_detection",
            passed=passed,
            risk_score=round(risk_score, 3),
            flags=flags,
            details=details
        )
