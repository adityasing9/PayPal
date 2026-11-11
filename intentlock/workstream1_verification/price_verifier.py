"""
Price Verifier - Workstream 1
Detects pricing anomalies, catalog deviations, negative/zero pricing exploits, and subtotal discrepancies.
"""

from typing import List, Dict, Any, Optional
import json
import os
from intentlock.core.models import CartItem, CostBreakdown, WorkstreamVerdict
from intentlock.core.config import config, find_project_path

class PriceVerifier:
    def __init__(self,
                 max_deviation_ratio: float = config.MAX_PRICE_DEVIATION_RATIO,
                 critical_deviation_ratio: float = config.CRITICAL_PRICE_DEVIATION_RATIO,
                 catalog_fixture_path: Optional[str] = None):
        self.max_deviation_ratio = max_deviation_ratio
        self.critical_deviation_ratio = critical_deviation_ratio
        self.catalog_fixture = self._load_catalog_fixture(catalog_fixture_path)

    def _load_catalog_fixture(self, custom_path: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
        """Loads authoritative catalog baseline data from catalog fixture."""
        fixture_path = custom_path or find_project_path("data/catalog_fixture.json")
        if not fixture_path or not os.path.isfile(fixture_path):
            return {}
        try:
            with open(fixture_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            catalog = {}
            for prod in data:
                ext_id = prod.get("externalId")
                if ext_id and "basePriceMinor" in prod:
                    base_minor = int(prod["basePriceMinor"])
                    catalog[ext_id] = {
                        "price": base_minor / 100.0,
                        "currency": str(prod.get("currency", "USD")).upper(),
                        "title": prod.get("title", "")
                    }
            return catalog
        except Exception:
            return {}

    def _get_catalog_product(self, identifier: Optional[str]) -> Optional[Dict[str, Any]]:
        if not identifier or not self.catalog_fixture:
            return None
        return self.catalog_fixture.get(identifier)

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

        # 0. Validate cost components are non-negative
        for cost_attr in ("subtotal", "tax", "shipping", "service_fee", "regulatory_fee", "tip", "discount", "total_charged"):
            val = getattr(costs, cost_attr, 0.0)
            if val < 0:
                flags.append("NEGATIVE_COST_COMPONENT_EXPLOIT")
                risk_score = max(risk_score, 1.0)
                details[f"negative_{cost_attr}"] = val

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

            # 3. Trusted Price Baseline checks
            # 3a. Baseline price non-positive exploit (<= 0)
            if item.catalog_baseline_price is not None and item.catalog_baseline_price <= 0:
                flags.append("NON_POSITIVE_BASELINE_EXPLOIT")
                risk_score = max(risk_score, 0.95)
                item_anomalies.append({
                    "item_id": item.item_id,
                    "issue": f"Baseline price is {item.catalog_baseline_price} (<= 0)"
                })

            # 3b. Missing baseline when item claims baseline verification
            claims_baseline = (
                item.metadata.get("catalog_verified") is True or
                item.metadata.get("requires_baseline") is True or
                item.metadata.get("verified_baseline") is True
            )
            if claims_baseline and item.catalog_baseline_price is None:
                flags.append("MISSING_CLAIMED_BASELINE_PRICE")
                risk_score = max(risk_score, 0.85)
                item_anomalies.append({
                    "item_id": item.item_id,
                    "issue": "Item claims catalog verification but missing catalog_baseline_price"
                })

            # 3c. Authoritative catalog fixture cross-check
            catalog_match = self._get_catalog_product(item.sku) or self._get_catalog_product(item.item_id)
            effective_baseline = item.catalog_baseline_price

            if catalog_match:
                authoritative_price = catalog_match["price"]
                # Detect tampering with the provided baseline against authoritative catalog fixture
                if item.catalog_baseline_price is not None and abs(item.catalog_baseline_price - authoritative_price) > 0.05:
                    flags.append("CATALOG_BASELINE_TAMPERING_DETECTED")
                    risk_score = max(risk_score, 0.95)
                    item_anomalies.append({
                        "item_id": item.item_id,
                        "baseline_reported": item.catalog_baseline_price,
                        "authoritative_baseline": authoritative_price,
                        "issue": "Reported baseline differs from authoritative catalog fixture"
                    })
                if effective_baseline is None:
                    effective_baseline = authoritative_price

                # Check currency against catalog fixture
                cat_curr = catalog_match.get("currency", "USD")
                if cat_curr != costs.currency.strip().upper():
                    flags.append("CATALOG_CURRENCY_MISMATCH")
                    risk_score = max(risk_score, 0.90)

            # 3d. Baseline deviation check against effective baseline
            if effective_baseline is not None and effective_baseline > 0:
                deviation = (item.unit_price - effective_baseline) / effective_baseline
                if deviation > self.critical_deviation_ratio:
                    flags.append("CRITICAL_PRICE_INFLATION")
                    risk_score = max(risk_score, 0.85)
                    item_anomalies.append({
                        "item_id": item.item_id,
                        "baseline": effective_baseline,
                        "actual": item.unit_price,
                        "deviation_pct": round(deviation * 100, 2)
                    })
                elif deviation > self.max_deviation_ratio:
                    flags.append("MODERATE_PRICE_DEVIATION")
                    risk_score = max(risk_score, 0.45)
                    item_anomalies.append({
                        "item_id": item.item_id,
                        "baseline": effective_baseline,
                        "actual": item.unit_price,
                        "deviation_pct": round(deviation * 100, 2)
                    })
                elif deviation < -0.85:
                    # 85%+ price crash without promo code verification
                    flags.append("EXTREME_PRICE_UNDERVALUE_SUSPICIOUS")
                    risk_score = max(risk_score, 0.55)

            # 3e. Currency mismatch between item metadata and cost breakdown
            if item.metadata and "currency" in item.metadata:
                item_curr = str(item.metadata["currency"]).strip().upper()
                costs_curr = costs.currency.strip().upper()
                if item_curr != costs_curr:
                    flags.append("CURRENCY_MISMATCH_DETECTED")
                    risk_score = max(risk_score, 0.95)
                    item_anomalies.append({
                        "item_id": item.item_id,
                        "item_currency": item_curr,
                        "costs_currency": costs_curr,
                        "issue": f"Item currency '{item_curr}' mismatches costs currency '{costs_curr}'"
                    })

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
            costs.service_fee + costs.regulatory_fee + costs.tip - costs.discount
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
