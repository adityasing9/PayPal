import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Member 3 (EVARA566) Mock PayPal Integration Adapter.
 * Simulates PayPal v2 Orders REST API creation, capture, and webhook event payloads for offline/test environments.
 *
 * SECURITY INVARIANT: Strictly prohibited in production environments.
 */
export class PayPalMockAdapter {
  constructor() {
    this._orders = new Map();
    this._captures = new Map();
  }

  /**
   * Asserts runtime environment safety.
   *
   * @private
   */
  _assertNonProduction() {
    if (env.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('SECURITY VIOLATION: Mock PayPal adapter is strictly barred in production.');
    }
  }

  /**
   * Simulates PayPal v2 Order Creation.
   * Enforces idempotency via PayPal-Request-Id / idempotencyKey.
   *
   * @param {{
   *   amountMinor: string | bigint,
   *   currency?: string,
   *   idempotencyKey: string,
   *   payeeMerchantId?: string
   * }} params
   * @returns {object}
   */
  createOrder({ amountMinor, currency = 'USD', idempotencyKey, payeeMerchantId = 'PPM_KEYCHRON_998' }) {
    this._assertNonProduction();

    if (this._orders.has(idempotencyKey)) {
      return this._orders.get(idempotencyKey);
    }

    const orderId = `PAYPAL_ORDER_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const amountVal = (Number(amountMinor) / 100).toFixed(2);

    const order = {
      id: orderId,
      status: 'CREATED',
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: idempotencyKey,
          amount: {
            currency_code: currency,
            value: amountVal
          },
          payee: {
            merchant_id: payeeMerchantId
          }
        }
      ],
      links: [
        {
          rel: 'approve',
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
          method: 'GET'
        }
      ]
    };

    this._orders.set(idempotencyKey, order);
    return order;
  }

  /**
   * Simulates PayPal v2 Order Capture.
   *
   * @param {{
   *   orderId: string,
   *   idempotencyKey: string
   * }} params
   * @returns {object}
   */
  captureOrder({ orderId, idempotencyKey }) {
    this._assertNonProduction();

    if (this._captures.has(idempotencyKey)) {
      return this._captures.get(idempotencyKey);
    }

    const captureId = `CAP_${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const capture = {
      id: orderId,
      status: 'COMPLETED',
      payer: {
        email_address: 'buyer@sandbox.paypal.com',
        payer_id: 'PAYER_MOCK_SANDBOX_123'
      },
      purchase_units: [
        {
          payments: {
            captures: [
              {
                id: captureId,
                status: 'COMPLETED',
                final_capture: true
              }
            ]
          }
        }
      ]
    };

    this._captures.set(idempotencyKey, capture);
    return capture;
  }

  /**
   * Generates a realistic but clearly quarantined mock webhook fixture for offline testing.
   *
   * @param {{
   *   eventType?: string,
   *   resourceId?: string,
   *   amountMinor?: string,
   *   currency?: string
   * }} [options]
   * @returns {{ headers: Record<string, string>, body: object }}
   */
  generateMockWebhook({
    eventType = 'PAYMENT.CAPTURE.COMPLETED',
    resourceId = 'CAP_MOCK_123',
    amountMinor = '9900',
    currency = 'USD'
  } = {}) {
    this._assertNonProduction();

    const eventId = `WH-MOCK-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const nowIso = new Date().toISOString();

    const headers = {
      'content-type': 'application/json',
      'x-intentlock-mock-webhook': 'true',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-SANDBOX-TEST',
      'paypal-transmission-id': crypto.randomUUID(),
      'paypal-transmission-sig': Buffer.from('mock_test_signature').toString('base64'),
      'paypal-transmission-time': nowIso
    };

    const body = {
      id: eventId,
      event_version: '1.0',
      create_time: nowIso,
      resource_type: 'capture',
      event_type: eventType,
      summary: `Payment capture completed for ${resourceId}`,
      mockEvent: true,
      event_source: 'MOCK_TEST_HARNESS',
      resource: {
        id: resourceId,
        status: 'COMPLETED',
        amount: {
          currency_code: currency,
          value: (Number(amountMinor) / 100).toFixed(2)
        }
      }
    };

    return { headers, body };
  }

  /**
   * Validates a PayPal certificate URL against exact host and SSRF defense rules.
   *
   * @param {string} certUrl
   * @returns {boolean} True if valid; throws error if invalid.
   */
  validateCertificateUrl(certUrl) {
    if (!certUrl || typeof certUrl !== 'string') {
      throw new Error('Certificate URL is required.');
    }

    const parsed = new URL(certUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('Certificate URL must use HTTPS.');
    }

    const allowedHosts = ['api.paypal.com', 'api.sandbox.paypal.com'];
    if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new Error(`Certificate host "${parsed.hostname}" is not an allowed PayPal host.`);
    }

    if (parsed.port && parsed.port !== '443') {
      throw new Error('Certificate URL must use default HTTPS port (443).');
    }

    return true;
  }
}

export const paypalMockAdapter = new PayPalMockAdapter();
