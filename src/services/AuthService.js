import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.model.js';
import { UserPreference } from '../models/UserPreference.model.js';
import { generateCsrfToken } from '../utils/cryptoUtils.js';

export class AuthenticationError extends Error {
  constructor(message = 'Invalid email or password', statusCode = 401) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = 'AUTHENTICATION_FAILED';
    this.statusCode = statusCode;
  }
}

export class DuplicateUserError extends Error {
  constructor(message = 'An account with this email already exists', statusCode = 409) {
    super(message);
    this.name = 'DuplicateUserError';
    this.code = 'EMAIL_ALREADY_EXISTS';
    this.statusCode = statusCode;
  }
}

export class AuthService {
  /**
   * Registers a new user and creates their default preferences.
   *
   * @param {{ email: string, password: string, name: string }} data
   * @returns {Promise<{ user: object, token: string, csrfToken: string }>}
   */
  async register({ email, password, name }) {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new DuplicateUserError();
    }

    // Hash password with Argon2id
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1
    });

    const user = new User({
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role: 'USER',
      isActive: true,
      sessionVersion: 1
    });

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        throw new DuplicateUserError();
      }
      throw err;
    }

    // Create default UserPreference record
    await UserPreference.create({
      userId: user._id,
      defaultCurrency: 'USD',
      minorUnitExponent: 2,
      maxTransactionLimitMinor: 50000n, // $500.00
      dailySpendingLimitMinor: 100000n, // $1000.00
      allowedMerchants: ['MERCHANT_KEYCHRON', 'MERCHANT_LOGITECH', 'MERCHANT_BESTBUY'],
      blockedMerchants: ['MERCHANT_SHADY_DEALS'],
      requireExplicitReviewOverMinor: 20000n // $200.00
    });

    const token = this.generateSessionJwt(user);
    const csrfToken = generateCsrfToken({
      userId: user._id.toString(),
      sessionVersion: user.sessionVersion,
      secret: env.CSRF_SECRET
    });

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      },
      token,
      csrfToken
    };
  }

  /**
   * Authenticates user credentials and issues a new session.
   *
   * @param {{ email: string, password: string }} data
   * @returns {Promise<{ user: object, token: string, csrfToken: string }>}
   */
  async login({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.isActive) {
      // Use generic error to prevent account enumeration
      throw new AuthenticationError('Invalid email or password');
    }

    const isValidPassword = await argon2.verify(user.passwordHash, password);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    const token = this.generateSessionJwt(user);
    const csrfToken = generateCsrfToken({
      userId: user._id.toString(),
      sessionVersion: user.sessionVersion,
      secret: env.CSRF_SECRET
    });

    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      },
      token,
      csrfToken
    };
  }

  /**
   * Logs out user, clears session cookie, and increments sessionVersion to invalidate existing tokens.
   *
   * @param {string} userId
   * @returns {Promise<void>}
   */
  async logout(userId) {
    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $inc: { sessionVersion: 1 }
      });
    }
  }

  /**
   * Signs a JWT session token.
   *
   * @param {object} user
   * @returns {string} Signed JWT
   */
  generateSessionJwt(user) {
    return jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion
      },
      env.SESSION_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '24h'
      }
    );
  }

  /**
   * Attaches the secure session cookie to the response.
   *
   * @param {import('express').Response} res
   * @param {string} token
   */
  setSessionCookie(res, token) {
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: env.COOKIE_MAX_AGE_MS,
      path: '/'
    });
  }

  /**
   * Clears the session cookie from the response.
   *
   * @param {import('express').Response} res
   */
  clearSessionCookie(res) {
    res.clearCookie(env.COOKIE_NAME, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });
  }
}

export const authService = new AuthService();
