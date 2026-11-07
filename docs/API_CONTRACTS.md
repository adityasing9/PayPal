# IntentLock Commerce — Shared REST API Contracts

> **Document Status:** PROPOSED / AWAITING TEAM APPROVAL (v1.2)  
> **Last Updated:** 2026-11-07  
> **Lead Maintainer:** Aditya Singh (`adityasing9`) — Member 5  
> **Notice:** These contracts establish the shared inter-module communication baseline for Members 1 through 5. All monetary amounts are expressed strictly in **64-bit integer minor units** paired with an ISO-4217 currency code and exponent (e.g., USD \$120.50 = `12050`, exponent 2).

---

## 1. Global Standards, Authentication, CSRF & Rate Limiting

### Base URL & Protocol
- **Local Development:** `http://localhost:5000/api`
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

## 6. PayPal Payment Integration Interface (Member 3 & Member 5 Interface)

### 6.1 Create PayPal Order & Crash Recovery
- **Endpoint:** `POST /api/payments/create-order`
- **Access:** Protected (Cookie + `X-CSRF-Token` + `Idempotency-Key`)
- **Headers:**
  - `X-CSRF-Token: <token>`
  - `Idempotency-Key: <uuid_v4>`
- **Request Body:**
```json
{
  "proposalId": "prop_8820f1a9",
  "authorizationId": "auth_4402a11c",
  "userConsent": true,
  "acknowledgedReviewDiffs": ["backlight"]
}
```
- **Backend Nonce Recovery Invariant:**
  1. Checks if `idempotencyKey` already has an associated `PaymentTransaction`. If so, returns existing order details (**NEVER creates a second payment**).
  2. Verifies Ed25519 signature of the RFC 8785 canonical hash.
  3. Verifies `now < expiresAt` for new payment dispatch.
  4. Atomically transitions authorization record from `PENDING` $\longrightarrow$ `IN_FLIGHT`.
  5. Calls PayPal Orders REST API v2 with `PayPal-Request-Id: <idempotencyKey>`.
- **Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "orderId": "PAYPAL_ORDER_88392104",
    "status": "CREATED",
    "amountMinor": 11790,
    "currency": "USD",
    "minorUnitExponent": 2,
    "approvalUrl": "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_ORDER_88392104"
  },
  "timestamp": "2026-11-07T18:03:00.000Z"
}
```

### 6.2 Capture PayPal Order
- **Endpoint:** `POST /api/payments/capture-order`
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

### 6.3 PayPal Webhook Ingestion
- **Endpoint:** `POST /api/payments/webhooks`
- **Access:** Public (Verified via PayPal Certificate & Transmission Headers)
- **Required Headers:**
  - `paypal-auth-algo`
  - `paypal-cert-url`
  - `paypal-transmission-id`
  - `paypal-transmission-sig`
  - `paypal-transmission-time`
- **Response (200 OK):**
```json
{
  "received": true,
  "eventId": "WH-99210-EVENT",
  "status": "VERIFIED_AND_PROCESSED"
}
```
