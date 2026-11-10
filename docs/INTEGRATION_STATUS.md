# IntentLock Commerce — Living Integration Status & Dependency Tracker

> **Document Status:** ACTIVE TRACKER (v1.1)  
> **Last Updated:** 2026-11-07  
> **Lead Maintainer:** Aditya Singh (`adityasing9`) — Member 5  

---

## 1. Overall Project Milestone Status

| Phase | Milestone Description | Target | Current Status |
|---|---|---|---|
| **Phase 1** | Architecture & Shared Documentation Baseline | Day 1 | **COMPLETED & RATIFIED** |
| **Phase 2** | Backend Scaffolding, Schemas & Mock Adapters | Day 1-2 | **COMPLETED & VERIFIED (100%)** |
| **Phase 3** | Independent Module Development on Member Branches | Day 2-3 | **READY FOR PHASE 3 SPRINTS** |
| **Phase 4** | End-to-End Inter-Module Integration & Mock Swap | Day 4 | PENDING |
| **Phase 5** | Attack Simulation Suite & Security Hardening | Day 5 | PENDING |
| **Phase 6** | Code Review, Deployment & Hackathon Demo Video | Day 6 | PENDING |

---

## 2. Per-Member Module Status Dashboard

```
┌────────────────────────────────────────────────────────────────────────┐
│ Member 1 (AI Commerce Agent): DevPrince3                               │
│ Branch: member-1/ai-commerce-agent                                     │
│ Status: READY FOR PHASE 3 SPRINT                                       │
│ Mock Adapter: src/adapters/aiAgentAdapter.js (Verified & Ready)        │
│ Contract: POST /api/intents, POST /api/proposals                       │
└────────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 2 (Security Engine): diago-1                                    │
│ Branch: member-2/security-engine                                       │
│ Status: READY FOR PHASE 3 SPRINT                                       │
│ Mock Adapter: src/adapters/securityEngineAdapter.js (Verified & Ready) │
│ Contract: POST /api/security/verify, RFC 8785 Ed25519 Signer           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 3 (PayPal Payment): EVARA566                                    │
│ Branch: member-3/paypal-integration                                    │
│ Status: READY FOR PHASE 3 SPRINT                                       │
│ Mock Adapter: src/adapters/paypalMockAdapter.js (Verified & Ready)     │
│ Contract: POST /api/payments/create-order, capture, return, webhooks   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 4 (Frontend UI/UX): AuGust                                      │
│ Branch: member-4/frontend-ui                                           │
│ Status: READY FOR PHASE 3 SPRINT                                       │
│ Backend API: 100% operational on localhost:5000/api                    │
│ Cookie Auth: SameSite=Strict + X-CSRF-Token + Drawer Diffs             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Member 5 (Backend Lead): adityasing9                                   │
│ Branch: member-5/backend-integration                                   │
│ Status: PHASE 2 & STEP 2.6 AUDIT COMPLETE (207 Tests Passing, 16 Suites)│
│ Artifacts: Scaffolding, Models, Repositories, REST API, Mocks, E2E     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. External Service Dependency Readiness (Unverified Dependencies)

> **Important:** No external dependency is assumed to be available until explicitly verified with active credentials.

| Service / Dependency | Required Credential / Setup | Responsible Member | Verification Status | Fallback / Interim Plan |
|---|---|---|---|---|
| **PayPal Sandbox** | Client ID, Client Secret, Sandbox App, Webhook ID | Member 3 (`EVARA566`) & Member 5 | **OUTSTANDING EXTERNAL GATE (Unverified)** | In-memory mock payment adapter provides deterministic order creation and capture responses for testing. Genuine live Sandbox payments remain an explicit external gate. |
| **MongoDB Replica Set** | Connection URI string, database user credentials, replica set / transactions | Member 5 (`adityasing9`) | **OUTSTANDING EXTERNAL GATE (Pending Daemon)** | In-memory repository mocks provide atomic conditional semantics for CI/sandboxed tests. Real replica-set verification is an explicit external gate upon daemon availability. |
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
| **Non-Critical Spec Mismatch & REVIEW** | Security | **CONFIRMED (v1.3)** | Output is `REVIEW` with `authorization: null`. Requires explicit user confirmation bound to `userId`, `proposalId`, `snapshotHash`, and proposal version. Server validates diffs and re-evaluates through `SecurityFirewallService` before signing. Hard constraints are NEVER waived. |
| **Return Token Lifecycle & Session Recovery** | Security | **CONFIRMED (v1.4)** | Ephemeral return token is a single-use credential bound to stored transaction, user, and expiry. Consumed atomically exactly once via `POST /api/payments/recover-session`. Delivered via URL fragment (`#return_token=...`) and stripped immediately via `history.replaceState`. Never logged or sent to analytics. `Referrer-Policy: strict-origin-when-cross-origin` enforced. `GET /api/payments/return` is a passive trampoline; NEITHER endpoint can capture funds. |
| **Webhook SSRF & Quarantine** | Security | **CONFIRMED (v1.4)** | Webhook certificate URLs must strictly be HTTPS pointing exclusively to exact hosts `api.paypal.com` or `api.sandbox.paypal.com`. All other subdomains, IP literals, unexpected ports, private/loopback destinations, and redirects are rejected before fetching. Mock webhooks are explicitly tagged and rejected in production (`403 Forbidden`). |
| **Verification Gate Separation** | Testing | **CONFIRMED (v1.4)** | Differentiates 4 test tiers: (1) Unit tests, (2) In-memory application integration tests, (3) Real MongoDB replica-set tests, (4) Genuine PayPal Sandbox tests. Simulated in-memory test suites verify code logic and architecture but do not claim production DB or live payment gateway correctness. |
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

---

## 6. Phase 2 Mock Adapters & Cross-Member Handoff Inventory

With the completion of Phase 2 (Steps 2.1 through 2.6), Member 5 has delivered high-fidelity, tested mock adapters in `src/adapters/` enabling all teammates to build and verify their modules offline in Phase 3:

| Adapter | File Path | Responsible Teammate | Purpose & Key Features |
|---|---|---|---|
| **AI Agent Adapter** | `src/adapters/aiAgentAdapter.js` | Member 1 (`DevPrince3`) | Consumes `data/catalog_fixture.json` (18 verified products). Implements offline keyword search, candidate ranking, valid proposal formulation matching `proposal.schema.js`, and 4 adversarial attack generators (`BUDGET_OVERRUN`, `PROMPT_INJECTION`, `HIDDEN_RECURRING`, `UNVERIFIED_MERCHANT`). Barred in production. |
| **Security Engine Adapter** | `src/adapters/securityEngineAdapter.js` | Member 2 (`diago-1`) | Reuses the authoritative `SecurityFirewallService` (zero competing policy engine). Exposes verification and server-side `REVIEW` spec diff clearance harnesses. `forceOutcome` strictly restricted to `NODE_ENV === 'test'`. Barred in production. |
| **PayPal Mock Adapter** | `src/adapters/paypalMockAdapter.js` | Member 3 (`EVARA566`) | Simulates PayPal v2 Orders REST API (`createOrder` and `captureOrder`) with idempotency caching via `PayPal-Request-Id`. Provides tagged mock webhook fixtures (`X-IntentLock-Mock-Webhook: true`) and exact host certificate URL validation (`api.paypal.com` / `api.sandbox.paypal.com`). Barred in production. |
| **Adapters Barrel** | `src/adapters/index.js` | All Members | Unified barrel export for all mock adapters. |
| **Database Seeder** | `scripts/seed.js` | Member 5 (`adityasing9`) | Idempotent upsert of 18 catalog products into MongoDB `Product` collection. Strictly locked out of production. Demo user creation quarantined behind `SEED_DEMO_USER=true` in local development. |
| **E2E Orchestration Suite** | `tests/integration/e2eFlow.test.js` | All Members | Complete 11-test orchestration suite exercising the full Express pipeline, atomic repositories, review diff drawer, cross-site return token fragment recovery, replay defense, and webhook SSRF protection. |

