"""
Shared Test Fixtures and Payload Factories - Workstream 6
"""

import pytest
import time
import uuid
from intentlock.core.models import (
    IntentPayload, MerchantInfo, CartItem, CostBreakdown, SubscriptionTerms
)
from intentlock.engine import IntentLockEngine

@pytest.fixture
def clean_merchant() -> MerchantInfo:
    return MerchantInfo(
        merchant_id="MERCH_001",
        name="Official PayPal Electronics",
        domain="store.google.com",
        is_verified=True,
        reputation_score=0.98
    )

@pytest.fixture
def clean_items() -> list:
    return [
        CartItem(
            item_id="ITEM_1",
            name="Mechanical Keyboard",
            sku="KB-001",
            unit_price=100.0,
            quantity=1,
            catalog_baseline_price=100.0,
            category="electronics"
        )
    ]

@pytest.fixture
def clean_costs() -> CostBreakdown:
    return CostBreakdown(
        subtotal=100.0,
        tax=8.0,
        shipping=5.0,
        service_fee=0.0,
        regulatory_fee=0.0,
        tip=0.0,
        total_charged=113.0,
        currency="USD"
    )

@pytest.fixture
def clean_intent(clean_merchant, clean_items, clean_costs) -> IntentPayload:
    return IntentPayload(
        intent_id=f"INTENT_{uuid.uuid4().hex[:12]}",
        buyer_id="BUYER_12345",
        session_id="SESS_99999",
        merchant=clean_merchant,
        items=clean_items,
        costs=clean_costs,
        subscription=SubscriptionTerms(is_subscription=False),
        timestamp=time.time(),
        raw_prompt_context="Please buy one Mechanical Keyboard for me."
    )

@pytest.fixture
def test_engine(tmp_path) -> IntentLockEngine:
    db_file = str(tmp_path / "test_intentlock.db")
    return IntentLockEngine(db_path=db_file)
