
An intelligent, cryptographic security microservice designed to intercept AI-assisted commerce manipulation, drip pricing, deceptive recurring subscriptions, and prompt injections before issuing verifiable **Ed25519 authorization tokens** for PayPal transaction capture.

---

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
│   ├── sanitizer.py              # Unicode homoglyphs, zero-width spaces, AST tampering
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

---

## 5-Member Team Architecture & Integration

- **Member 1 (Agent Cart / Frontend):** Submits buyer intent payloads matching `IntentPayload` schema to `POST /api/v1/intent/authorize`.
- **Member 2 (IntentLock Commerce Security Engine - THIS SERVICE):** Validates all 5 security dimensions, computes composite risk, and issues cryptographically signed authorization tokens.
- **Member 3 (Payment Orchestration / PayPal Gateway):** Verifies the compact Ed25519 token using Member 2's public key before initiating PayPal payment capture.
- **Member 4 (Fulfillment Service):** Uses the immutable `intent_hash` to match authorized items with inventory release.
- **Member 5 (Compliance & Analytics Dashboard):** Consumes `GET /api/v1/intent/audit/{id}` for real-time risk observability and audit log inspection.

---

## REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Healthcheck, engine version, and Ed25519 public key. |
| `POST` | `/api/v1/intent/verify` | Runs verification pipeline without issuing tokens. |
| `POST` | `/api/v1/intent/authorize` | Verifies intent, logs audit record, and issues Ed25519 token. |
| `GET` | `/api/v1/intent/audit/<id>` | Retrieves cryptographic audit trail and token record. |

---

## Cryptographic Key Management (Ed25519)

- **Trusted Public Key (RFC 8032):**
  ```
  4df93f582d2b31f519c1982bb55c1aa46b4d64498fa04164eeb36c44c0f1cca9
  ```
- **Public Key File:** `keys/intentlock_public_key.hex`
- **Private Key Configuration (Zero Git Exposure):**
  The private key is confidential and ignored by Git. Teammates running the service can supply the persistent private key through either:
  1. **`.env` file (Recommended):** Copy `.env.example` to `.env` and set `INTENTLOCK_PRIVATE_KEY_HEX=<64_hex_chars>`.
  2. **Local Key File:** Place the hex key in `keys/intentlock_private_key.hex`.
  3. **Interactive Setup Script:** Run `python scripts/setup_key.py` to securely enter and validate the key without leaving terminal history.

The service validates on startup that the configured private key derives the trusted public key.

---

## Running the Automated Test Suite

```bash
python -m unittest discover -v tests
```

All 37 unit, integration, red-team adversarial, and RFC cross-language interop tests run in ~2.5 seconds with zero external network or C-library dependencies.
