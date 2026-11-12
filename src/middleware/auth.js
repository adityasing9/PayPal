import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.model.js';
import { verifyCsrfToken } from '../utils/cryptoUtils.js';

export function requireInternalBff(req, res, next) {
  const expected = env.PARENT_BFF_SECRET;
  const supplied = req.headers['x-internal-service-key'];
  if (!expected) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'INTERNAL_BFF_NOT_CONFIGURED',
        message: 'Parent backend service authentication is not configured.',
        details: []
      },
      timestamp: new Date().toISOString()
    });
  }
  if (typeof supplied !== 'string') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVICE_AUTHENTICATION_REQUIRED',
        message: 'A valid parent backend service credential is required.',
        details: []
      },
      timestamp: new Date().toISOString()
    });
  }

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !crypto.timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVICE_AUTHENTICATION_REQUIRED',
        message: 'A valid parent backend service credential is required.',
        details: []
      },
      timestamp: new Date().toISOString()
    });
  }
  return next();
}

/**
 * Authentication Middleware: enforces valid JWT session cookie and primary DB sessionVersion.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication session cookie is missing.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.SESSION_SECRET, { algorithms: ['HS256'] });
    } catch {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication session token is invalid or expired.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    if (!decoded || !decoded.sub) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Invalid session payload.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    // Primary database read to verify user status and sessionVersion
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'User account not found or inactive.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    // Verify sessionVersion matches (global session revocation check)
    if (user.sessionVersion !== decoded.sessionVersion) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_REVOKED',
          message: 'Session has been invalidated. Please log in again.',
          details: []
        },
        timestamp: new Date().toISOString()
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional Authentication Middleware: populates req.user if session cookie is valid.
 */
export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];
    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, env.SESSION_SECRET, { algorithms: ['HS256'] });
      if (decoded && decoded.sub) {
        const user = await User.findById(decoded.sub);
        if (user && user.isActive && user.sessionVersion === decoded.sessionVersion) {
          req.user = user;
          return next();
        }
      }
    } catch {
      // Ignore token verification errors in optionalAuth
    }

    req.user = null;
    next();
  } catch {
    req.user = null;
    next();
  }
}

/**
 * CSRF Protection Middleware: enforces valid X-CSRF-Token on state-changing requests.
 */
export function requireCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'];
  if (!csrfToken || typeof csrfToken !== 'string') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_TOKEN_MISSING',
        message: 'State-changing operations require a valid X-CSRF-Token header.',
        details: []
      },
      timestamp: new Date().toISOString()
    });
  }

  const expectedUserId = req.user ? req.user._id.toString() : 'anonymous_session';
  const expectedSessionVersion = req.user ? req.user.sessionVersion : 1;

  const verification = verifyCsrfToken(csrfToken, {
    expectedUserId,
    expectedSessionVersion,
    secret: env.CSRF_SECRET
  });

  if (!verification.valid) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'CSRF_VALIDATION_FAILED',
        message: `CSRF validation rejected: ${verification.reason}`,
        details: []
      },
      timestamp: new Date().toISOString()
    });
  }

  next();
}
