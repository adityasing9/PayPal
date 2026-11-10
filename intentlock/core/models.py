"""
Core data models and domain entities for IntentLock.
Pure dataclasses with dict serialization to guarantee zero serialization malleability.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
import time
import uuid

@dataclass
class CartItem:
    item_id: str
    name: str
    sku: str
    unit_price: float
    quantity: int = 1
    catalog_baseline_price: Optional[float] = None
    category: str = "general"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CartItem":
        return cls(
            item_id=str(data.get("item_id", str(uuid.uuid4())[:8])),
            name=str(data.get("name", "Unknown Item")),
            sku=str(data.get("sku", "")),
            unit_price=float(data.get("unit_price", 0.0)),
            quantity=int(data.get("quantity", 1)),
            catalog_baseline_price=float(data["catalog_baseline_price"]) if data.get("catalog_baseline_price") is not None else None,
            category=str(data.get("category", "general")),
            metadata=data.get("metadata", {})
        )


@dataclass
class MerchantInfo:
    merchant_id: str
    name: str
    domain: str
    is_verified: bool = True
    reputation_score: float = 0.95
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MerchantInfo":
        return cls(
            merchant_id=str(data.get("merchant_id", "")),
            name=str(data.get("name", "Unknown Merchant")),
            domain=str(data.get("domain", "")),
            is_verified=bool(data.get("is_verified", True)),
            reputation_score=float(data.get("reputation_score", 0.95)),
            metadata=data.get("metadata", {})
        )


@dataclass
class CostBreakdown:
    subtotal: float
    tax: float = 0.0
    shipping: float = 0.0
    service_fee: float = 0.0
    regulatory_fee: float = 0.0
    tip: float = 0.0
    total_charged: float = 0.0
    currency: str = "USD"
    itemized_fees: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CostBreakdown":
        return cls(
            subtotal=float(data.get("subtotal", 0.0)),
            tax=float(data.get("tax", 0.0)),
            shipping=float(data.get("shipping", 0.0)),
            service_fee=float(data.get("service_fee", 0.0)),
            regulatory_fee=float(data.get("regulatory_fee", 0.0)),
            tip=float(data.get("tip", 0.0)),
            total_charged=float(data.get("total_charged", 0.0)),
            currency=str(data.get("currency", "USD")),
            itemized_fees=data.get("itemized_fees", {})
        )


@dataclass
class SubscriptionTerms:
    is_subscription: bool = False
    billing_interval: str = "none"  # "monthly", "yearly", "weekly", "none"
    trial_period_days: int = 0
    auto_renews: bool = False
    explicit_opt_in: bool = False
    renewal_price: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SubscriptionTerms":
        return cls(
            is_subscription=bool(data.get("is_subscription", False)),
            billing_interval=str(data.get("billing_interval", "none")),
            trial_period_days=int(data.get("trial_period_days", 0)),
            auto_renews=bool(data.get("auto_renews", False)),
            explicit_opt_in=bool(data.get("explicit_opt_in", False)),
            renewal_price=float(data.get("renewal_price", 0.0))
        )


@dataclass
class IntentPayload:
    intent_id: str
    buyer_id: str
    session_id: str
    merchant: MerchantInfo
    items: List[CartItem]
    costs: CostBreakdown
    subscription: SubscriptionTerms = field(default_factory=SubscriptionTerms)
    timestamp: float = field(default_factory=time.time)
    raw_prompt_context: Optional[str] = None
    promo_codes: List[str] = field(default_factory=list)
    canary_token: Optional[str] = None
    user_notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent_id": self.intent_id,
            "buyer_id": self.buyer_id,
            "session_id": self.session_id,
            "merchant": self.merchant.to_dict(),
            "items": [item.to_dict() for item in self.items],
            "costs": self.costs.to_dict(),
            "subscription": self.subscription.to_dict(),
            "timestamp": self.timestamp,
            "raw_prompt_context": self.raw_prompt_context,
            "promo_codes": self.promo_codes,
            "canary_token": self.canary_token,
            "user_notes": self.user_notes
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "IntentPayload":
        return cls(
            intent_id=str(data.get("intent_id", str(uuid.uuid4()))),
            buyer_id=str(data.get("buyer_id", "anonymous")),
            session_id=str(data.get("session_id", str(uuid.uuid4()))),
            merchant=MerchantInfo.from_dict(data.get("merchant", {})),
            items=[CartItem.from_dict(i) for i in data.get("items", [])],
            costs=CostBreakdown.from_dict(data.get("costs", {})),
            subscription=SubscriptionTerms.from_dict(data.get("subscription", {})),
            timestamp=float(data.get("timestamp", time.time())),
            raw_prompt_context=data.get("raw_prompt_context"),
            promo_codes=data.get("promo_codes", []),
            canary_token=data.get("canary_token"),
            user_notes=data.get("user_notes")
        )


@dataclass
class WorkstreamVerdict:
    workstream_name: str
    passed: bool
    risk_score: float  # 0.0 (clean) to 1.0 (malicious/critical)
    flags: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AggregatedSecurityVerdict:
    intent_id: str
    is_authorized: bool
    requires_challenge: bool
    overall_risk_score: float
    verdicts: Dict[str, WorkstreamVerdict]
    reasons: List[str]
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent_id": self.intent_id,
            "is_authorized": self.is_authorized,
            "requires_challenge": self.requires_challenge,
            "overall_risk_score": self.overall_risk_score,
            "verdicts": {k: v.to_dict() for k, v in self.verdicts.items()},
            "reasons": self.reasons,
            "timestamp": self.timestamp
        }


@dataclass
class SignedAuthorizationToken:
    token_id: str
    intent_id: str
    intent_hash: str
    issued_at: float
    expires_at: float
    nonce: str
    signature: str
    public_key: str
    algorithm: str = "Ed25519"
    compact_token: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
