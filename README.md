# IntentLock Commerce

**An AI Personal Shopping Agent with an Intelligent Payment Security Firewall**

An intelligent, cryptographic security microservice designed to intercept AI-assisted commerce manipulation, drip pricing, deceptive recurring subscriptions, and prompt injections before issuing verifiable **Ed25519 authorization tokens** for PayPal transaction capture.

---

## 5-Member Team Architecture & Integration

- **Member 1 (AI Commerce Agent - THIS SERVICE):** Understands user shopping intents, searches and filters catalog items, manages the cart, and submits `purchase_intent` payloads to Member 2 for authorization.
- **Member 2 (IntentLock Commerce Security Engine):** Validates all 5 security dimensions, computes composite risk, and issues cryptographically signed Ed25519 authorization tokens.
- **Member 3 (Payment Orchestration / PayPal Gateway):** Verifies the compact Ed25519 token using Member 2's public key before initiating PayPal payment capture.
- **Member 4 (Frontend UI / Fulfillment):** Calls the AI Commerce Agent chat interface and renders product recommendations and shopping carts.
- **Member 5 (Backend Integration & Analytics):** Manages shared database storage, authentication, and audit log inspection.

---

# Member 1: AI Commerce Agent (Node.js + Express)

The "brain" of the shopping experience. It understands what a user wants, finds and recommends products, builds a cart, and hands a **purchase intent** to IntentLock (Member 2) -> PayPal (Member 3).
**It never takes payment itself.**

## Quick start (Node 18+)
```bash
npm install
npm run check      # runs all 18 unit tests + the 17-point final verification
npm run demo       # scripted shopping conversation
npm run start:agent # starts Member 1 agent API on http://localhost:8000
curl -X POST localhost:8000/agent/chat -H "Content-Type: application/json" \
     -d '{"user_id":"u1","message":"black running shoes under $80"}'
```

## How it works (explain this to judges)
```
User message -> parseQuery (category, color, price, brand, tags) -> detectIntent
             -> searchProducts (catalog only, in-stock only) -> recommendations + reasons
             -> cart (stock limits) -> checkout = PURCHASE INTENT (PENDING_AUTHORIZATION)
             -> IntentLock authorizes -> PayPal charges
```

| Task area | Where | What it does |
|---|---|---|
| Product data | `agent.js` CATALOG | 16 sample products with one schema (id, name, category, brand, color, price, stock, rating, tags) |
| Language understanding | `parseQuery`, `detectIntent` | "black running shoes under $80" -> filters; follow-ups ("what about in white?", "cheaper ones") via session memory |
| LLM tool-calling | `llm_tools.js` | Optional Claude layer with 4 tools; the model picks tools, facts come only from the catalog |
| Recommendations | `recommendSimilar`, `crossSell` | Similar items and "often bought together", each with a plain-English reason |
| Integration | `prepareCheckout`, `api.js` | Purchase-intent JSON for Member 2; REST API for Member 4 |
| Safety | `INJECTION`, stock checks | Blocks prompt injection, hides out-of-stock, enforces stock limits, relaxes empty searches |
| Testing | `test/`, `verify.js` | 18 unit tests + 17 end-to-end checks |

## Files
| File | Purpose |
|---|---|
| agent.js | Catalog, search, parsing, recommendations, cart, checkout handoff, guardrails (no dependencies) |
| api.js | All routes + validation, framework-free so it is fully unit tested |
| server.js | Thin Express wrapper (CORS + JSON body) around api.js |
| llm_tools.js | Optional Claude tool-calling version (`npm i @anthropic-ai/sdk`, set `ANTHROPIC_API_KEY`) |
| demo.js | Scripted conversation |
| verify.js | Final checklist, one PASS/FAIL line per requirement |
| test/ | Unit tests (`node:test`) |
| TEST_REPORT.md | Saved output of the final test run |

## API contract
| Method | Path | Used by |
|---|---|---|
| POST | /agent/chat | Member 4 (chat) |
| GET | /products, /products/:id | Member 4 (product grid) |
| GET | /cart/:user_id | Member 4 (cart) |
| GET | /health | everyone |

**Request:** `{"user_id": "u1", "message": "..."}`
**Response:** `{reply, intent, products[], cart[], purchase_intent | null}`
**Errors:** 422 `{detail}` bad input, 404 unknown route/product, 400 invalid JSON.

**purchase_intent** (what Member 2 receives at checkout):
```json
{
  "intent_id": "INT-8CB122C518",
  "source": "ai_commerce_agent",
  "user_id": "u1",
  "items": [{"product_id": "P001", "name": "AeroRun Pro Running Shoes", "qty": 2, "unit_price": 79}],
  "total": 158,
  "currency": "USD",
  "stated_intent": "checkout",
  "status": "PENDING_AUTHORIZATION",
  "next_step": "POST to IntentLock /authorize; only if APPROVED -> PayPal create-order"
}
```

---

# Member 2: IntentLock Security Engine

## Architecture Overview

```
intentlock/
├── core/                         # Shared Foundation
│   ├── config.py                 # Security thresholds & system parameters
│   ├── models.py                 # Pydantic-compatible data models & serialization
│   └── errors.py                 # Typed security exception hierarchy
├── workstream1_verification/     # Workstream 1: Flash Tier
│   ├── merchant_verifier.py      # Domain age, typosquatting (paypa1), and reputation
│   └── price_verifier.py         # Negative price exploit, inflation, and subtotal check
├── workstream2_hidden_costs/     # Workstream 2: Flash Tier
│   ├── fee_detector.py           # Drip pricing & junk fee descriptor detection
│   └── subscription_guard.py     # Deceptive trial traps & covert subscription detector
├── workstream3_threat_intel/     # Workstream 3: Pro Tier
│   ├── prompt_injection.py       # Direct/indirect jailbreaks & system prompt overrides
│   ├── canary.py                 # Cryptographic canary token generator & tracker
│   └── sanitizer.py              # Unicode homoglyphs, zero-width spaces, AST tampering
│   └── threat_scorer.py          # Multi-factor threat risk aggregator
├── workstream4_crypto_auth/      # Workstream 4: Pro Tier
│   ├── canonicalizer.py          # RFC 8785 JSON Canonicalization (JCS) & SHA-512
│   ├── signer.py                 # RFC 8032 Ed25519 pure Python asymmetric cryptography
│   └── nonce_guard.py            # Monotonic nonces, epoch windows, and replay defense
├── workstream5_api_db/           # Workstream 5: Flash Tier
│   ├── app.py                    # Flask application factory with security headers
│   ├── routes.py                 # REST API endpoints (/verify, /authorize, /audit, /health)
│   ├── database.py               # SQLite audit repository with foreign-key token store
│   └── team_contracts.py         # Inter-team contracts for Members 1, 3, 4, and 5
├── engine.py                     # Unified coordinator engine pipeline
└── tests/                        # Workstream 6: Pro Tier
    ├── test_workstream1_verif.py
    ├── test_workstream2_costs.py
    ├── test_workstream3_threat.py
    ├── test_workstream4_crypto.py
    ├── test_workstream5_api.py
    └── test_adversarial_audit.py # Red-team attack suite (jailbreaks, replays, bit-flipping)
```

## REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Healthcheck, engine version, and Ed25519 public key. |
| `POST` | `/api/v1/intent/verify` | Runs verification pipeline without issuing tokens. |
| `POST` | `/api/v1/intent/authorize` | Verifies intent, logs audit record, and issues Ed25519 token. |
| `GET` | `/api/v1/intent/audit/<id>` | Retrieves cryptographic audit trail and token record. |

## Cryptographic Key Management (Ed25519)

- **Trusted Public Key (RFC 8032):**
  ```
  4df93f582d2b31f519c1982bb55c1aa46b4d64498fa04164eeb36c44c0f1cca9
  ```
- **Public Key File:** `keys/intentlock_public_key.hex`
- **Private Key Configuration (Zero Git Exposure):**
  The private key is confidential and ignored by Git. Supply via `.env` with `INTENTLOCK_PRIVATE_KEY_HEX=<64_hex_chars>`.

---

# Member 4: Frontend UI

## Technology Stack

- React 19
- Vite
- Tailwind CSS 4
- React Router
- Axios
- Lucide React
- Recharts

## Frontend Features

- User authentication interface
- Login and registration pages
- IntentLock dashboard
- Product and shopping interfaces
- API integration with the backend
- Security and payment interface

## Frontend Setup

Install dependencies:

```bash
npm install
npm run dev:frontend
npm run build
npm run preview

## Frontend Structure

src/
+-- api/
+-- assets/
+-- components/
+-- context/
+-- pages/
+-- App.jsx
+-- index.css

## API Integration

The frontend uses Axios-based API modules for:

- Authentication
- Products
- Intents
- Payments
- Proposals
- Security