"""
Tests for Workstream 2: Hidden Cost & Subscription Guard
"""

import unittest
from intentlock.core.models import CartItem, CostBreakdown, SubscriptionTerms
from intentlock.workstream2_hidden_costs.fee_detector import FeeDetector
from intentlock.workstream2_hidden_costs.subscription_guard import SubscriptionGuard

class TestWorkstream2(unittest.TestCase):
    def setUp(self):
        self.fee_detector = FeeDetector()
        self.subscription_guard = SubscriptionGuard()

    def test_clean_costs_pass(self):
        costs = CostBreakdown(
            subtotal=100.0,
            tax=8.0,
            shipping=5.0,
            service_fee=0.0,
            regulatory_fee=0.0,
            total_charged=113.0
        )
        verdict = self.fee_detector.detect(costs)
        self.assertTrue(verdict.passed)
        self.assertLess(verdict.risk_score, 0.40)

    def test_drip_pricing_detected(self):
        # Hidden service fee of 25 on 50 subtotal (50% fee ratio!)
        costs = CostBreakdown(
            subtotal=50.0,
            service_fee=25.0,
            total_charged=75.0
        )
        verdict = self.fee_detector.detect(costs)
        self.assertFalse(verdict.passed)
        self.assertIn("CRITICAL_DRIP_PRICING_DETECTED", verdict.flags)

    def test_deceptive_junk_fee_descriptor_flagged(self):
        costs = CostBreakdown(
            subtotal=100.0,
            service_fee=10.0,
            itemized_fees={"Convenience Fee": 5.0, "Platform Maintenance Fee": 5.0},
            total_charged=110.0
        )
        verdict = self.fee_detector.detect(costs)
        self.assertIn("DECEPTIVE_JUNK_FEE_DESCRIPTOR", verdict.flags)

    def test_covert_subscription_trap_detected(self):
        items = [
            CartItem(
                item_id="SUB_TRAP",
                name="VIP Membership - Auto-renews monthly",
                sku="VIP-01",
                unit_price=9.99
            )
        ]
        # Merchant marked subscription as False to trick user
        subscription = SubscriptionTerms(is_subscription=False)
        verdict = self.subscription_guard.evaluate(items, subscription)
        self.assertFalse(verdict.passed)
        self.assertIn("COVERT_SUBSCRIPTION_TRAP_DETECTED", verdict.flags)
        self.assertGreaterEqual(verdict.risk_score, 0.85)

    def test_unauthorized_subscription_missing_opt_in(self):
        items = [CartItem(item_id="1", name="Software Suite", sku="SW-1", unit_price=49.0)]
        subscription = SubscriptionTerms(
            is_subscription=True,
            billing_interval="monthly",
            auto_renews=True,
            explicit_opt_in=False,  # Sneaky pre-checked opt-in
            renewal_price=49.0
        )
        verdict = self.subscription_guard.evaluate(items, subscription)
        self.assertFalse(verdict.passed)
        self.assertIn("UNAUTHORIZED_SUBSCRIPTION_NO_EXPLICIT_OPT_IN", verdict.flags)

if __name__ == "__main__":
    unittest.main()
