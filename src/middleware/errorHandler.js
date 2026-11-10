import { ZodError } from 'zod';

/**
 * 404 Not Found Middleware.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
      details: []
    },
    timestamp: new Date().toISOString()
  });
}

/**
 * Centralized Application Error Handler.
 * Formats all uncaught errors into the standardized API error envelope.
 * Strictly avoids leaking stack traces or credentials in production/client responses.
 */
export function errorHandler(err, req, res, _next) {
  // Determine appropriate HTTP status code
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal server error occurred.';
  let details = [];

  if (err instanceof ZodError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Request validation failed.';
    details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code
    }));
  } else if (err.statusCode && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
    errorCode = err.code || 'REQUEST_FAILED';
    message = err.message || 'Request failed';
  } else if (err.code) {
    switch (err.code) {
      case 'INVALID_OR_EXPIRED_RETURN_TOKEN':
        statusCode = 401;
        errorCode = 'INVALID_OR_EXPIRED_RETURN_TOKEN';
        message = 'Invalid or expired return token.';
        break;
      case 'DUPLICATE_NONCE':
      case 'DUPLICATE_TRANSACTION':
      case 'AUTHORIZATION_CONFLICT':
      case 'AUTHORIZATION_ALREADY_CONSUMED':
      case 'STALE_WORKER_FENCE_ERROR':
        statusCode = 409;
        errorCode = err.code;
        message = err.message;
        break;
      case 'AUTHORIZATION_NOT_FOUND':
      case 'TRANSACTION_NOT_FOUND':
        statusCode = 404;
        errorCode = err.code;
        message = err.message;
        break;
      case 'AUTHORIZATION_EXPIRED':
      case 'SNAPSHOT_MISMATCH':
      case 'INVALID_AUTHORIZATION_STATE':
        statusCode = 400;
        errorCode = err.code;
        message = err.message;
        break;
      default:
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
          statusCode = 401;
          errorCode = 'AUTHENTICATION_REQUIRED';
          message = 'Invalid or expired authentication session.';
        }
        break;
    }
  }

  // Log error with request ID
  if (statusCode >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(`[Error] Request ${req.id || 'N/A'} failed:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details
    },
    timestamp: new Date().toISOString()
  });
}
