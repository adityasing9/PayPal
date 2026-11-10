# IntentLock Commerce — Environment Configuration & Deployment Guide

> **Document Status:** RATIFIED OPERATIONAL SPECIFICATION (v2.0)  
> **Target Audience:** DevOps, System Administrators, Full Engineering Team  
> **Lead Maintainer:** Aditya Singh (`adityasing9`) — Member 5 (Backend Lead)  
> **Last Updated:** 2026-11-08  
> **Strict Operational Rule:** *Never commit `.env` files, private keys, session secrets, or live credentials to source control.*

---

## 1. Complete Environment Variable Catalog

All configuration is parsed and validated at boot time via `src/config/env.js`.

| Variable Name | Environment Classification | Default (Development) | Production Requirement | Purpose & Invariants |
| :--- | :---: | :--- | :--- | :--- |
| `NODE_ENV` | **Required** | `development` | `production` | Enforces runtime behavior and activates strict production fail-closed security guards. |
| `PORT` | **Required** | `5000` | Port assigned by host (e.g. `5000` or `8080`) | TCP listening port for Express application. |
| `APP_ORIGIN` | **Required** | `http://localhost:3000` | Canonical frontend domain (e.g. `https://intentlock.app`) | Whitelisted origin for strict CORS and redirect landing generation. |
| `API_BASE_URL` | **Required** | `http://localhost:5000/api` | Canonical backend API URL (e.g. `https://api.intentlock.app/api`) | Used for constructing return URLs and external webhooks. |
| `TRUST_PROXY_HOPS`| **Required** | `0` | Exact integer number of trusted proxy hops (e.g. `1` for single ALB/Nginx) | Prevents `X-Forwarded-For` spoofing on IP rate limiting. `0` disables proxy trust. |
| `MONGODB_URI` | **Required** | `mongodb://127.0.0.1:27017/intentlock` | MongoDB connection string (Atlas or Replica Set URI) | Invariant: Connection failure triggers immediate process termination. No silent fallbacks. |
| `MONGODB_DB_NAME` | **Required** | `intentlock` | `intentlock` or env-specific DB name | Target database name in MongoDB cluster. |
| `SESSION_SECRET` | **Required** | `dev-fallback-session-secret...` | 32+ high-entropy random characters | Secret key used to sign and verify HMAC-SHA256 session JWTs. Must be $\ge 32$ chars in production. |
| `CSRF_SECRET` | **Required** | `dev-fallback-csrf-secret...` | 32+ high-entropy random characters | Secret key used to generate HMAC-SHA256 user-bound anti-CSRF tokens. Must be $\ge 32$ chars in production. |
| `ED25519_KEY_ID` | **Required** | `KEY_INTENTLOCK_DEV_V1` | Key identifier (e.g. `KEY_PROD_2026_V1`) | Key ID stamped in authorization records and signatures. |
| `ED25519_PUBLIC_KEY`| **Required (Prod)** | Auto-generated dev keypair | 64-character lowercase hex string | 32-byte Ed25519 public key for verifying signed authorizations. |
| `ED25519_PRIVATE_KEY`| **Required (Prod)** | Auto-generated dev keypair | 128-character lowercase hex string | 64-byte Ed25519 private key (seed + public) used by firewall to sign authorizations. |
| `USE_MOCK_SECURITY`| **Dev/Test Only** | `true` (dev default) | **STRICTLY FORBIDDEN (`false`)** | Invariant: If `true` when `NODE_ENV === 'production'`, boot fails closed immediately. |
| `USE_MOCK_PAYPAL` | **Dev/Test Only** | `true` (dev default) | **STRICTLY FORBIDDEN (`false`)** | Invariant: If `true` when `NODE_ENV === 'production'`, boot fails closed immediately. |
| `PAYPAL_ENVIRONMENT`| **Required** | `sandbox` | `sandbox` (for hackathon demo) or `live` | Target PayPal API gateway. |
| `PAYPAL_CLIENT_ID`| **Required (Live PP)** | `""` | PayPal REST App Client ID | Client ID for OAuth2 token acquisition. |
| `PAYPAL_CLIENT_SECRET`| **Required (Live PP)**| `""` | PayPal REST App Secret | Client secret for OAuth2 token acquisition. |
| `PAYPAL_WEBHOOK_ID`| **Required (Live PP)**| `""` | Registered PayPal Webhook ID | Webhook identifier used in CRC32 transmission verification. |
| `AI_PROVIDER` | **Optional** | `offline_fixture` | `offline_fixture`, `gemini`, `openai`, or `anthropic` | AI search provider. |
| `AI_API_KEY` | **Optional** | `""` | Provider API key | Required only if `AI_PROVIDER` is an external LLM. |
| `AI_MODEL` | **Optional** | `gemini-1.5-pro` | Target LLM model name | Model identifier passed to AI SDK. |
| `LOG_LEVEL` | **Optional** | `info` | `info` or `warn` | Minimum log severity level (`error`, `warn`, `info`, `debug`). |
| `HIGH_VALUE_ANCHOR_THRESHOLD_MINOR`| **Optional** | `20000` ($200.00) | Decimal integer string minor units | Threshold for immediate external audit log anchoring. |
| `RATE_LIMIT_WINDOW_MS`| **Optional** | `60000` (1 min) | `60000` | Rate limiting sliding window in milliseconds. |
| `RATE_LIMIT_MAX_GENERAL`| **Optional**| `60` | `60`–`120` | Max general API requests per window per IP. |
| `RATE_LIMIT_MAX_AUTH`| **Optional** | `10` | `5`–`10` | Max sensitive auth requests per window per IP. |

---

## 2. Safe Cryptographic Key Generation

### 2.1 Generating High-Entropy Secrets (Session & CSRF)
Run the following Node.js snippet to generate 256-bit cryptographically secure secrets:
```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CSRF_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 2.2 Generating Ed25519 Keypairs for IntentLock Firewall
IntentLock uses Ed25519 digital signatures. In production, keys must be generated and loaded into environment variables (or AWS Secrets Manager / Google Secret Manager).

Generate a valid pair via Node.js:
```javascript
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const privateKeyHex = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32).toString('hex');

console.log('ED25519_PUBLIC_KEY=' + publicKeyHex);
console.log('ED25519_PRIVATE_KEY=' + privateKeyHex + publicKeyHex);
```

---

## 3. MongoDB Deployment: Replica Set & ACID Transactions

IntentLock repositories utilize atomic conditional writes (`findOneAndUpdate`) and multi-document transactions to prevent double-spending and ensure replay protection.

### 3.1 Local Development Replica Set
To run a single-node replica set locally via Docker:
```bash
docker run -d --name mongo-replica \
  -p 27017:27017 \
  mongo:7.0 --replSet rs0 --bind_ip_all

# Initialize the replica set
docker exec -it mongo-replica mongosh --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: '127.0.0.1:27017'}]})"
```
Connection URI:
```env
MONGODB_URI=mongodb://127.0.0.1:27017/intentlock?replicaSet=rs0
```

### 3.2 Production / MongoDB Atlas Deployment
In Atlas or multi-node production clusters:
- Use connection string with SSL/TLS and replica set parameters:
  `mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/intentlock?retryWrites=true&w=majority`
- Ensure Network Access whitelist includes backend server IPs or VPC peering.
- Set Read Preference: `primary` (to ensure read-after-write consistency on session and nonce validation).

---

## 4. Backend Server Deployment (Node.js 20+)

### 4.1 System Prerequisites
- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`
- **Reverse Proxy:** Nginx, Caddy, AWS ALB, or Cloudflare

### 4.2 Production Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Run as non-root user
USER node
EXPOSE 5000
CMD ["node", "src/server.js"]
```

### 4.3 Reverse Proxy Configuration (Nginx Reference)
```nginx
server {
    listen 443 ssl http2;
    server_name api.intentlock.app;

    ssl_certificate /etc/letsencrypt/live/api.intentlock.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.intentlock.app/privkey.pem;

    # Enforce strict transport security and referrer isolation
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Keep client request body unbuffered for precise webhook verification
        proxy_request_buffering off;
    }
}
```
*Note:* When behind 1 Nginx proxy, set `TRUST_PROXY_HOPS=1` in `.env` so Express rate limiting correctly resolves client IP addresses from `X-Forwarded-For`.

---

## 5. Frontend Deployment (React SPA)

### 5.1 Production Build
```bash
cd frontend
npm run build
```
Generates production assets into `dist/` or `build/`.

### 5.2 Nginx SPA Routing Reference
```nginx
server {
    listen 443 ssl http2;
    server_name intentlock.app;

    root /var/www/intentlock/dist;
    index index.html;

    # Single Page Application fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls directly to backend to eliminate cross-origin complexity
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. PayPal Sandbox Configuration

1. Log into [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Under **Apps & Credentials**, select **Sandbox**, and create an App named `IntentLock Commerce`.
3. Copy:
   - `Client ID` $\to$ `PAYPAL_CLIENT_ID`
   - `Secret` $\to$ `PAYPAL_CLIENT_SECRET`
4. Under **Webhooks**, register a new webhook:
   - **URL:** `https://api.intentlock.app/api/payments/webhooks`
   - **Event Types:**
     - `PAYMENT.CAPTURE.COMPLETED`
     - `PAYMENT.CAPTURE.DENIED`
     - `CHECKOUT.ORDER.APPROVED`
   - Copy generated `Webhook ID` $\to$ `PAYPAL_WEBHOOK_ID`.
5. Under **Sandbox Accounts**, note the test personal buyer and business merchant login credentials.

---

## 7. Security Hardening Checklist

- [ ] `NODE_ENV=production` set on all servers.
- [ ] `USE_MOCK_SECURITY=false` and `USE_MOCK_PAYPAL=false` in production environment.
- [ ] `SESSION_SECRET` and `CSRF_SECRET` generated with 256-bit entropy ($\ge 32$ characters).
- [ ] Ed25519 private key securely provisioned via environment variable, never written to disk or logs.
- [ ] `TRUST_PROXY_HOPS` matches the exact network topology.
- [ ] `APP_ORIGIN` matches canonical frontend domain (no wildcard `*` CORS permitted).
- [ ] Database credentials restricted to `intentlock` database with readWrite role.
- [ ] Webhook URL strictly restricted to HTTPS with valid TLS certificate.
