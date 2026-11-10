import rateLimit from 'express-rate-limit';

function createRateLimitHandler(windowMinutes = 1) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down and try again later.',
        retryAfterSeconds: windowMinutes * 60
      },
      timestamp: new Date().toISOString()
    });
  };
}

/**
 * General rate limiter: 60 requests per minute per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(1),
  skip: () => process.env.NODE_ENV === 'test'
});

/**
 * Sensitive auth rate limiter: 10 requests per minute per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(1),
  skip: () => process.env.NODE_ENV === 'test'
});

/**
 * Payment dispatch rate limiter: 10 requests per minute.
 */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(1),
  skip: () => process.env.NODE_ENV === 'test'
});
