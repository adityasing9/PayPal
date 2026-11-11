import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config/env.js';
import { payPalService } from '../../src/services/PayPalService.js';

describe('PayPal Sandbox API configuration and webhook verification', () => {
  const originalWebhookId = env.PAYPAL_WEBHOOK_ID;

  afterEach(() => {
    env.PAYPAL_WEBHOOK_ID = originalWebhookId;
    vi.restoreAllMocks();
  });

  it('sends the official verification fields to the Sandbox API with a bounded timeout', async () => {
    env.PAYPAL_WEBHOOK_ID = 'SANDBOX-WEBHOOK-ID';
    vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
    vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('sandbox-test-token');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verification_status: 'SUCCESS' })
    });
    const event = { id: 'WH-EVENT-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' };
    const headers = {
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/test',
      'paypal-transmission-id': 'transmission-test',
      'paypal-transmission-sig': 'signature-test',
      'paypal-transmission-time': '2026-11-11T00:00:00Z'
    };

    await expect(payPalService.verifyWebhookSignature(headers, event)).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(Object),
        body: JSON.stringify({
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: 'SANDBOX-WEBHOOK-ID',
          webhook_event: event
        })
      })
    );
  });

  it('fails closed when PayPal verification times out', async () => {
    env.PAYPAL_WEBHOOK_ID = 'SANDBOX-WEBHOOK-ID';
    vi.spyOn(payPalService, 'isMockMode').mockReturnValue(false);
    vi.spyOn(payPalService, 'getAccessToken').mockResolvedValue('sandbox-test-token');
    const timeout = new Error('test timeout');
    timeout.name = 'TimeoutError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout);

    await expect(
      payPalService.verifyWebhookSignature(
        {
          'paypal-auth-algo': 'SHA256withRSA',
          'paypal-cert-url': 'https://api.sandbox.paypal.com/cert',
          'paypal-transmission-id': 'transmission-test',
          'paypal-transmission-sig': 'signature-test',
          'paypal-transmission-time': '2026-11-11T00:00:00Z'
        },
        { id: 'WH-EVENT-1' }
      )
    ).rejects.toMatchObject({ code: 'PAYPAL_TIMEOUT', statusCode: 504 });
  });
});
