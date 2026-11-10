# IntentLock Team Integration & Interop Guide
**Author:** Member 2 (Security Engine & Cryptographic Authorization)  
**Target Audience:** Members 1, 3, 4, and 5 of the 5-Member Team

---

## 1. Team Role Allocation & Architecture

```
[ Member 1: Agent Cart / UI ]
             │
             ▼ (POST /api/v1/intent/authorize)
[ Member 2: IntentLock Commerce Security Engine ] ◄── (THIS REPO)
             │
             ├─────────────────────────────────────────────────┐
             ▼ (Signed Ed25519 Token Handoff)                  ▼ (Audit Trail)
[ Member 3: Payment Orchestration / PayPal Gateway ]    [ Member 5: Audit & Compliance ]
             │
             ▼ (Authorized PayPal Capture)
[ Member 4: Order Settlement & Fulfillment ]
```

---

## 2. Active Cryptographic Keys

- **Algorithm:** Ed25519 (RFC 8032 Edwards-curve Digital Signature Algorithm)
- **Canonical Hash:** RFC 8785 JSON Canonicalization Scheme (JCS) + SHA-512
- **Public Key (Hex):**
  ```
  4df93f582d2b31f519c1982bb55c1aa46b4d64498fa04164eeb36c44c0f1cca9
  ```
- **Public Key File:** `keys/intentlock_public_key.hex`
- **Healthcheck & Public Key Endpoint:** `GET /api/v1/health`

---

## 3. Integration for Member 1 (Cart / Buyer Intent)

Send transactional intent to Member 2's authorization endpoint before routing to payment:
- **Endpoint:** `POST /api/v1/intent/authorize`
- **Schema:** [`member1_intent_submission_contract.json`](./member1_intent_submission_contract.json)

### Example Python Client:
```python
import requests

payload = {
    "intent_id": "CART_TX_12345",
    "buyer_id": "USER_9988",
    "session_id": "SESSION_4433",
    "merchant": {
        "merchant_id": "MERCH_GOOGLE",
        "name": "Google Store",
        "domain": "store.google.com",
        "is_verified": True
    },
    "items": [
        {
            "item_id": "ITEM_01",
            "name": "Pixel 10 Pro",
            "sku": "PIXEL-10",
            "unit_price": 999.0,
            "quantity": 1,
            "catalog_baseline_price": 999.0
        }
    ],
    "costs": {
        "subtotal": 999.0,
        "tax": 80.0,
        "shipping": 0.0,
        "total_charged": 1079.0,
        "currency": "USD"
    },
    "subscription": {
        "is_subscription": False
    }
}

response = requests.post("http://127.0.0.1:8000/api/v1/intent/authorize", json=payload)
data = response.json()

if response.status_code == 200 and data["authorized"]:
    # Pass handoff package to Member 3
    handoff_to_member3 = data["handoff_to_member3"]
else:
    print("Transaction blocked by IntentLock:", data["verdict"]["reasons"])
```

---

## 4. Integration for Member 3 (Payment Orchestration / PayPal)

Member 3 receives the cryptographic handoff package from Member 1 / Member 2:
- **Schema:** [`member3_paypal_handoff_contract.json`](./member3_paypal_handoff_contract.json)
- **Token Structure:** `base64url(header).base64url(claims).base64url(ed25519_signature)`

### Verification Logic Before Calling PayPal Capture:

#### Python Verification Example:
```python
from intentlock.workstream4_crypto_auth.signer import Ed25519Signer

# Read public key
with open("keys/intentlock_public_key.hex") as f:
    public_key_hex = f.read().strip()

compact_token = handoff["authorization_token"]
is_valid, claims = Ed25519Signer.verify_compact_token(compact_token, public_key_hex)

if not is_valid:
    raise SecurityError("IntentLock cryptographic token forgery detected! Refusing PayPal capture.")

# Proceed with PayPal Capture
paypal_capture(order_id=claims["intent_id"], amount=authorized_amount)
```

---

## 5. Integration for Member 4 & Member 5

- **Member 4 (Fulfillment):** Compare `intent_hash` from the payment settlement against Member 2's audit record before releasing inventory.
- **Member 5 (Compliance & Analytics Dashboard):** Query `GET /api/v1/intent/audit/{intent_id}` or monitor the SQLite audit log database (`intentlock_audit.db`) to display real-time risk scores and threat flags.
