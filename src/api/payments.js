
import { apiRequest, initializeCsrfToken } from "./client";

// Generate a unique idempotency key
export function createIdempotencyKey() {
  return globalThis.crypto.randomUUID();
}

// Create a PayPal order
export function createPayPalOrder({
  proposalId,
  authorizationId,
  acknowledgedReviewDiffs = [],
  idempotencyKey,
}) {
  if (!idempotencyKey) {
    throw new Error("An idempotency key is required.");
  }

  return apiRequest(
    "POST",
    "/payments/create-order",
    {
      proposalId,
      authorizationId,
      userConsent: true,
      acknowledgedReviewDiffs,
    },
    {
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    }
  );
}

// Recover session after returning from PayPal
export async function recoverPayPalSession({
  orderId,
  returnToken,
}) {
  const result = await apiRequest(
    "POST",
    "/payments/recover-session",
    {
      orderId,
      returnToken,
    }
  );

  await initializeCsrfToken();

  return result;
}

// Capture an approved PayPal order
export function capturePayPalOrder({
  orderId,
  authorizationId,
  idempotencyKey,
}) {
  if (!idempotencyKey) {
    throw new Error("An idempotency key is required.");
  }

  return apiRequest(
    "POST",
    "/payments/capture-order",
    {
      orderId,
      authorizationId,
    },
    {
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
    }
  );
}
