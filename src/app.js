import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { isDbConnected, getConnectionState } from './config/db.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLogger } from './middleware/logger.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';

/**
 * Initializes and configures the Express application instance.
 * Note: Importing this module does NOT connect to the database or start listening on a network port.
 */
export function createApp() {
  const app = express();

  // Trust proxy hops if configured
  if (env.TRUST_PROXY_HOPS > 0) {
    app.set('trust proxy', env.TRUST_PROXY_HOPS);
  }

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://www.paypal.com', 'https://www.sandbox.paypal.com'],
          frameSrc: ["'self'", 'https://www.paypal.com', 'https://www.sandbox.paypal.com'],
          connectSrc: ["'self'", 'https://www.sandbox.paypal.com', 'https://api-m.sandbox.paypal.com']
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  // Strict CORS Configuration
  app.use(
    cors({
      origin: env.APP_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id']
    })
  );

  // Request ID & Structured Logging
  app.use(requestIdMiddleware);
  app.use(requestLogger);

  // Body Parsing with Raw Body Preservation for Webhooks
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Cookie Parsing
  app.use(cookieParser());

  // General Rate Limiting
  app.use('/api', generalLimiter);

  // ---------------------------------------------------------------------------
  // Health & Readiness Probes
  // ---------------------------------------------------------------------------
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'UP',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/ready', (_req, res) => {
    const dbOk = isDbConnected();
    const dbState = getConnectionState();

    if (!dbOk) {
      return res.status(503).json({
        status: 'NOT_READY',
        database: dbState,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      status: 'READY',
      database: dbState,
      timestamp: new Date().toISOString()
    });
  });

  // ---------------------------------------------------------------------------
  // API Route Registration
  // ---------------------------------------------------------------------------
  app.use('/api', apiRouter);

  // ---------------------------------------------------------------------------
  // Not Found & Error Handling
  // ---------------------------------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
