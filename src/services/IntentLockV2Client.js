import { env } from '../config/env.js';
import { verifyIntentLockV2Handoff } from '../utils/intentLockV2Verifier.js';

export class IntentLockV2ClientError extends Error {
  constructor(message, code = 'INTENTLOCK_UNAVAILABLE', statusCode = 503) {
    super(message);
    this.name = 'IntentLockV2ClientError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function getAuthorizeUrl() {
  if (!env.FLASK_INTENTLOCK_SERVICE_TOKEN) {
    throw new IntentLockV2ClientError(
      'Flask IntentLock service authentication is not configured.',
      'INTENTLOCK_CONFIGURATION_ERROR',
      503
    );
  }
  if (
    !Number.isSafeInteger(env.FLASK_INTENTLOCK_TIMEOUT_MS) ||
    env.FLASK_INTENTLOCK_TIMEOUT_MS <= 0
  ) {
    throw new IntentLockV2ClientError(
      'Flask IntentLock request timeout is invalid.',
      'INTENTLOCK_CONFIGURATION_ERROR',
      503
    );
  }

  let base;
  try {
    base = new URL(env.FLASK_INTENTLOCK_BASE_URL);
  } catch {
    throw new IntentLockV2ClientError(
      'Flask IntentLock base URL is invalid.',
      'INTENTLOCK_CONFIGURATION_ERROR',
      503
    );
  }
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (env.NODE_ENV === 'production' && base.protocol !== 'https:')
  ) {
    throw new IntentLockV2ClientError(
      'Flask IntentLock base URL must be a credential-free HTTPS URL in production.',
      'INTENTLOCK_CONFIGURATION_ERROR',
      503
    );
  }
  return new URL('/api/v2/intent/authorize', base).toString();
}

export async function authorizePurchase(intentPayload, authorizationContext) {
  const url = getAuthorizeUrl();
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-IntentLock-Service-Token': env.FLASK_INTENTLOCK_SERVICE_TOKEN
      },
      body: JSON.stringify({
        ...intentPayload,
        authorization_context: authorizationContext
      }),
      signal: globalThis.AbortSignal.timeout(env.FLASK_INTENTLOCK_TIMEOUT_MS)
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new IntentLockV2ClientError(
        'Flask IntentLock authorization request timed out.',
        'INTENTLOCK_TIMEOUT',
        503
      );
    }
    throw new IntentLockV2ClientError(
      'Unable to reach the Flask IntentLock authorization service.'
    );
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new IntentLockV2ClientError(
      'Flask IntentLock returned an invalid response.',
      'INVALID_INTENTLOCK_RESPONSE',
      502
    );
  }
  if (response.status === 403 || result?.authorized === false) {
    throw new IntentLockV2ClientError(
      'Flask IntentLock denied authorization for this purchase.',
      'INTENTLOCK_AUTHORIZATION_DENIED',
      403
    );
  }
  if (!response.ok || result?.authorized !== true) {
    throw new IntentLockV2ClientError(
      'Flask IntentLock did not authorize the purchase.',
      'INTENTLOCK_HTTP_ERROR',
      502
    );
  }

  try {
    return verifyIntentLockV2Handoff(
      result.handoff_to_member3,
      authorizationContext,
      { publicKey: env.FLASK_INTENTLOCK_PUBLIC_KEY }
    );
  } catch (error) {
    if (error?.name === 'IntentLockV2VerificationError') {
      throw new IntentLockV2ClientError(
        'Flask IntentLock returned an invalid V2 authorization.',
        error.code,
        error.code === 'INTENTLOCK_CONFIGURATION_ERROR' ? 503 : 403
      );
    }
    throw error;
  }
}
