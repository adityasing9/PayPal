import { payPalService, PayPalPaymentError } from '../services/PayPalService.js';
import { authService } from '../services/AuthService.js';
import { User } from '../models/User.model.js';
import { env } from '../config/env.js';
import { intentLockPaymentService } from '../services/IntentLockPaymentService.js';

export async function createIntentLockOrderController(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'A valid Idempotency-Key header is required.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    const order = await intentLockPaymentService.createOrder({
      proposalId: req.body.proposalId,
      userConsent: req.body.userConsent,
      acknowledgedReviewDiffs: req.body.acknowledgedReviewDiffs,
      userId: req.user._id,
      idempotencyKey
    });

    return res.status(201).json({
      success: true,
      data: order,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function createOrderController(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Payment order creation requires a unique Idempotency-Key header.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    const order = await payPalService.createOrder({
      proposalId: req.body.proposalId,
      authorizationId: req.body.authorizationId,
      userConsent: req.body.userConsent,
      acknowledgedReviewDiffs: req.body.acknowledgedReviewDiffs,
      userId: req.user._id,
      idempotencyKey
    });

    return res.status(201).json({
      success: true,
      data: order,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function captureOrderController(req, res, next) {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IDEMPOTENCY_KEY_REQUIRED',
          message: 'Payment capture requires a unique Idempotency-Key header.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    const captureResult = await payPalService.captureOrder({
      orderId: req.body.orderId,
      authorizationId: req.body.authorizationId,
      userId: req.user._id,
      idempotencyKey
    });

    return res.status(200).json({
      success: true,
      data: captureResult,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles incoming PayPal return redirect (GET /api/payments/return).
 * Acts strictly as a redirect trampoline to the client SPA landing page.
 *
 * CRITICAL INVARIANTS:
 * 1. Validates presence and format of required parameters (token, return_token).
 * 2. NEVER calls recoverReturnSession and NEVER consumes the return token.
 * 3. Token state remains PENDING in database throughout this redirect.
 * 4. NEVER captures funds.
 * 5. Passes return token to SPA strictly via URL fragment (#return_token=...).
 */
export async function returnHandlerController(req, res, next) {
  try {
    const orderId = req.query.token || req.query.orderId;
    const returnToken = req.query.return_token;

    if (!orderId || !returnToken) {
      throw new PayPalPaymentError(
        'Missing required return redirect parameters (token, return_token).',
        'INVALID_OR_EXPIRED_RETURN_TOKEN',
        400
      );
    }

    if (typeof orderId !== 'string' || typeof returnToken !== 'string') {
      throw new PayPalPaymentError(
        'Malformed return redirect parameters.',
        'INVALID_OR_EXPIRED_RETURN_TOKEN',
        400
      );
    }

    const appOrigin = env.APP_ORIGIN || 'http://localhost:3000';
    const redirectUrl = `${appOrigin}/checkout/return?orderId=${encodeURIComponent(orderId)}#return_token=${encodeURIComponent(returnToken)}`;

    // Set Referrer-Policy to block cross-origin token leakage
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // In API/JSON mode (e.g. tests or headless clients specifying Accept: application/json without html)
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(200).json({
        success: true,
        data: {
          message: 'Return redirect validated. Transferring token to SPA via URL fragment.',
          orderId,
          redirectUrl
        },
        timestamp: new Date().toISOString()
      });
    }

    // Standard browser navigation: 302 redirect with fragment
    return res.redirect(302, redirectUrl);
  } catch (err) {
    next(err);
  }
}

/**
 * Handles session recovery from the SPA (POST /api/payments/recover-session).
 * Sole authoritative atomic return token consumer.
 *
 * CRITICAL INVARIANTS:
 * 1. Single-use atomic return token consumption (PENDING -> CONSUMED). Replay fails with 401.
 * 2. Binds session restoration exclusively to the verified PaymentTransaction.userId from the database.
 * 3. NEVER captures funds.
 */
export async function recoverSessionController(req, res, next) {
  try {
    const orderId = req.body?.orderId;
    const returnToken = req.body?.returnToken;

    if (!orderId || !returnToken || typeof orderId !== 'string' || typeof returnToken !== 'string') {
      throw new PayPalPaymentError(
        'Recovery requires orderId and returnToken in request body.',
        'INVALID_OR_EXPIRED_RETURN_TOKEN',
        401
      );
    }

    const recovered = await payPalService.recoverReturnSession({
      orderId,
      returnToken
    });

    // Re-issue session cookie exclusively for the authenticated user bound to transaction
    const user = await User.findById(recovered.userId);
    if (user) {
      const sessionJwt = authService.generateSessionJwt(user);
      authService.setSessionCookie(res, sessionJwt);
    }

    return res.status(200).json({
      success: true,
      data: {
        message: 'Session context recovered successfully. Ready for explicit capture confirmation.',
        orderId: recovered.orderId,
        status: recovered.status,
        amountMinor: recovered.amountMinor,
        currency: recovered.currency
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handles incoming PayPal webhooks.
 */
export async function webhookController(req, res, next) {
  try {
    const result = await payPalService.processWebhook({
      headers: req.headers,
      rawBody: req.rawBody,
      bodyObj: req.body
    });

    const statusCode = result.status === 'FAILED' ? 500 : result.status === 'PROCESSING' ? 503 : 200;
    return res.status(statusCode).json(result);
  } catch (err) {
    next(err);
  }
}
