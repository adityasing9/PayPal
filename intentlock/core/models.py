"""
Core data models and domain entities for IntentLock.
Pure dataclasses with dict serialization to guarantee zero serialization malleability.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
import time
import uuid
import math
from intentlock.core.errors import SchemaValidationError


def _parse_finite_float(val: Any, field_name: str, allow_none: bool = False) -> Optional[float]:
    if val is None:
        if allow_none:
            return None
        raise SchemaValidationError(f"Field '{field_name}' cannot be None")
    try:
        f = float(val)
    except (ValueError, TypeError):
        raise SchemaValidationError(f"Field '{field_name}' must be a valid number, got {type(val).__name__} ({val!r})")
    if math.isnan(f) or math.isinf(f):
        raise SchemaValidationError(f"Field '{field_name}' cannot be NaN or Infinite: {val!r}")
    return f


def _parse_positive_int(val: Any, field_name: str, min_val: int = 1) -> int:
    if val is None:
        raise SchemaValidationError(f"Field '{field_name}' cannot be None")
    try:
        if isinstance(val, float) and not val.is_integer():
            raise ValueError()
        i = int(val)
    except (ValueError, TypeError):
        raise SchemaValidationError(f"Field '{field_name}' must be an integer, got {type(val).__name__} ({val!r})")
    if i < min_val:
        raise SchemaValidationError(f"Field '{field_name}' must be >= {min_val}, got {i}")
    return i


def _parse_non_empty_str(val: Any, field_name: str) -> str:
    if val is None or not isinstance(val, str) or not val.strip():
        raise SchemaValidationError(f"Field '{field_name}' must be a non-empty string, got {val!r}")
    return val.strip()


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
        if not isinstance(data, dict):
            raise SchemaValidationError(f"CartItem data must be a dictionary, got {type(data).__name__}")

        item_id = str(data.get("item_id", "")).strip() or str(data.get("sku", "")).strip() or str(uuid.uuid4())[:8]
        name = _parse_non_empty_str(data.get("name", "Unknown Item"), "name")
        sku = str(data.get("sku", "")).strip() or item_id

        if "unit_price" not in data or data["unit_price"] is None:
            raise SchemaValidationError("CartItem missing required field 'unit_price'")
        unit_price = _parse_finite_float(data["unit_price"], "unit_price")

        # Quantity must be >= 1 (rejects negative or zero quantities at schema parse time)
        quantity = _parse_positive_int(data.get("quantity", 1), "quantity", min_val=1)

        baseline_raw = data.get("catalog_baseline_price")
        catalog_baseline_price = _parse_finite_float(baseline_raw, "catalog_baseline_price", allow_none=True)

        return cls(
            item_id=item_id,
            name=name,
            sku=sku,
            unit_price=unit_price,
            quantity=quantity,
            catalog_baseline_price=catalog_baseline_price,
            category=str(data.get("category", "general")),
            metadata=data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {}
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
        if not isinstance(data, dict):
            raise SchemaValidationError(f"MerchantInfo data must be a dictionary, got {type(data).__name__}")
        merchant_id = str(data.get("merchant_id", "")).strip() or "UNKNOWN_MERCHANT"
        name = str(data.get("name", "Unknown Merchant")).strip()
        domain = str(data.get("domain", "")).strip()
        reputation = _parse_finite_float(data.get("reputation_score", 0.95), "reputation_score")
        if not (0.0 <= reputation <= 1.0):
            raise SchemaValidationError(f"reputation_score must be between 0.0 and 1.0, got {reputation}")
        return cls(
            merchant_id=merchant_id,
            name=name,
            domain=domain,
            is_verified=bool(data.get("is_verified", True)),
            reputation_score=reputation,
            metadata=data.get("metadata", {}) if isinstance(data.get("metadata"), dict) else {}
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
        if not isinstance(data, dict):
            raise SchemaValidationError(f"CostBreakdown data must be a dictionary, got {type(data).__name__}")

        if "subtotal" not in data or data["subtotal"] is None:
            raise SchemaValidationError("CostBreakdown missing required field 'subtotal'")
        if "total_charged" not in data or data["total_charged"] is None:
            raise SchemaValidationError("CostBreakdown missing required field 'total_charged'")

        subtotal = _parse_finite_float(data["subtotal"], "subtotal")
        total_charged = _parse_finite_float(data["total_charged"], "total_charged")

        if subtotal < 0:
            raise SchemaValidationError(f"Negative subtotal is not permitted: {subtotal}")
        if total_charged < 0:
            raise SchemaValidationError(f"Negative total_charged is not permitted: {total_charged}")

        tax = _parse_finite_float(data.get("tax", 0.0), "tax")
        shipping = _parse_finite_float(data.get("shipping", 0.0), "shipping")
        service_fee = _parse_finite_float(data.get("service_fee", 0.0), "service_fee")
        regulatory_fee = _parse_finite_float(data.get("regulatory_fee", 0.0), "regulatory_fee")
        tip = _parse_finite_float(data.get("tip", 0.0), "tip")

        for f_name, f_val in [("tax", tax), ("shipping", shipping), ("service_fee", service_fee), ("regulatory_fee", regulatory_fee), ("tip", tip)]:
            if f_val < 0:
                raise SchemaValidationError(f"Negative cost component '{f_name}' is not permitted: {f_val}")

        currency = str(data.get("currency", "USD")).strip().upper()
        if not currency or len(currency) != 3 or not currency.isalpha():
            raise SchemaValidationError(f"Invalid ISO-4217 currency code: {currency!r}")

        itemized_fees = data.get("itemized_fees", {})
        if not isinstance(itemized_fees, dict):
            raise SchemaValidationError("itemized_fees must be a dictionary")
        for fee_key, fee_val in itemized_fees.items():
            parsed_fee = _parse_finite_float(fee_val, f"itemized_fee.{fee_key}")
            if parsed_fee < 0:
                raise SchemaValidationError(f"Itemized fee '{fee_key}' cannot be negative: {parsed_fee}")

        return cls(
            subtotal=subtotal,
            tax=tax,
            shipping=shipping,
            service_fee=service_fee,
            regulatory_fee=regulatory_fee,
            tip=tip,
            total_charged=total_charged,
            currency=currency,
            itemized_fees=itemized_fees
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
        if not isinstance(data, dict):
            raise SchemaValidationError(f"SubscriptionTerms data must be a dictionary, got {type(data).__name__}")
        billing_interval = str(data.get("billing_interval", "none")).strip().lower()
        valid_intervals = {"none", "weekly", "monthly", "quarterly", "yearly"}
        if billing_interval not in valid_intervals:
            raise SchemaValidationError(f"Invalid billing_interval '{billing_interval}'. Expected one of {valid_intervals}")
        trial_period_days = _parse_positive_int(data.get("trial_period_days", 0), "trial_period_days", min_val=0)
        renewal_price = _parse_finite_float(data.get("renewal_price", 0.0), "renewal_price")
        if renewal_price < 0:
            raise SchemaValidationError(f"renewal_price cannot be negative: {renewal_price}")
        return cls(
            is_subscription=bool(data.get("is_subscription", False)),
            billing_interval=billing_interval,
            trial_period_days=trial_period_days,
            auto_renews=bool(data.get("auto_renews", False)),
            explicit_opt_in=bool(data.get("explicit_opt_in", False)),
            renewal_price=renewal_price
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
        if not isinstance(data, dict):
            raise SchemaValidationError(f"IntentPayload data must be a dictionary, got {type(data).__name__}")

        if "merchant" not in data or not isinstance(data["merchant"], dict):
            raise SchemaValidationError("Intent payload missing required 'merchant' dictionary")
        if "costs" not in data or not isinstance(data["costs"], dict):
            raise SchemaValidationError("Intent payload missing required 'costs' dictionary")

        raw_items = data.get("items")
        if not isinstance(raw_items, list) or len(raw_items) == 0:
            raise SchemaValidationError("Intent payload must contain a non-empty 'items' array (minItems: 1)")

        intent_id = str(data.get("intent_id", "")).strip() or str(uuid.uuid4())
        buyer_id = str(data.get("buyer_id", "")).strip() or "anonymous"
        session_id = str(data.get("session_id", "")).strip() or str(uuid.uuid4())

        timestamp_val = _parse_finite_float(data.get("timestamp", time.time()), "timestamp")

        return cls(
            intent_id=intent_id,
            buyer_id=buyer_id,
            session_id=session_id,
            merchant=MerchantInfo.from_dict(data["merchant"]),
            items=[CartItem.from_dict(i) for i in raw_items],
            costs=CostBreakdown.from_dict(data["costs"]),
            subscription=SubscriptionTerms.from_dict(data.get("subscription", {}) if isinstance(data.get("subscription"), dict) else {}),
            timestamp=timestamp_val,
            raw_prompt_context=data.get("raw_prompt_context"),
            promo_codes=data.get("promo_codes", []) if isinstance(data.get("promo_codes"), list) else [],
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
