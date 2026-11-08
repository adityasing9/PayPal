import mongoose from 'mongoose';

/**
 * Centralized Database Configuration for IntentLock Commerce.
 *
 * Strict invariants:
 * 1. Reads connection configuration exclusively from environment variables (MONGODB_URI, MONGODB_DB_NAME).
 * 2. Never falls back automatically to local/mock database.
 * 3. Never logs connection strings, credentials, or sensitive connection parameters.
 * 4. Does not connect automatically upon import.
 * 5. Provides explicit lifecycle management (connectDB, disconnectDB, isDbConnected).
 */

let isConnected = false;

/**
 * Establishes a singleton Mongoose connection to the configured MongoDB database.
 *
 * @returns {Promise<typeof mongoose>}
 * @throws {Error} If MONGODB_URI is missing or if connection fails.
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri || typeof uri !== 'string' || uri.trim() === '') {
    throw new Error('Database configuration error: MONGODB_URI environment variable is required.');
  }

  // If already connected, return existing connection
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const options = {
    dbName: process.env.MONGODB_DB_NAME || undefined,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    autoIndex: process.env.NODE_ENV !== 'production'
  };

  try {
    await mongoose.connect(uri, options);
    isConnected = true;
    return mongoose;
  } catch (error) {
    isConnected = false;
    // Sanitized error: do NOT log uri or credentials
    throw new Error(`Database connection failed: ${error.message}`);
  }
}

/**
 * Gracefully terminates the Mongoose connection.
 *
 * @returns {Promise<void>}
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  isConnected = false;
}

/**
 * Checks whether the primary database connection is active (readyState === 1).
 *
 * @returns {boolean}
 */
export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Returns human-readable state of the connection.
 *
 * @returns {'disconnected' | 'connected' | 'connecting' | 'disconnecting' | 'unknown'}
 */
export function getConnectionState() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[mongoose.connection.readyState] || 'unknown';
}
