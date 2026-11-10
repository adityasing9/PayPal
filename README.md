# IntentLock Commerce

**An AI Personal Shopping Agent with an Intelligent Payment Security Firewall**

## Project Overview

IntentLock Commerce combines AI-powered product discovery with an independent transaction security engine.

### Core Features
- AI-powered shopping assistant
- Natural-language purchasing intent
- Product specification verification
- Budget and price protection
- Merchant verification
- Prompt injection detection
- Cryptographically signed purchase authorization
- PayPal Sandbox integration
- Transaction audit history

## Technology Stack
- React
- Node.js
- Express.js
- MongoDB
- LLM APIs
- PayPal Sandbox

## Development
This repository is maintained by a five-member development team using individual Git branches and Pull Requests.

## Project Status
Under development — PayPal AI Hackathon 2026.

---

# AI Commerce Agent - Member 1 (PayPal Hackathon) | Node.js + Express

The "brain" of the shopping experience. It understands what a user wants, finds and recommends
products, builds a cart, and hands a **purchase intent** to IntentLock (Member 2) -> PayPal (Member 3).
**It never takes payment itself.**

## Quick start (Node 18+)
    npm install
    npm run check      # runs all 18 unit tests + the 17-point final verification
    npm run demo       # scripted shopping conversation
    npm start          # API on http://localhost:8000
    curl -X POST localhost:8000/agent/chat -H "Content-Type: application/json" \
         -d '{"user_id":"u1","message":"black running shoes under $80"}'

## How it works (explain this to judges)
    User message -> parseQuery (category, color, price, brand, tags) -> detectIntent
                 -> searchProducts (catalog only, in-stock only) -> recommendations + reasons
                 -> cart (stock limits) -> checkout = PURCHASE INTENT (PENDING_AUTHORIZATION)
                 -> IntentLock authorizes -> PayPal charges

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
    {
      "intent_id": "INT-8CB122C518", "source": "ai_commerce_agent", "user_id": "u1",
      "items": [{"product_id": "P001", "name": "AeroRun Pro Running Shoes", "qty": 2, "unit_price": 79}],
      "total": 158, "currency": "USD", "stated_intent": "checkout",
      "status": "PENDING_AUTHORIZATION",
      "next_step": "POST to IntentLock /authorize; only if APPROVED -> PayPal create-order"
    }

## What each teammate needs to do
- **Member 2 (IntentLock):** expose `POST /authorize` that accepts a `purchase_intent` and returns APPROVED or DENIED.
- **Member 3 (PayPal):** create the PayPal order only for intents IntentLock approved.
- **Member 4 (Frontend):** call `POST /agent/chat`; render `products` as cards and show `reply`.
- **Member 5 (Backend):** replace `CATALOG` with database queries (keep the same product fields) and persist sessions if needed.

## Known limitations (be upfront with judges)
- Sample catalog of 16 made-up products.
- Language parsing is rule-based (works offline, repeatable). It covers common phrasings, not every sentence; `llm_tools.js` is the path for fully free-form chat.
- Sessions are in memory and reset when the server restarts.
- No `/docs` page; use curl or add `swagger-ui-express`.
