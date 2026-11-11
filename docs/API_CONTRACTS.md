# IntentLock Commerce — Shared REST API Contracts

> **Document Status:** Implemented local integration contract (v2)
> **Last Updated:** 2026-11-10
> **Lead Maintainer:** Aditya Singh (`adityasing9`) — Member 5  
> **Notice:** These contracts establish the shared inter-module communication baseline for Members 1 through 5. All monetary amounts are expressed strictly in **64-bit integer minor units** paired with an ISO-4217 currency code and exponent (e.g., USD \$120.50 = `12050`, exponent 2).

---

## 1. Global Standards, Authentication, CSRF & Rate Limiting

### Base URL & Protocol
- **Parent BFF:** `http://localhost:5000/api`
- **Nested Mongoose payment service:** `http://localhost:5001/api`
- **Flask security engine (service-only):** `http://127.0.0.1:8000/api`
- **Content-Type:** `application/json`

### Authentication, Cookie & CSRF Standards
1. **Authentication Transport:** User session tokens are delivered via **HTTP-only, Secure, `SameSite=Strict` cookies** (named `intentlock_session`).
   - *Cross-Site Navigation Invariant:* Browsers omit `SameSite=Strict` cookies on cross-site top-level GET navigation from external sites (e.g., PayPal return redirects). The server must not assume cookies will be present on incoming redirect URLs.
   - *Mandatory Test Cases:*
     - **Test Case 1 (SDK Modal):** In-window SDK popup/iframe preserves `SameSite=Strict` cookie on parent origin.
     - **Test Case 2 (Redirect):** Incoming cross-site redirect to `/checkout/return` receives NO cookie; server renders passive intermediate client SPA without executing state-changing capture.
     - **Test Case 3 (Session Recovery):** Client SPA initiates same-site fetch to re-attach Strict cookie or exchanges ephemeral return token before capture.
     - **Test Case 4 (CSRF):** State-changing endpoints strictly enforce `X-CSRF-Token`.
     - **Test Case 5 (Idempotency):** In-flight or completed transaction recovery returns existing order without creating or capturing a duplicate payment.
2. **CSRF Protection:** All state-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) must include an anti-CSRF token in the request header:
   ```http
   X-CSRF-Token: <csrf_token_string>
   ```
   The client fetches this token at session initialization via `GET /api/auth/csrf`.
3. **Idempotency Header:** All state-mutating payment and checkout endpoints require a unique client-generated UUID idempotency key:
   ```http
   Idempotency-Key: <unique_uuid_v4>
   ```

### Rate Limiting Standards (Phase 2 Baseline)
The backend enforces rate limiting with tiered limits:
- **General Endpoints (`/api/intents`, `/api/proposals`):** 60 requests / minute per IP and per authenticated `userId`.
- **Sensitive Endpoints (`/api/auth/login`, `/api/auth/register`):** 5–10 requests / minute per IP with progressive backoff on failures.
- **Payment Dispatch (`/api/payments/create-order`):** 10 requests / minute per authenticated `userId`.
- **Exceeded Limit Response (429 Too Many Requests):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please slow down and try again later.",
    "retryAfterSeconds": 60
  },
  "timestamp": "2026-11-07T18:00:00.000Z"
}
```

### Standard Success Response Envelope
```json
{
  "success": true,
  "data": {},
  "timestamp": "2026-11-07T18:00:00.000Z"
}
```

### Standard Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human-readable explanation of error.",
    "details": []
  },
  "timestamp": "2026-11-07T18:00:00.000Z"
}
```

---

## 2. Authentication & User Preferences

### 2.1 Get CSRF Token
- **Endpoint:** `GET /api/auth/csrf`
- **Access:** Public
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "csrfToken": "c3JmXzlmOTBhMWIyYzNkNGU1ZjZhN2I4"
  },
  "timestamp": "2026-11-07T18:00:00.000Z"
}
```

### 2.2 User Registration
- **Endpoint:** `POST /api/auth/register`
- **Access:** Public (Requires `X-CSRF-Token`, Rate limited to 10 req/min/IP)
- **Headers:** `X-CSRF-Token: <csrf_token>`
- **Request Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "name": "Jane Doe"
}
```
- **Response (201 Created):**
  - **Set-Cookie Header:** `intentlock_session=eyJhbGci...; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_672d1a2b",
      "email": "user@example.com",
      "name": "Jane Doe"
    }
  },
  "timestamp": "2026-11-07T18:00:00.000Z"
}
```

### 2.3 User Login
- **Endpoint:** `POST /api/auth/login`
- **Access:** Public (Requires `X-CSRF-Token`, Rate limited to 5-10 req/min/IP with progressive backoff)
- **Response (200 OK):** Sets `intentlock_session` cookie; returns user profile.

### 2.4 User Preferences
- **Endpoint:** `GET /api/user/preferences`
- **Access:** Protected (Cookie)
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "defaultCurrency": "USD",
    "minorUnitExponent": 2,
    "maxTransactionLimitMinor": 50000,
    "allowedMerchants": ["MERCHANT_KEYCHRON", "MERCHANT_LOGITECH", "MERCHANT_BESTBUY"],
    "blockedMerchants": ["MERCHANT_SHADY_DEALS"],
    "requireExplicitReviewOverMinor": 20000
  },
  "timestamp": "2026-11-07T18:00:00.000Z"
}
```

---

## 3. Intent Management (Member 1 & Member 5 Interface)

### 3.1 Create Purchase Intent
- **Endpoint:** `POST /api/intents`
- **Access:** Protected (Cookie + `X-CSRF-Token`, Rate limited to 60 req/min)
- **Request Body:**
```json
{
  "prompt": "Find me a wireless mechanical keyboard with tactile switches and white backlighting under $120.",
  "maxBudgetMinor": 12000,
  "currency": "USD",
  "minorUnitExponent": 2,
  "category": "Keyboards",
  "constraints": {
    "requiredSpecs": {
      "connectivity": "Wireless",
      "switchType": "Tactile",
      "backlight": "White"
    }
  }
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "intentId": "int_9921bc44",
    "version": 1,
    "prompt": "Find me a wireless mechanical keyboard with tactile switches and white backlighting under $120.",
    "maxBudgetMinor": 12000,
    "currency": "USD",
    "minorUnitExponent": 2,
    "category": "Keyboards",
    "status": "INITIALIZED",
    "createdAt": "2026-11-07T18:01:00.000Z"
  },
  "timestamp": "2026-11-07T18:01:00.000Z"
}
```

---

## 4. Product Proposal Management (Member 1 & Member 5 Interface)

### 4.1 Submit Proposal from AI Agent
- **Endpoint:** `POST /api/proposals`
- **Access:** Internal Service-to-Service
- **Description:** Member 1's agent searches the verified offline catalog fixture (15-20 products across keyboards, headphones, monitors) and submits candidates.
- **Request Body:**
```json
{
  "intentId": "int_9921bc44",
  "productId": "prod_k2_pro",
  "variantSku": "K2P-WHT-TAC-BROWN",
  "title": "Keychron K2 Pro Wireless Mechanical Keyboard",
  "merchant": {
    "id": "MERCHANT_KEYCHRON",
    "name": "Keychron Official Store",
    "paypalMerchantId": "PPM_KEYCHRON_998"
  },
  "lineItems": [
    {
      "name": "Keychron K2 Pro (White Backlight / Brown Switch)",
      "sku": "K2P-WHT-TAC-BROWN",
      "quantity": 1,
      "unitPriceMinor": 9900
    }
  ],
  "pricing": {
    "basePriceMinor": 9900,
    "shippingMinor": 1000,
    "taxMinor": 890,
    "discountMinor": 0,
    "totalPriceMinor": 11790,
    "currency": "USD",
    "minorUnitExponent": 2
  },
  "specifications": {
    "connectivity": "Wireless (Bluetooth 5.1 / Type-C)",
    "switchType": "Tactile (Keychron K Pro Brown)",
    "backlight": "White LED"
  },
  "recurring": {
    "isRecurring": false,
    "billingInterval": null,
    "billingCycles": 0
  },
  "catalogSource": "CHANNEL3_OFFLINE_FIXTURE",
  "productUrl": "https://www.keychron.com/products/keychron-k2-pro"
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "proposalId": "prop_8820f1a9",
    "intentId": "int_9921bc44",
    "snapshotId": "snap_3301a7d2",
    "snapshotHash": "4a7d2e8b...64_hex_sha256",
    "totalPriceMinor": 11790,
    "currency": "USD",
    "status": "PROPOSED",
    "createdAt": "2026-11-07T18:02:00.000Z"
  },
  "timestamp": "2026-11-07T18:02:00.000Z"
}
```

---

## 5. Security Engine Interface (Member 2 & Member 5 Interface)

### 5.1 Evaluate Proposal & Generate RFC 8785 Ed25519 Authorization
- **Endpoint:** `POST /api/security/verify`
- **Access:** Internal Service-to-Service
- **Untrusted Product Text Rule:** Product descriptions and reviews are passive untrusted data. Detection of suspicious text alone does NOT automatically block legitimate products. A `BLOCK` outcome is reserved for defined policy violations (budget, merchant ID, recurring fees, or direct manipulation of policy parameters).
- **Request Body:**
```json
{
  "intent": {
    "id": "int_9921bc44",
    "version": 1,
    "maxBudgetMinor": 12000,
    "currency": "USD",
    "minorUnitExponent": 2,
    "requiredSpecs": {
      "connectivity": "Wireless",
      "switchType": "Tactile",
      "backlight": "White"
    }
  },
  "snapshot": {
    "intentId": "65a123456789012345678901",
    "snapshotId": "snap_3301a7d2",
    "snapshotHash": "4a7d2e8b...64_hex_sha256",
    "proposalId": "prop_8820f1a9",
    "productId": "prod_k2_pro",
    "variantSku": "K2P-WHT-TAC-BROWN",
    "merchantId": "MERCHANT_KEYCHRON",
    "paypalMerchantId": "PPM_KEYCHRON_998",
    "lineItems": [
      {
        "sku": "K2P-WHT-TAC-BROWN",
        "quantity": 1,
        "unitPriceMinor": 9900
      }
    ],
    "pricing": {
      "basePriceMinor": 9900,
      "shippingMinor": 1000,
      "taxMinor": 890,
      "discountMinor": 0,
      "totalPriceMinor": 11790,
      "currency": "USD",
      "minorUnitExponent": 2
    },
    "recurring": {
      "isRecurring": false,
      "billingCycles": 0
    },
    "specifications": {
      "connectivity": "Wireless",
      "switchType": "Tactile",
      "backlight": "White LED"
    },
    "rawDescription": "Keychron K2 Pro Wireless Mechanical Keyboard with Brown Switches."
  }
}
```

**Production binding invariant (the IDs above are illustrative):** `intent.id`,
`snapshot.intentId`, `snapshot.snapshotId`,
`snapshot.proposalId`, and the authenticated user ID must be valid MongoDB ObjectIds.
The snapshot intent ID must exactly match the persisted intent; the persisted proposal
and snapshot must belong to that same intent and each other. Production evaluation uses
the database-backed snapshot only, verifies its canonical hash, and blocks if the
proposal's SKU, merchants, line items, pricing, or recurring terms differ from it.

#### Outcome 1: PASS Response (With 5-Minute Ed25519 Authorization)
```json
{
  "success": true,
  "data": {
    "decision": "PASS",
    "riskScore": 0.02,
    "ruleEvaluations": {
      "budgetCheck": { "passed": true, "deltaMinor": -210 },
      "merchantCheck": { "passed": true, "payeeStatus": "VERIFIED_WHITELIST" },
      "specCheck": { "passed": true, "mismatches": [] },
      "recurringCheck": { "passed": true, "isRecurring": false },
      "contentCheck": { "status": "PASSIVE_DATA_CONFIRMED" }
    },
    "authorization": {
      "authorizationId": "auth_4402a11c",
      "algorithm": "Ed25519",
      "canonicalJsonHash": "d5a8...32_byte_sha256_hex",
      "publicKey": "a1b2c3d4...32_byte_hex",
      "nonce": "7f8a9b0c...256_bit_hex",
      "issuedAt": "2026-11-07T18:02:00.000Z",
      "expiresAt": "2026-11-07T18:07:00.000Z",
      "validitySeconds": 300,
      "signature": "3e9b1c7f...64_byte_ed25519_hex"
    }
  },
  "timestamp": "2026-11-07T18:02:00.000Z"
}
```

#### Outcome 2: REVIEW Response (Non-Critical Spec Mismatch)
```json
{
  "success": true,
  "data": {
    "decision": "REVIEW",
    "reviewReason": "SPECIFICATION_MISMATCH",
    "riskScore": 0.25,
    "specDifferences": [
      {
        "attribute": "backlight",
        "requested": "RGB",
        "proposed": "White LED",
        "criticality": "NON_CRITICAL"
      }
    ],
    "ruleEvaluations": {
      "budgetCheck": { "passed": true },
      "merchantCheck": { "passed": true },
      "recurringCheck": { "passed": true }
    },
    "requiresExplicitUserConfirmation": true,
    "authorization": null
  },
  "timestamp": "2026-11-07T18:02:00.000Z"
}
```

#### Outcome 3: BLOCK Response (Concrete Policy Violation)
```json
{
  "success": true,
  "data": {
    "decision": "BLOCK",
    "errorCode": "CRITICAL_VIOLATION_MERCHANT_MISMATCH",
    "reason": "Proposed payee PPM_ROGUE_881 does not match verified merchant directory.",
    "ruleEvaluations": {
      "merchantCheck": {
        "passed": false,
        "detectedMerchant": "PPM_ROGUE_881",
        "expectedMerchant": "PPM_KEYCHRON_998"
      }
    },
    "authorization": null
  },
  "timestamp": "2026-11-07T18:02:00.000Z"
}
```

---

### 5.2 INTENTLOCK_V2 Purchase-Binding Handoff

The payment integration uses `INTENTLOCK_V2_ED25519`; the existing V1 endpoint
and tokens remain legacy and are not accepted for new PayPal orders.

- Flask service endpoint: `POST /api/v2/intent/authorize` (service token required).
- The nested Mongoose service constructs the intent payload and authorization
  context from the authenticated user's persisted intent, proposal, snapshot, and
  verified catalog. The browser does not call this endpoint.
- The signed claims explicitly bind `user_id`, `intent_id`, `intent_version`,
  `proposal_id`, `snapshot_id`, `snapshot_hash`, `amount_minor`, `currency`,
  `minor_unit_exponent`, `merchant_id`, and `paypal_merchant_id`.
- The 128-bit nonce is single-use; token lifetime is at most 60 seconds.
- `purchase_hash` is SHA-512 over RFC 8785 canonical JSON for the exact binding
  object in [`../contracts/member3_paypal_handoff_contract.json`](../contracts/member3_paypal_handoff_contract.json).
  Both Python and Node recompute this hash.
- `intent_hash` remains a Python-engine audit digest. It is not treated as the
  cross-language purchase commitment.
- The nested service verifies the pinned Ed25519 key and all signed values,
  recomputes the stored snapshot's SHA-256, then writes the external token and
  nonce to the persisted internal authorization. A MongoDB unique partial index
  prevents the same external nonce from being attached to another authorization.

The safe-integer limit on each monetary minor-unit input is `Number.MAX_SAFE_INTEGER`,
and supported currency exponents are 0 through 3. Values outside those bounds
fail closed rather than passing through Python floats with lost precision.

---

## 6. PayPal Payment Integration Interface (Member 3 & Member 5 Interface)

### 6.1 Create PayPal Order & Crash Recovery
- **User-facing endpoint:** Parent BFF `POST /api/payments/create-order`
- **Nested endpoint:** `POST /api/payments/intentlock/create-order`
- **Access:** BFF forwards the nested session cookie, CSRF token, and idempotency
  key. The nested endpoint additionally requires the configured parent service key.
- **Headers:**
  - `Cookie: intentlock_session=<session>`
  - `X-CSRF-Token: <session-bound-token>`
  - `Idempotency-Key: <uuid_v4>`
  - Internal only: `X-Internal-Service-Key: <shared-service-secret>`
- **Request Body:**
```json
{
  "proposalId": "0123456789abcdef01234567",
  "userConsent": true,
  "acknowledgedReviewDiffs": []
}
```
- The client must not submit `authorizationId`, amount, currency, merchant,
  intent ID, or snapshot ID as authority. Only the authenticated Mongo records
  determine these values.
- **Backend Nonce Recovery Invariant:**
  1. Authenticates the session and CSRF token in the nested service.
  2. Verifies the user-owned intent, proposal, snapshot bindings, stored snapshot
     hash, proposal/snapshot consistency, amount arithmetic, denomination, and
     verified catalog merchant.
  3. Requests a signed V2 token from Flask and verifies its Ed25519 signature,
     60-second lifetime, all purchase claims, and cross-language `purchase_hash`.
  4. Persists the Mongoose authorization, external token, and external nonce;
     unique Mongo indexes fail closed on replay.
  5. Atomically transitions the internal authorization nonce from `PENDING` to
     `IN_FLIGHT` and dispatches an order using only its authorized amount,
     currency, and PayPal merchant.
  6. Uses `PayPal-Request-Id: <Idempotency-Key>` and returns the existing
     transaction on a safe duplicate request. A unique partial MongoDB index
     reserves each idempotency key for only one authorization, including when
     concurrent requests race before a transaction record is persisted.
  7. Bounds PayPal OAuth and order API calls by `PAYPAL_API_TIMEOUT_MS`. After
     an ambiguous timeout or PayPal 5xx, retry only with the same
     `Idempotency-Key`; the claimed authorization is reused and PayPal receives
     the same `PayPal-Request-Id`. Definitive 4xx rejections require
     reconciliation instead of redispatch.
  8. Validates the returned PayPal order ID, `CREATED` status, single purchase
     unit, exact amount/currency, and authorized merchant payee before
     persisting the transaction.
- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "orderId": "PAYPAL_ORDER_88392104",
    "status": "CREATED",
    "amountMinor": "11790",
    "currency": "USD",
    "minorUnitExponent": 2,
    "approvalUrl": "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_88392104",
    "authorization": {
      "protocol": "INTENTLOCK_V2_ED25519",
      "intentId": "0123456789abcdef01234567",
      "proposalId": "1123456789abcdef01234567",
      "snapshotId": "2123456789abcdef01234567",
      "snapshotHash": "<64-character SHA-256 hex>",
      "amountMinor": "11790",
      "currency": "USD",
      "paypalMerchantId": "PPM_KEYCHRON_998",
      "expiresAt": "<ISO-8601 timestamp>"
    }
  },
  "timestamp": "2026-11-07T18:03:00.000Z"
}
```

Expected failures include `401 AUTHENTICATION_REQUIRED`, `403` for CSRF or policy
denial, `409 SECURITY_REVIEW_REQUIRED` or replay/idempotency conflict, `422`
unsupported numeric precision, and `502`/`503` for unavailable downstream
services or authoritative storage. Authorization tokens are not returned to the
browser.

### 6.2 Capture PayPal Order
- **Endpoint:** `POST /api/payments/capture-order`
- **Production status:** Disabled; production requests return `403 PAYPAL_CAPTURE_DISABLED`
  until the end-to-end authorization and settlement flow is approved.
- **Access:** Protected (Cookie + `X-CSRF-Token` + `Idempotency-Key`)
- **Headers:**
  - `X-CSRF-Token: <csrf_token>` (Mandatory CSRF validation; rejects missing/invalid tokens with 403 Forbidden)
  - `Idempotency-Key: <uuid_v4>` (Mandatory idempotency control)
- **Recovery & Duplicate Prevention Invariant:**
  - If a transaction is already `IN_FLIGHT` or `COMPLETED` for this `Idempotency-Key`, the backend returns the existing `PaymentTransaction` record.
  - The backend **never** calls the PayPal Capture API a second time during crash recovery or retries.
  - If incoming from a cross-site redirect flow, session context must be recovered via intermediate same-site SPA fetch prior to invoking this endpoint.
- **Request Body:**
```json
{
  "orderId": "PAYPAL_ORDER_88392104",
  "authorizationId": "auth_4402a11c"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "captureId": "CAP_99182371",
    "status": "COMPLETED",
    "transactionId": "txn_550183",
    "finalAmountMinor": 11790,
    "currency": "USD",
    "payerEmail": "buyer@sandbox.paypal.com",
    "capturedAt": "2026-11-07T18:03:30.000Z"
  },
  "timestamp": "2026-11-07T18:03:30.000Z"
}
```

### 6.3 PayPal Return Redirect Trampoline
- **Endpoint:** `GET /api/payments/return`
- **Access:** Public (Incoming browser navigation from PayPal Sandbox)
- **Query Parameters:** `token=<paypal_order_id>`, `return_token=<ephemeral_token>`
- **Security Invariant:** **NEVER captures funds and DOES NOT consume the return token.**
- **Behavior:** Validates format and returns an HTTP 302 redirect to the client SPA landing page passing the return token in the URL fragment:
  `${APP_ORIGIN}/checkout/return?orderId=<orderId>#return_token=<returnToken>`
- **Fragment Security Invariants:**
  1. *HTTP Transmission vs Browser History:* URL fragments are never sent across the network in HTTP request lines or `Referer` headers, but remain in the browser's address bar/history until explicitly cleared.
  2. *Immediate Extraction & Sanitization:* The client SPA must extract the token immediately upon load and strip the fragment from the address bar using `window.history.replaceState(null, '', window.location.pathname + window.location.search)`.
  3. *Zero Persistence / Analytics Isolation:* The token must never be logged, saved in `localStorage`, or sent to third-party analytics.
  4. *Referrer-Policy:* Backend enforces `Referrer-Policy: strict-origin-when-cross-origin` to block parameter leakage on cross-origin requests.

### 6.4 Recover Return Session
- **Endpoint:** `POST /api/payments/recover-session`
- **Access:** Public / Same-Site SPA
- **Request Body:**
```json
{
  "orderId": "PAYPAL_ORDER_88392104",
  "returnToken": "ret_tok_a8f9c1d2e3b4"
}
```
- **Security Invariants:**
  1. **Single-Use Atomic Consumption:** Atomically transitions token state `PENDING` $\to$ `CONSUMED`. Replay attempts fail with `401 INVALID_OR_EXPIRED_RETURN_TOKEN`.
  2. **Zero Trust in Client User ID:** Binds session exclusively to the backend's verified `PaymentTransaction.userId`.
  3. **Zero Fund Capture Authority:** Strictly read/session recovery only.
- **Response (200 OK):** Sets HTTP-only `SameSite=Strict` `intentlock_session` cookie; returns:
```json
{
  "success": true,
  "data": {
    "message": "Session context recovered successfully. Ready for explicit capture confirmation.",
    "orderId": "PAYPAL_ORDER_88392104",
    "status": "CREATED",
    "amountMinor": 11790,
    "currency": "USD"
  },
  "timestamp": "2026-11-07T18:03:15.000Z"
}
```

### 6.5 PayPal Webhook Ingestion
- **Endpoint:** `POST /api/payments/webhooks`
- **Access:** Public (verified through PayPal's signature-verification API)
- **Required Headers:**
  - `paypal-auth-algo`
  - `paypal-cert-url` (Strictly `https:` scheme, standard port 443, and exact host matching `api.paypal.com` or `api.sandbox.paypal.com`)
  - `paypal-transmission-id`
  - `paypal-transmission-sig`
  - `paypal-transmission-time`
- **Security Invariants:**
  - Validates certificate URL against SSRF: allows only exact hosts `api.paypal.com` and `api.sandbox.paypal.com`; rejects all other subdomains, IP literals, unexpected ports, loopback/private IPs, and unsafe redirects before making outbound requests.
  - Quarantines mock webhook headers (`X-IntentLock-Mock-Webhook: true`); strictly rejects mock webhooks in production (`NODE_ENV === 'production'`).
  - Verifies the event with PayPal's `verify-webhook-signature` API before checking duplicate delivery or storing the event. `PAYPAL_WEBHOOK_ID` must be configured; the current server endpoint is PayPal Sandbox.
  - `PAYMENT.CAPTURE.COMPLETED` matches the signed resource's order ID, capture ID, amount, and currency to a persisted transaction before conditionally moving it to `COMPLETED`.
  - `PAYMENT.CAPTURE.DENIED` applies the same order, capture, amount, currency, and state checks before moving an eligible transaction to `FAILED`.
  - `PAYMENT.CAPTURE.REFUNDED` is applied only for a full refund matched by capture ID (and order ID when present). Partial refunds are recorded as `UNSUPPORTED` because the transaction model does not track partial refund balances.
  - An event's internal transaction ID is never used for lookup. Transaction transitions use MongoDB conditional single-document updates; event records are claimed as `PROCESSING` and finalized only after business processing. Retries can reclaim failed events or stale processing leases and safely reapply already-completed transitions.
  - The transaction state change and webhook event state are separate MongoDB document updates, not one multi-document database transaction. Conditional transaction transitions and idempotent provider identifiers make crash recovery safe; this does not provide cross-document atomic commit.
  - Webhooks never initiate PayPal capture. Unsupported events are persisted as `UNSUPPORTED`; failed business processing is persisted as `FAILED`.
- **Response:**
```json
{
  "received": true,
  "eventId": "WH-99210-EVENT",
  "status": "VERIFIED_AND_PROCESSED"
}
```
- Completed duplicate deliveries return `ALREADY_PROCESSED`. Unsupported events return `UNSUPPORTED`. Concurrent deliveries return `PROCESSING` with HTTP 503; failed processing returns `FAILED` with HTTP 500 so PayPal may retry. Invalid signatures and malformed requests are rejected and are not processed.
