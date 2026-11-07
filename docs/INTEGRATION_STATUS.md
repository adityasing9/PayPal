# IntentLock Commerce — Living Integration Status & Dependency Tracker

> **Document Status:** ACTIVE TRACKER (v1.1)  
> **Last Updated:** 2026-11-07  
> **Lead Maintainer:** Aditya Singh (`adityasing9`) — Member 5  

---

## 1. Overall Project Milestone Status

| Phase | Milestone Description | Target | Current Status |
|---|---|---|---|
| **Phase 1** | Architecture & Shared Documentation Baseline | Day 1 | **COMPLETED & RATIFIED** |
| **Phase 2** | Backend Scaffolding, Schemas & Mock Adapters | Day 1-2 | PENDING REVIEW (Awaiting Approval) |
| **Phase 3** | Independent Module Development on Member Branches | Day 2-3 | PENDING |
| **Phase 4** | End-to-End Inter-Module Integration & Mock Swap | Day 4 | PENDING |
| **Phase 5** | Attack Simulation Suite & Security Hardening | Day 5 | PENDING |
| **Phase 6** | Code Review, Deployment & Hackathon Demo Video | Day 6 | PENDING |

---

## 2. Per-Member Module Status Dashboard

```
┌────────────────────────────────────────────────────────────────────────┐
│ Member 1 (AI Commerce Agent): DevPrince3                               │
│ Branch: member-1/ai-commerce-agent                                     │
│ Status: NOT STARTED (Remote branch at initial commit)                  │
│ Interface: POST /api/intents, POST /api/proposals (Drafted v1.1)       │
└────────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 2 (Security Engine): diago-1                                    │
│ Branch: member-2/security-engine                                       │
│ Status: NOT STARTED (Remote branch at initial commit)                  │
│ Interface: POST /api/security/verify, RFC 8785 Ed25519 signer drafted  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 3 (PayPal Payment): EVARA566                                    │
│ Branch: member-3/paypal-integration                                    │
│ Status: NOT STARTED (Remote branch at initial commit)                  │
│ Interface: POST /api/payments/create-order & webhooks drafted          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 4 (Frontend UI/UX): AuGust                                      │
│ Branch: member-4/frontend-ui                                           │
│ Status: NOT STARTED (Remote branch at initial commit)                  │
│ Note: Collaborator invitation status pending verification              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 5 (Backend Lead): adityasing9                                   │
│ Branch: member-5/backend-integration                                   │
│ Status: PHASE 1.1 DOCUMENTATION UPDATED & RATIFIED                     │
│ Next: Review documentation and wait for "LET'S CODE"                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. External Service Dependency Readiness (Unverified Dependencies)

> **Important:** No external dependency is assumed to be available until explicitly verified with active credentials.

| Service / Dependency | Required Credential / Setup | Responsible Member | Verification Status | Fallback / Interim Plan |
|---|---|---|---|---|
| **PayPal Sandbox** | Client ID, Client Secret, Sandbox App, Webhook ID | Member 3 (`EVARA566`) & Member 5 | **UNVERIFIED (Pending Setup)** | Backend mock payment adapter provides deterministic order creation and capture responses. |
| **MongoDB Atlas** | Connection URI string, database user credentials | Member 5 (`adityasing9`) | **READY FOR CONFIG** | Local MongoDB instance (`mongodb://localhost:27017/intentlock`) usable immediately for local testing. |
| **Channel3 Catalog API** | API Key, base endpoint URL, rate limit guidelines | Member 1 (`DevPrince3`) | **UNVERIFIED (Access Pending)** | Offline JSON product catalog fixture (`data/catalog_fixture.json`) with 15–20 products across keyboards, headphones, and monitors. |
| **LLM Provider API** | API Key (Gemini API / OpenAI / Anthropic) | Member 1 (`DevPrince3`) | **UNVERIFIED (Provider Pending)** | Member 1 to select primary LLM for structured intent extraction and product ranking. |
| **Member 4 GitHub Access** | Collaborator invitation acceptance | Member 4 (`AuGust`) & Member 5 | **UNVERIFIED (Pending Invite)** | Member 5 to inspect GitHub collaborator settings. |

---

## 4. Decision Registry: Ratified Decisions & Open Points

| Topic | Category | Decision State | Details |
|---|---|---|---|
| **Client Authentication** | Security | **CONFIRMED (v1.2)** | HTTP-only, Secure, `SameSite=Strict` cookie (`intentlock_session`) with `X-CSRF-Token` header. Never assumes cookie presence on cross-site redirect; mandates 5 distinct test cases (SDK modal, redirect, session recovery, CSRF, idempotency). |
| **Rate Limiting** | Security | **CONFIRMED (v1.2)** | Enabled in Phase 2: 60 req/min/IP for general APIs, 5–10 req/min/IP for auth, per-`userId` limits, and progressive cooldowns. |
| **Offline Catalog Fixture** | Data | **CONFIRMED (v1.2)** | 15–20 realistic products across keyboards, headphones, and monitors in `data/catalog_fixture.json`. |
| **Non-Critical Spec Mismatch** | Security | **CONFIRMED (v1.2)** | Output is `REVIEW`. Requires explicit user confirmation after displaying side-by-side diff in frontend drawer. |
| **Critical Policy Violations** | Security | **CONFIRMED (v1.2)** | Merchant mismatch, unexpected recurring charges, and amount overruns strictly trigger `BLOCK`. AI confidence cannot override `BLOCK`. |
| **Prompt Injection Handling** | Security | **CONFIRMED (v1.2)** | Catalog text is passive untrusted data. Suspicious text alone does NOT block legitimate products; `BLOCK` occurs strictly upon concrete policy violations. |
| **Authorization Validity** | Cryptography | **CONFIRMED (v1.2)** | Strict 5-minute validity window (`expiresAt = now + 300s`) for *new* payment dispatch. |
| **Canonical Serialization** | Cryptography | **CONFIRMED (v1.2)** | Normalized JSON object per RFC 8785, hashed with SHA-256 and signed via Ed25519. String concatenation avoided. |
| **Nonce Recovery Invariant** | Architecture | **CONFIRMED (v1.2)** | Already-dispatched `IN_FLIGHT` orders remain recoverable via original `Idempotency-Key` and PayPal order ID. Never create a second payment during recovery. |
| **Financial Representation** | Database | **CONFIRMED (v1.2)** | 64-bit integer minor units (BSON Long / BigInt) with currency-specific exponents (USD: 2, JPY: 0, KWD: 3). |
| **Dual-Trigger Audit Anchoring** | Security | **CONFIRMED (v1.2)** | Published externally every 60 minutes + immediately upon transactions exceeding configurable threshold `HIGH_VALUE_ANCHOR_THRESHOLD_MINOR`. |
| **External Service Integration** | Integrations | **OPEN / UNVERIFIED** | Channel3, PayPal Sandbox, and LLM API credentials await verification by respective owners. |

---

## 5. Active Blockers, Risks & Mitigations

1. **Member 4 Collaborator Invite:**
   - **Risk:** Member 4 (`AuGust`) may not have accepted the repository collaborator invite yet, delaying frontend development.
   - **Mitigation:** Member 5 to verify collaborator status in GitHub repository settings.
2. **Channel3 API Availability:**
   - **Risk:** Real-time catalog search via Channel3 may be blocked by account access or rate limits.
   - **Mitigation:** An offline JSON fixture (`data/catalog_fixture.json`) has been designated as the primary data source until Channel3 API access is tested.
3. **External PayPal Credentials Delay:**
   - **Risk:** If Member 3's PayPal Sandbox account is delayed, end-to-end payment testing could stall.
   - **Mitigation:** Member 5's backend mock adapter simulates PayPal v2 order creation and capture flows immediately.
