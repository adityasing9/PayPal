/**
 * Sensitive fields that must be redacted in all log messages.
 */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'returntoken',
  'sessionsecret',
  'csrfsecret',
  'privatekey',
  'secret',
  'clientsecret',
  'cookie',
  'authorization'
]);

/**
 * Recursively redacts sensitive keys from an object.
 *
 * @param {any} obj
 * @returns {any} Redacted copy of object
 */
export function redactSensitive(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitive);
  }

  const redacted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Structured request logging middleware.
 */
export function requestLogger(req, res, next) {
  // Suppress verbose logs during test runs
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logEntry = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      timestamp: new Date().toISOString()
    };

    // Output JSON structured log
    const output = JSON.stringify(logEntry);
    if (res.statusCode >= 500) {
      console.error(output);
    } else if (res.statusCode >= 400) {
      console.warn(output);
    } else {
      console.log(output);
    }
  });

  next();
}
