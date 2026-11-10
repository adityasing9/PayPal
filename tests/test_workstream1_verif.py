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

if __name__ == "__main__":
    unittest.main()
