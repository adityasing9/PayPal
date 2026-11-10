import { ZodError } from 'zod';

/**
 * Creates middleware to validate request data against a Zod schema.
 *
 * @param {import('zod').ZodSchema} schema
 * @param {'body' | 'query' | 'params'} [source='body']
 * @returns {import('express').RequestHandler}
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details
          },
          timestamp: new Date().toISOString()
        });
      }
      next(err);
    }
  };
}
