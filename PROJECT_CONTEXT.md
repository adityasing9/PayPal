# IntentLock Commerce — Master Project Context

> **Tagline:** Search intelligently. Verify independently. Pay securely.  
> **Hackathon:** PayPal AI Hackathon 2026  
> **Category:** AI + FinTech + Agentic Commerce  
> **Repository:** `https://github.com/adityasing9/PayPal`  
> **Current Integration Branch:** `member-5/backend-integration`  

---

## 1. Executive Summary & Vision

Autonomous AI agents are transforming digital commerce by shifting the consumer experience from manual browsing to natural-language delegation. However, autonomous purchasing creates severe financial vulnerabilities: prompt injections, price slippage, hidden recurring fees, merchant spoofing, and rogue checkout modifications.

**IntentLock Commerce** introduces a dual-engine architecture:
1. **AI Commerce Agent:** Discovers products, analyzes specifications, balances tradeoffs, and formulates structured purchase proposals based on natural language user prompts.
2. **Independent Security Engine (IntentLock Firewall):** An isolated, deterministic verification firewall that evaluates the proposed transaction against original user intents and security policies before any payment can be authorized.

**The Golden Principle:**  
*AI can discover, recommend, and prepare purchases, but it can never authorize or execute a payment.* Payments are strictly executed via PayPal Sandbox only after deterministic validation, cryptographic authorization (Ed25519), and explicit, non-bypassable user confirmation.

---

## 2. Problem Statement & Threat Vector Coverage

IntentLock Commerce deterministically mitigates the seven primary failure modes of autonomous commerce agents:

| Threat Vector | Real-World Scenario | IntentLock Defense |
|---|---|---|
| **1. Spec Deviation** | AI selects a lower-spec or mismatched variant (e.g., tactile vs clicky switches) to meet budget. | Non-critical spec mismatches trigger `REVIEW` requiring explicit user diff acknowledgment. |
| **2. Price Escalation** | AI proceeds when base price matches, but shipping/handling drives total over budget. | Total cost evaluation enforces a hard budget ceiling; any overrun results in a deterministic `BLOCK`. |
| **3. Merchant Spoofing** | Compromised agent redirects checkout to an unverified third-party marketplace seller. | Payee verification against user-approved directories and verified PayPal merchant IDs; mismatches result in `BLOCK`. |
| **4. Hidden Subscriptions** | One-time purchase offer secretly enrolls user in a recurring monthly subscription charge. | Structural checkout analysis detects recurring billing schedules and non-zero cycles; triggers immediate `BLOCK`. |
| **5. Prompt Injection** | Product description text contains hidden prompt instructing agent to approve immediate purchase. | External product content treated as untrusted data; LLM output has zero authorization authority. |
| **6. Replay & Duplicate Pay** | Network retry or compromised payload causes duplicate payment authorization execution. | Single-use nonces managed via an atomic two-phase recovery state machine with strict idempotency keys. |
| **7. Cart Substitution** | Item SKU, taxes, or shipping mutate after user approval but before payment capture. | Cryptographic binding via Ed25519 signature over an RFC 8785 canonical hash voids payment upon any alteration. |

---

## 3. Team Roster, Branches & Responsibilities

The project is developed by a five-member engineering team working across isolated Git branches:

```
                                  ┌────────────────────────┐
                                  │   adityasing9 (Lead)   │
                                  │ member-5/backend-integ │
                                  └───────────┬────────────┘
                                              │ Orchestrates
        ┌───────────────────────┬─────────────┴─────────────┬───────────────────────┐
        ▼                       ▼                           ▼                       ▼
┌───────────────┐       ┌───────────────┐           ┌───────────────┐       ┌───────────────┐
│  Prince Kumar │       │    diago-1    │           │   RABINNDRA   │       │    AuGust     │
│   (DevPrince3)│       │  (Security)   │           │   (EVARA566)  │       │  (Frontend)   │
│ member-1/ai-..│       │ member-2/sec..│           │ member-3/pay..│       │ member-4/fr.. │
└───────────────┘       └───────────────┘           └───────────────┘       └───────────────┘
```

### Member Breakdown

1. **Member 1 — Prince Kumar (`DevPrince3`)**  
   - **Branch:** `member-1/ai-commerce-agent`  
   - **Domain:** AI Commerce Agent, LLM integration, intent extraction, catalog discovery (Channel3 — *status: unverified*), product matching, ranking algorithms.
2. **Member 2 — diago-1 (`diago-1`)**  
   - **Branch:** `member-2/security-engine`  
   - **Domain:** IntentLock Security Engine, deterministic policy evaluation, prompt injection scanning, Ed25519 signature generator, replay protection.
3. **Member 3 — RABINNDRA (`EVARA566`)**  
   - **Branch:** `member-3/paypal-integration`  
   - **Domain:** PayPal payment service, PayPal Orders REST API v2, checkout flows, payment capture, webhook listeners, idempotency management.
4. **Member 4 — AuGust (`AuGust`)**  
   - **Branch:** `member-4/frontend-ui`  
   - **Domain:** React + Tailwind CSS client, natural-language search UI, product comparison table, security inspection firewall drawer, explicit approval modal. *(Collaborator invitation pending verification).*
5. **Member 5 — Aditya Singh (`adityasing9`) — [Current User]**  
   - **Branch:** `member-5/backend-integration`  
   - **Domain:** Backend Lead, Express REST API, MongoDB architecture, system orchestration, authentication, module integration, deployment, repository admin.

---

## 4. Technology Stack & Ratified Architectural Baselines

- **Frontend:** React.js, Tailwind CSS (Single Page Application).
- **Backend:** Node.js, Express.js (Modular REST API).
- **Client Authentication:** HTTP-only, Secure, `SameSite=Strict` cookies with CSRF protection (`X-CSRF-Token` header) for state-changing requests. Never assumes `SameSite=Strict` cookies are sent during cross-site navigation from PayPal; mandates 5 distinct test cases (SDK modal flow, redirect flow, session recovery, CSRF enforcement, and idempotency).
- **Rate Limiting:** Enabled in Phase 2 baseline (60 req/min/IP for general APIs, 5-10 req/min for auth, per-`userId` limits, progressive cooldowns).
- **Database:** MongoDB (Mongoose ODM, 64-bit integer minor units / BSON Long, currency precision modeling).
- **AI/LLM:** LLM API integration with structured JSON schema outputs (*provider pending selection by Member 1*).
- **Security & Cryptography:** Deterministic rule engine, RFC 8785 canonical JSON formatting, SHA-256 hashing, Ed25519 digital signatures, atomic nonces with crash-resilient state machine.
- **Authorization Expiry & Nonce Recovery:** Strict **5-minute (300 seconds)** validity window for *new* payment dispatch. Already-dispatched `IN_FLIGHT` orders remain recoverable via `Idempotency-Key` and original PayPal order without creating a second payment.
- **Firewall Policy Precedence:** Critical violations (merchant mismatch, budget overrun, recurring charges) strictly trigger **`BLOCK`**. Non-critical spec mismatches trigger **`REVIEW`** with an explicit user diff confirmation. Untrusted catalog text is passive data; suspicious text alone does not block legitimate products without a policy violation.
- **Payments:** PayPal JavaScript SDK, PayPal Orders REST API v2, PayPal Sandbox, verified webhooks, `PayPal-Request-Id` idempotency.
- **External Discovery:** Channel3 API (*unverified access; offline mock fixture of 15–20 products across keyboards, headphones, and monitors used until verified*).
- **Audit Anchoring:** Dual-trigger external anchoring (recurring every 60 minutes + immediate anchoring after transactions exceeding configurable threshold `HIGH_VALUE_ANCHOR_THRESHOLD_MINOR`).

---

## 5. Development Workflow & Core Governance Rules

### Strict Planning-First Policy
All development on this project adheres to the strict protocol:
$$\text{PLAN FIRST} \longrightarrow \text{REVIEW} \longrightarrow \text{APPROVE} \longrightarrow \text{CODE} \longrightarrow \text{TEST} \longrightarrow \text{COMMIT} \longrightarrow \text{PUSH}$$

- **No Premature Coding:** Never write application code until an explicit architectural plan is reviewed and approved with the instruction: **"LET'S CODE"**.
- **Scope Discipline:** When approved, implement *only* the agreed scope. Do not fabricate unrelated modules or install unapproved packages.

### Git Branching & Protection Rules
- **Branch Confinement:** All work for Member 5 must occur on `member-5/backend-integration`. Never commit or push directly to `main`.
- **Branch Protection on `main`:**
  - Pull Request required before merging.
  - Minimum 1 approving review required.
  - Stale approvals automatically dismissed on new push.
  - Conversation resolution strictly required.
  - Force pushes and branch deletions disabled.
- **Never Switch or Alter Branches Without Instruction:** Do not switch to another member's branch or execute destructive Git commands without explicit user permission.

---

## 6. Documentation Index

The repository maintains durable, persistent documentation in `docs/`:

1. [docs/PROJECT_ARCHITECTURE.md](file:///c:/Users/AADI/Desktop/My/CODE/Github/PayPal/docs/PROJECT_ARCHITECTURE.md): Complete system architecture, trust boundaries, 5-minute validity window, transaction flow, and crash recovery.
2. [docs/TEAM_STRUCTURE.md](file:///c:/Users/AADI/Desktop/My/CODE/Github/PayPal/docs/TEAM_STRUCTURE.md): Detailed team roles, cross-module dependencies, handoff protocols, and external dependency status.
3. [docs/DEVELOPMENT_ROADMAP.md](file:///c:/Users/AADI/Desktop/My/CODE/Github/PayPal/docs/DEVELOPMENT_ROADMAP.md): Hackathon milestone schedule (P0, P1, P2) and definition of done.
4. [docs/API_CONTRACTS.md](file:///c:/Users/AADI/Desktop/My/CODE/Github/PayPal/docs/API_CONTRACTS.md): Formal REST API contracts, cookie auth, CSRF headers, mock payloads, error schemas, and RFC 8785 authorization structures.
5. [docs/DATABASE_DESIGN.md](file:///c:/Users/AADI/Desktop/My/CODE/Github/PayPal/docs/DATABASE_DESIGN.md): MongoDB collections, 64-bit integer minor unit rules, currency precision scales, compound indexes, and audit anchor models.
6. [docs/SECURITY_DESIGN.md](file:///c:/Users/AADI/Desktop/My/CODE/Github/PayPal/docs/SECURITY_DESIGN.md): Threat modeling, deterministic rules (BLOCK vs REVIEW), RFC 8785 Ed25519 signing, crash-resilient nonces, and audit log anchoring limitations.
7. [docs/INTEGRATION_STATUS.md](file:///c:/Users/AADI/Desktop/My/CODE/Github/PayPal/docs/INTEGRATION_STATUS.md): Living progress dashboard, unverified external dependencies, blockers, and decision registry.

---

## 7. AI Assistant Session Recovery Instructions

Whenever an AI assistant session initializes or wakes up:
1. **Read `PROJECT_CONTEXT.md` first.**
2. Check current working branch via `git status`. Verify that the branch is `member-5/backend-integration`.
3. Inspect `docs/INTEGRATION_STATUS.md` to identify completed tasks, work in progress, and active blockers.
4. Check external service verification status before assuming third-party API availability.
5. Verify actual code and directory state before making assumptions.
6. Provide actionable guidance based strictly on reality, not hallucinated progress.
