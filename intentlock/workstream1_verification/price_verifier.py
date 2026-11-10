"""
Price Verifier - Workstream 1
Detects pricing anomalies, catalog deviations, negative/zero pricing exploits, and subtotal discrepancies.
"""

from typing import List
from intentlock.core.models import CartItem, CostBreakdown, WorkstreamVerdict
from intentlock.core.config import config

class PriceVerifier:
    def __init__(self,
                 max_deviation_ratio: float = config.MAX_PRICE_DEVIATION_RATIO,
                 critical_deviation_ratio: float = config.CRITICAL_PRICE_DEVIATION_RATIO):
        self.max_deviation_ratio = max_deviation_ratio
        self.critical_deviation_ratio = critical_deviation_ratio

    def verify(self, items: List[CartItem], costs: CostBreakdown) -> WorkstreamVerdict:
        flags: List[str] = []
        risk_score = 0.0
        details = {}
        calculated_subtotal = 0.0

        if not items:
            flags.append("EMPTY_CART_ITEMS")
            return WorkstreamVerdict(
                workstream_name="price_verification",
                passed=False,
                risk_score=0.90,
                flags=flags,
                details={"error": "Cart contains no items"}
            )

        item_anomalies = []

        for item in items:
            # 1. Negative or zero pricing exploit check
            if item.unit_price <= 0:
                flags.append("NON_POSITIVE_PRICE_EXPLOIT")
                risk_score = max(risk_score, 1.0)
                item_anomalies.append({
                    "item_id": item.item_id,
                    "name": item.name,
                    "issue": f"Unit price is {item.unit_price} (<= 0)"
                })

            # 2. Invalid quantity check
            if item.quantity <= 0:
                flags.append("INVALID_QUANTITY_DETECTED")
                risk_score = max(risk_score, 0.90)
                item_anomalies.append({
                    "item_id": item.item_id,
                    "issue": f"Invalid quantity {item.quantity}"
                })
            elif item.quantity > 5000:
                flags.append("EXCESSIVE_QUANTITY_ANOMALY")
                risk_score = max(risk_score, 0.60)

            # 3. Catalog baseline deviation check
            if item.catalog_baseline_price is not None and item.catalog_baseline_price > 0:
                deviation = (item.unit_price - item.catalog_baseline_price) / item.catalog_baseline_price
                if deviation > self.critical_deviation_ratio:
                    flags.append("CRITICAL_PRICE_INFLATION")
                    risk_score = max(risk_score, 0.85)
                    item_anomalies.append({
                        "item_id": item.item_id,
                        "baseline": item.catalog_baseline_price,
                        "actual": item.unit_price,
                        "deviation_pct": round(deviation * 100, 2)
                    })
                elif deviation > self.max_deviation_ratio:
                    flags.append("MODERATE_PRICE_DEVIATION")
                    risk_score = max(risk_score, 0.45)
                    item_anomalies.append({
                        "item_id": item.item_id,
                        "baseline": item.catalog_baseline_price,
                        "actual": item.unit_price,
                        "deviation_pct": round(deviation * 100, 2)
                    })
                elif deviation < -0.85:
                    # 85%+ price crash without promo code verification
                    flags.append("EXTREME_PRICE_UNDERVALUE_SUSPICIOUS")
                    risk_score = max(risk_score, 0.55)

            calculated_subtotal += (item.unit_price * item.quantity)

        # 4. Mathematical consistency of subtotal vs sum of items
        subtotal_difference = abs(calculated_subtotal - costs.subtotal)
        if subtotal_difference > 0.05:  # Allowance for floating point cents
            flags.append("SUBTOTAL_MISMATCH_TAMPERING")
            risk_score = max(risk_score, 0.95)
            details["subtotal_difference"] = round(subtotal_difference, 2)
            details["calculated_subtotal"] = round(calculated_subtotal, 2)
            details["reported_subtotal"] = round(costs.subtotal, 2)

        # 5. Total charged check
        expected_total = (
            costs.subtotal + costs.tax + costs.shipping +
            costs.service_fee + costs.regulatory_fee + costs.tip
        )
        total_difference = abs(expected_total - costs.total_charged)
        if total_difference > 0.05:
            flags.append("TOTAL_CHARGED_ARITHMETIC_MISMATCH")
            risk_score = max(risk_score, 0.95)
            details["expected_total"] = round(expected_total, 2)
            details["reported_total"] = round(costs.total_charged, 2)

        details["item_anomalies"] = item_anomalies
        details["items_checked"] = len(items)
        passed = risk_score < 0.70

        return WorkstreamVerdict(
            workstream_name="price_verification",
            passed=passed,
            risk_score=round(risk_score, 3),
            flags=flags,
            details=details
        )
