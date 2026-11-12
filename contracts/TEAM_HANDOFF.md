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

### Loading Persistent Private Key for Member 2 Service:
Private keys are never committed to version control. When running the Member 2 Flask service locally or in deployment:
1. **Option 1 (Environment variable / .env):**
   Copy `.env.example` to `.env` and configure:
   ```bash
   INTENTLOCK_PRIVATE_KEY_HEX=<64_character_hex_private_key>
   ```
2. **Option 2 (Local File):**
   Place the 64-character hex key in `keys/intentlock_private_key.hex` (this path is protected by `.gitignore`).
3. **Option 3 (Interactive Helper):**
   Run `python scripts/setup_key.py` to securely input and validate the key without exposing it in terminal logs.

When correctly configured, `GET /api/v1/health` reports `"is_persistent_key": true` and `"trusted_key_matched": true`. If the private key is absent, an ephemeral key is generated and a warning is logged.

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

The implemented payment boundary uses **INTENTLOCK_V2_ED25519**. The parent
Express backend is a BFF proxy; the nested Mongoose backend owns session
authentication, authoritative purchase lookup, token verification, durable
single-use redemption, and PayPal order creation.

- **Normative handoff schema:** [`member3_paypal_handoff_contract.json`](./member3_paypal_handoff_contract.json)
- **V2 shared hash vector:** [`test_vectors_interop_v2.json`](./test_vectors_interop_v2.json)
- **V1 vectors (legacy only):** [`test_vectors_interop_v1.json`](./test_vectors_interop_v1.json)
- **Token:** three compact segments containing a protected header, JSON claims,
  and Ed25519 signature. V2 signs the ASCII `headerSegment.claimsSegment`.
- **Required signed bindings:** authenticated user, intent and version, proposal,
  snapshot ID and SHA-256 snapshot hash, amount in minor units, currency and
  exponent, merchant and PayPal merchant.
- **Purchase commitment:** `purchase_hash` is SHA-512 of RFC 8785 canonical JSON
  for the exact binding object listed in the JSON schema. The Node verifier
  recomputes and compares it.
- **Expiry and replay:** 128-bit random nonce; maximum 60-second validity.
  The Node service persists the external nonce on the authorization record with
  a unique MongoDB index before returning PASS.
- **V1 tokens:** remain available only on the legacy Flask endpoint. The payment
  order path rejects V1 and requires V2.

The parent `POST /api/payments/create-order` forwards the nested
`intentlock_session` cookie, `X-CSRF-Token`, and `Idempotency-Key`. Its request
contains only `proposalId`, `userConsent`, and `acknowledgedReviewDiffs`; clients
cannot submit an authorization ID, amount, currency, merchant, intent, or
snapshot as authority. The nested service builds the Flask payload from
MongoDB-backed records and the verified catalog.

The sequence is:
1. Authenticate and validate the user's session and CSRF token in the nested API.
2. Load the user's intent, associated proposal, and immutable snapshot; verify
   proposal/snapshot equality, snapshot SHA-256, line-item and fee arithmetic,
   currency denomination, and catalog merchant.
3. Request an INTENTLOCK V2 authorization from Flask over the service-authenticated
   internal connection.
4. Verify the pinned Ed25519 signature, the V2 protocol and expiry, all database
   bindings, and the recomputed SHA-512 purchase commitment.
5. Run the existing Mongoose firewall, persist its signed authorization and the
   external token/nonce atomically under MongoDB uniqueness constraints, then
   create an order using only the persisted amount, currency, and PayPal payee.

This authorization permits **order creation only**. PayPal capture remains
disabled until a separately reviewed settlement protocol is implemented and
validated. No V1 token or browser return is capture authority.

---

## 5. Integration for Member 4 & Member 5

- **Member 4 (Fulfillment):** Compare `intent_hash` from the payment settlement against Member 2's audit record before releasing inventory.
- **Member 5 (Compliance & Analytics Dashboard):** Query `GET /api/v1/intent/audit/{intent_id}` or monitor the SQLite audit log database (`intentlock_audit.db`) to display real-time risk scores and threat flags.
