import { describe, expect, it, vi } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { env } from '../../src/config/env.js';
import { authorizePurchase } from '../../src/services/IntentLockV2Client.js';
import { verifyIntentLockV2Handoff } from '../../src/utils/intentLockV2Verifier.js';

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function startFlaskAuthorizationService() {
  const port = await getFreePort();
  const directory = mkdtempSync(join(tmpdir(), 'intentlock-flask-v2-'));
  const serviceToken = 'integration-test-service-token';
  const script = [
    'import os',
    'from werkzeug.serving import make_server',
    'from intentlock.engine import IntentLockEngine',
    'from intentlock.workstream5_api_db.app import create_app',
    'engine = IntentLockEngine(db_path=os.environ["INTENTLOCK_DB_PATH"])',
    'server = make_server("127.0.0.1", int(os.environ["PORT"]), create_app(engine), threaded=True)',
    'print("READY " + engine.public_key_hex, flush=True)',
    'server.serve_forever()'
  ].join('\n');
  const child = spawn('python', ['-u', '-c', script], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INTENTLOCK_DB_PATH: join(directory, 'engine.db'),
      INTENTLOCK_SERVICE_TOKEN: serviceToken,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  let errorOutput = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (data) => {
    errorOutput += data;
  });
  const publicKey = await new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Flask authorization service did not start: ${errorOutput}`));
      }
    }, 15000);
    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
    child.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Flask authorization service exited (${code}): ${errorOutput}`));
      }
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      output += data;
      const readyLine = output.split(/\r?\n/).find((line) => line.startsWith('READY '));
      if (readyLine && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(readyLine.slice('READY '.length));
      }
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    publicKey,
    serviceToken,
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        await new Promise((resolve) => child.once('exit', resolve));
      }
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

function issuePythonHandoff() {
  const script = [
    'import json',
    'from intentlock.workstream4_crypto_auth.signer import Ed25519Signer',
    'from intentlock.workstream5_api_db.team_contracts import TeamMemberContracts',
    'signer = Ed25519Signer.generate_keypair()',
    'context = {',
    '  "user_id": "abcdef0123456789abcdef01",',
    '  "intent_id": "0123456789abcdef01234567",',
    '  "intent_version": 1,',
    '  "proposal_id": "111111111111111111111111",',
    '  "snapshot_id": "222222222222222222222222",',
    '  "snapshot_hash": "ab" * 32,',
    '  "amount_minor": "4320",',
    '  "currency": "USD",',
    '  "minor_unit_exponent": 2,',
    '  "merchant_id": "MERCHANT_TEST",',
    '  "paypal_merchant_id": "PPM_TEST"',
    '}',
    'token = signer.create_authorization_token("0123456789abcdef01234567", "cd" * 64, "ef" * 16, validity_seconds=60, binding_context=context)',
    'print(json.dumps(TeamMemberContracts.member3_handoff_contract(token)))'
  ].join('\n');
  const result = spawnSync('python', ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15000
  });
  if (result.status !== 0) {
    throw new Error(`Python V2 signer failed: ${result.stderr}`);
  }
  const handoff = JSON.parse(result.stdout);
  return {
    handoff,
    bindings: {
      user_id: handoff.user_id,
      intent_id: handoff.intent_id,
      intent_version: handoff.intent_version,
      proposal_id: handoff.proposal_id,
      snapshot_id: handoff.snapshot_id,
      snapshot_hash: handoff.snapshot_hash,
      amount_minor: handoff.amount_minor,
      currency: handoff.currency,
      minor_unit_exponent: handoff.minor_unit_exponent,
      merchant_id: handoff.merchant_id,
      paypal_merchant_id: handoff.paypal_merchant_id
    }
  };
}

describe('Flask-to-Node INTENTLOCK_V2 interoperability', () => {
  it('verifies a token generated by the Python Ed25519 signer and JCS purchase hash', () => {
    const { handoff, bindings } = issuePythonHandoff();
    const result = verifyIntentLockV2Handoff(handoff, bindings, {
      publicKey: handoff.public_key
    });

    expect(result.protocol).toBe('INTENTLOCK_V2_ED25519');
    expect(result.nonce).toBe(handoff.nonce);
    expect(result.purchaseHash).toBe(handoff.purchase_hash);
    expect(result.purchaseHash).toBe(
      '566e5ea86f4a530ad50425e6e656312a88a30043b0da1047336bd46e0ebf5a7efd9f3a5786656e08963b24ed6b710bb5004d4fd427badc7415a3ca929a94e702'
    );
    expect(result.expiresAt - result.issuedAt).toBe(60);
  });

  it('rejects invalid signatures, protocol downgrade, expired tokens, and mismatched purchase bindings', () => {
    const { handoff, bindings } = issuePythonHandoff();
    const [header, claims, signature] = handoff.authorization_token.split('.');
    const tamperedToken = `${header}.${claims}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

    expect(() => verifyIntentLockV2Handoff(
      { ...handoff, authorization_token: tamperedToken },
      bindings,
      { publicKey: handoff.public_key }
    )).toThrow();

    expect(() => verifyIntentLockV2Handoff(
      { ...handoff, protocol: 'INTENTLOCK_V1_ED25519' },
      bindings,
      { publicKey: handoff.public_key }
    )).toThrow();

    expect(() => verifyIntentLockV2Handoff(
      handoff,
      bindings,
      { publicKey: handoff.public_key, nowSeconds: handoff.expires_at }
    )).toThrow(/expired/i);

    expect(() => verifyIntentLockV2Handoff(
      handoff,
      { ...bindings, user_id: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
      { publicKey: handoff.public_key }
    )).toThrow(/purchase bindings/i);
  });

  it('sends authoritative bindings to the v2 endpoint and verifies its Python-signed response', async () => {
    const { handoff, bindings } = issuePythonHandoff();
    const previous = {
      baseUrl: env.FLASK_INTENTLOCK_BASE_URL,
      publicKey: env.FLASK_INTENTLOCK_PUBLIC_KEY,
      serviceToken: env.FLASK_INTENTLOCK_SERVICE_TOKEN
    };
    env.FLASK_INTENTLOCK_BASE_URL = 'http://127.0.0.1:8000';
    env.FLASK_INTENTLOCK_PUBLIC_KEY = handoff.public_key;
    env.FLASK_INTENTLOCK_SERVICE_TOKEN = 'test-service-token';
    let request;
    vi.stubGlobal('fetch', async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            authorized: true,
            handoff_to_member3: handoff
          };
        }
      };
    });

    try {
      const verified = await authorizePurchase(
        { intent_id: bindings.intent_id, buyer_id: bindings.user_id },
        bindings
      );
      expect(verified.protocol).toBe('INTENTLOCK_V2_ED25519');
      expect(request.url).toBe('http://127.0.0.1:8000/api/v2/intent/authorize');
      expect(request.options.headers['X-IntentLock-Service-Token']).toBe('test-service-token');
      expect(JSON.parse(request.options.body).authorization_context).toEqual(bindings);
    } finally {
      vi.unstubAllGlobals();
      env.FLASK_INTENTLOCK_BASE_URL = previous.baseUrl;
      env.FLASK_INTENTLOCK_PUBLIC_KEY = previous.publicKey;
      env.FLASK_INTENTLOCK_SERVICE_TOKEN = previous.serviceToken;
    }
  });

  it('accepts a signed authorization from the live Flask HTTP endpoint', async () => {
    const service = await startFlaskAuthorizationService();
    const previous = {
      baseUrl: env.FLASK_INTENTLOCK_BASE_URL,
      publicKey: env.FLASK_INTENTLOCK_PUBLIC_KEY,
      serviceToken: env.FLASK_INTENTLOCK_SERVICE_TOKEN
    };
    const bindings = {
      user_id: 'abcdef0123456789abcdef01',
      intent_id: '0123456789abcdef01234567',
      intent_version: 1,
      proposal_id: '111111111111111111111111',
      snapshot_id: '222222222222222222222222',
      snapshot_hash: 'ab'.repeat(32),
      amount_minor: '4320',
      currency: 'USD',
      minor_unit_exponent: 2,
      merchant_id: 'M1',
      paypal_merchant_id: 'PPM_TEST_1'
    };
    env.FLASK_INTENTLOCK_BASE_URL = service.baseUrl;
    env.FLASK_INTENTLOCK_PUBLIC_KEY = service.publicKey;
    env.FLASK_INTENTLOCK_SERVICE_TOKEN = service.serviceToken;

    try {
      const authorization = await authorizePurchase({
        intent_id: bindings.intent_id,
        buyer_id: bindings.user_id,
        session_id: 'session-integration-test',
        merchant: {
          merchant_id: bindings.merchant_id,
          name: 'Google',
          domain: 'store.google.com',
          is_verified: true
        },
        items: [{
          item_id: 'ITM1',
          name: 'Wireless Mouse',
          sku: 'WM-1',
          unit_price: 40,
          quantity: 1,
          catalog_baseline_price: 40
        }],
        costs: {
          subtotal: 40,
          tax: 3.2,
          shipping: 0,
          total_charged: 43.2,
          currency: 'USD'
        },
        subscription: { is_subscription: false }
      }, bindings);

      expect(authorization.protocol).toBe('INTENTLOCK_V2_ED25519');
      expect(authorization.purchaseHash).toMatch(/^[a-f0-9]{128}$/);
      expect(authorization.expiresAt - authorization.issuedAt).toBeLessThanOrEqual(60);
    } finally {
      env.FLASK_INTENTLOCK_BASE_URL = previous.baseUrl;
      env.FLASK_INTENTLOCK_PUBLIC_KEY = previous.publicKey;
      env.FLASK_INTENTLOCK_SERVICE_TOKEN = previous.serviceToken;
      await service.stop();
    }
  }, 20000);
});
