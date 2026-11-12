import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { dispatchRequest } from '../helpers/testClient.js';

describe('IntentLock BFF payment boundary', () => {
  const previousSecret = env.PARENT_BFF_SECRET;

  afterEach(() => {
    env.PARENT_BFF_SECRET = previousSecret;
  });

  it('rejects direct requests without the parent service credential before user or database access', async () => {
    env.PARENT_BFF_SECRET = 'test-parent-bff-secret-000000000000';
    const response = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/payments/intentlock/create-order',
      body: {
        proposalId: '0123456789abcdef01234567',
        userConsent: true
      }
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INTERNAL_SERVICE_AUTHENTICATION_REQUIRED');
  });

  it('fails closed when the parent service credential is not configured', async () => {
    env.PARENT_BFF_SECRET = '';
    const response = await dispatchRequest(app, {
      method: 'POST',
      url: '/api/payments/intentlock/create-order',
      body: {
        proposalId: '0123456789abcdef01234567',
        userConsent: true
      }
    });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('INTERNAL_BFF_NOT_CONFIGURED');
  });
});
