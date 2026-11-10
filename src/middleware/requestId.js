import crypto from 'node:crypto';

/**
 * Middleware that attaches a unique Request ID to each incoming HTTP request.
 * Adopts existing X-Request-Id header if valid UUID, or generates a new one.
 * Always sets the X-Request-Id response header.
 */
export function requestIdMiddleware(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.length > 0 && incomingId.length <= 128
      ? incomingId
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
