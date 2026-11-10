import { Router } from 'express';
import {
  createOrderController,
  captureOrderController,
  returnHandlerController,
  recoverSessionController,
  webhookController
} from '../controllers/payments.controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { createOrderSchema, captureOrderSchema } from '../schemas/payment.schema.js';

const router = Router();

// Order creation (Requires authentication, CSRF token, Idempotency-Key, and explicit userConsent)
router.post(
  '/create-order',
  paymentLimiter,
  requireAuth,
  requireCsrf,
  validate(createOrderSchema),
  createOrderController
);

// Order capture (Requires authentication, CSRF token, and Idempotency-Key. NEVER executed on GET)
router.post(
  '/capture-order',
  paymentLimiter,
  requireAuth,
  requireCsrf,
  validate(captureOrderSchema),
  captureOrderController
);

// PayPal return redirect trampoline (Passes return token via URL fragment; NEVER captures funds; NEVER consumes token)
router.get('/return', returnHandlerController);

// Session recovery (Consumes single-use return token atomically; restores session cookie; NEVER captures funds)
router.post('/recover-session', recoverSessionController);

// PayPal webhooks
router.post('/webhooks', webhookController);

export default router;
