import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';

let server = null;

/**
 * Boots the server and establishes required infrastructure connections.
 */
async function startServer() {
  try {
    console.log('[Server] Connecting to database...');
    await connectDB();
    console.log('[Server] Database connected successfully.');

    server = http.createServer(app);

    server.listen(env.PORT, () => {
      console.log(`[Server] IntentLock Commerce API running on port ${env.PORT} in ${env.NODE_ENV} mode.`);
    });
  } catch (err) {
    console.error('[Server] Fatal startup error:', err.message);
    process.exit(1);
  }
}

/**
 * Handles graceful shutdown upon termination signals.
 */
async function shutdown(signal) {
  console.log(`[Server] Received ${signal}. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('[Server] HTTP server closed.');
      try {
        await disconnectDB();
        console.log('[Server] Database disconnected.');
        process.exit(0);
      } catch (err) {
        console.error('[Server] Error during database disconnect:', err.message);
        process.exit(1);
      }
    });

    // Force exit if graceful shutdown takes longer than 10 seconds
    setTimeout(() => {
      console.error('[Server] Graceful shutdown timeout exceeded. Forcing exit.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
  process.exit(1);
});

// Run server if executed directly
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

export { startServer, shutdown };
