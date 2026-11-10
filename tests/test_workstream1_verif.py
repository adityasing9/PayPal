"""
Tests for Workstream 1: Merchant & Price Verification
"""

import unittest
from intentlock.core.models import MerchantInfo, CartItem, CostBreakdown
from intentlock.workstream1_verification.merchant_verifier import MerchantVerifier
from intentlock.workstream1_verification.price_verifier import PriceVerifier

class TestWorkstream1(unittest.TestCase):
    def setUp(self):
        self.merchant_verifier = MerchantVerifier()
        self.price_verifier = PriceVerifier()

    def test_valid_merchant_passes(self):
        merchant = MerchantInfo(
            merchant_id="M1",
            name="Google Store",
            domain="store.google.com",
            is_verified=True,
            reputation_score=0.98
        )
        verdict = self.merchant_verifier.verify(merchant)
        self.assertTrue(verdict.passed)
        self.assertLess(verdict.risk_score, 0.40)
        self.assertEqual(len(verdict.flags), 0)

    def test_brand_typosquatting_detected(self):
        # Impersonating PayPal
        bad_merchant = MerchantInfo(
            merchant_id="M_FAKE",
            name="Paypal Customer Clearance",
            domain="paypa1-checkout.com",
            is_verified=False,
            reputation_score=0.20
        )
        verdict = self.merchant_verifier.verify(bad_merchant)
        self.assertFalse(verdict.passed)
        self.assertIn("BRAND_TYPOSQUATTING_DETECTED", verdict.flags)
        self.assertGreaterEqual(verdict.risk_score, 0.85)

    def test_internal_ip_spoofing_blocked(self):
        bad_merchant = MerchantInfo(
            merchant_id="M_LOCAL",
            name="Hacker Host",
            domain="localhost:8080",
            is_verified=False,
            reputation_score=0.10
        )
        verdict = self.merchant_verifier.verify(bad_merchant)
        self.assertFalse(verdict.passed)
        self.assertIn("PRIVATE_OR_LOCAL_DOMAIN_PROHIBITED", verdict.flags)

    def test_non_positive_price_exploit_rejected(self):
        items = [
            CartItem(
                item_id="EXPLOIT_1",
                name="Laptop",
                sku="LP-001",
                unit_price=0.0,  # Zero-dollar exploit
                quantity=1
            )
        ]
        costs = CostBreakdown(subtotal=0.0, total_charged=0.0)
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("NON_POSITIVE_PRICE_EXPLOIT", verdict.flags)
        self.assertEqual(verdict.risk_score, 1.0)

    def test_critical_price_inflation_rejected(self):
        items = [
            CartItem(
                item_id="INFLATED_1",
                name="Hand Sanitizer",
                sku="HS-001",
                unit_price=50.0,
                quantity=1,
                catalog_baseline_price=10.0  # 400% inflation
            )
        ]
        costs = CostBreakdown(subtotal=50.0, total_charged=50.0)
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("CRITICAL_PRICE_INFLATION", verdict.flags)
        self.assertGreaterEqual(verdict.risk_score, 0.80)

    def test_subtotal_mismatch_detected(self):
        items = [
            CartItem(item_id="1", name="Book", sku="BK", unit_price=20.0, quantity=2)  # Should be 40.0
        ]
        costs = CostBreakdown(subtotal=10.0, total_charged=10.0)  # Tampered subtotal
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("SUBTOTAL_MISMATCH_TAMPERING", verdict.flags)

    def test_non_positive_baseline_price_rejected(self):
        """Attacker supplies baseline price <= 0 to tamper with price deviation formulas."""
        items = [
            CartItem(
                item_id="BASELINE_ATTACK",
                name="Gaming Headset",
                sku="GH-01",
                unit_price=80.0,
                quantity=1,
                catalog_baseline_price=0.0  # Exploit: zero baseline
            )
        ]
        costs = CostBreakdown(subtotal=80.0, total_charged=80.0)
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("NON_POSITIVE_BASELINE_EXPLOIT", verdict.flags)
        self.assertGreaterEqual(verdict.risk_score, 0.90)

    def test_missing_claimed_baseline_price_flagged(self):
        """Item claims to be verified against catalog baseline but omits the baseline price."""
        items = [
            CartItem(
                item_id="UNVERIFIED_CLAIM",
                name="Mechanical Keyboard",
                sku="MK-01",
                unit_price=120.0,
                quantity=1,
                catalog_baseline_price=None,
                metadata={"catalog_verified": True}
            )
        ]
        costs = CostBreakdown(subtotal=120.0, total_charged=120.0)
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("MISSING_CLAIMED_BASELINE_PRICE", verdict.flags)

    def test_catalog_fixture_baseline_tampering_detected(self):
        """Attacker tampers with reported baseline for an authoritative catalog product."""
        # prod_k2_pro has authoritative price $99.00 in catalog_fixture.json
        items = [
            CartItem(
                item_id="prod_k2_pro",
                name="Keychron K2 Pro Wireless Mechanical Keyboard",
                sku="prod_k2_pro",
                unit_price=99.0,
                quantity=1,
                catalog_baseline_price=49.0  # False baseline claimed by rogue seller
            )
        ]
        costs = CostBreakdown(subtotal=99.0, total_charged=99.0)
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("CATALOG_BASELINE_TAMPERING_DETECTED", verdict.flags)
        self.assertGreaterEqual(verdict.risk_score, 0.90)

    def test_item_currency_mismatch_detected(self):
        """Item specifies a different currency in metadata than the cost breakdown."""
        items = [
            CartItem(
                item_id="CURR_MISMATCH_1",
                name="Imported Camera",
                sku="CAM-EUR",
                unit_price=100.0,
                quantity=1,
                metadata={"currency": "EUR"}
            )
        ]
        costs = CostBreakdown(subtotal=100.0, total_charged=100.0, currency="USD")
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("CURRENCY_MISMATCH_DETECTED", verdict.flags)
        self.assertGreaterEqual(verdict.risk_score, 0.90)

    def test_negative_cost_component_rejected(self):
        """Exploit: negative fee or shipping attempting to artificially lower total charge."""
        items = [
            CartItem(item_id="1", name="Shirt", sku="SH-1", unit_price=30.0, quantity=1)
        ]
        costs = CostBreakdown(subtotal=30.0, shipping=-10.0, total_charged=20.0)
        verdict = self.price_verifier.verify(items, costs)
        self.assertFalse(verdict.passed)
        self.assertIn("NEGATIVE_COST_COMPONENT_EXPLOIT", verdict.flags)
        self.assertEqual(verdict.risk_score, 1.0)

if __name__ == "__main__":
    unittest.main()
