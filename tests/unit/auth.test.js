import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { app } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { User } from '../../src/models/User.model.js';
import { UserPreference } from '../../src/models/UserPreference.model.js';
import { generateCsrfToken } from '../../src/utils/cryptoUtils.js';
import { dispatchRequest } from '../helpers/testClient.js';

describe('Step 2.5.2: Authentication & Session Management', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. CSRF Token Endpoint', () => {
    it('GET /api/auth/csrf returns a valid CSRF token', async () => {
      const res = await dispatchRequest(app, { method: 'GET', url: '/api/auth/csrf' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.csrfToken).toBeDefined();
      expect(typeof res.body.data.csrfToken).toBe('string');
    });
  });

  describe('2. User Registration', () => {
    it('POST /api/auth/register creates user, sets HTTP-only session cookie, and returns user profile without passwordHash', async () => {
      const csrfRes = await dispatchRequest(app, { method: 'GET', url: '/api/auth/csrf' });
      const csrfToken = csrfRes.body.data.csrfToken;

      const mockUserId = new mongoose.Types.ObjectId();
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(User.prototype, 'save').mockImplementation(async function () {
        this._id = mockUserId;
        return this;
      });
      vi.spyOn(UserPreference, 'create').mockResolvedValue({});

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-csrf-token': csrfToken },
        body: {
          email: 'Jane.Doe@Example.com',
          password: 'SecurePassword123!',
          name: 'Jane Doe'
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('jane.doe@example.com');
      expect(res.body.data.user.name).toBe('Jane Doe');
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.headers['set-cookie']).toContain(env.COOKIE_NAME);
    });

    it('rejects registration with duplicate email with 409 EMAIL_ALREADY_EXISTS', async () => {
      const csrfRes = await dispatchRequest(app, { method: 'GET', url: '/api/auth/csrf' });
      const csrfToken = csrfRes.body.data.csrfToken;

      vi.spyOn(User, 'findOne').mockResolvedValue({ _id: new mongoose.Types.ObjectId(), email: 'existing@example.com' });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-csrf-token': csrfToken },
        body: {
          email: 'existing@example.com',
          password: 'SecurePassword123!',
          name: 'Existing User'
        }
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('rejects registration with weak password via Zod validation', async () => {
      const csrfRes = await dispatchRequest(app, { method: 'GET', url: '/api/auth/csrf' });
      const csrfToken = csrfRes.body.data.csrfToken;

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-csrf-token': csrfToken },
        body: {
          email: 'user@example.com',
          password: 'weak',
          name: 'User'
        }
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('3. User Login', () => {
    it('POST /api/auth/login validates credentials, sets cookie, and returns user profile', async () => {
      const mockUserId = new mongoose.Types.ObjectId();
      const passwordHash = await argon2.hash('ValidPassword123!', { type: argon2.argon2id });

      const mockUser = {
        _id: mockUserId,
        email: 'login@example.com',
        passwordHash,
        name: 'Login User',
        role: 'USER',
        isActive: true,
        sessionVersion: 1
      };

      vi.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const csrfToken = generateCsrfToken({
        userId: 'anonymous_session',
        sessionVersion: 1,
        secret: env.CSRF_SECRET
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-csrf-token': csrfToken },
        body: {
          email: 'login@example.com',
          password: 'ValidPassword123!'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('login@example.com');
      expect(res.headers['set-cookie']).toContain(env.COOKIE_NAME);
    });

    it('rejects invalid password with generic 401 AUTHENTICATION_FAILED', async () => {
      const passwordHash = await argon2.hash('CorrectPassword123!', { type: argon2.argon2id });
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'login@example.com',
        passwordHash,
        isActive: true,
        sessionVersion: 1
      };

      vi.spyOn(User, 'findOne').mockResolvedValue(mockUser);

      const csrfToken = generateCsrfToken({
        userId: 'anonymous_session',
        sessionVersion: 1,
        secret: env.CSRF_SECRET
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-csrf-token': csrfToken },
        body: {
          email: 'login@example.com',
          password: 'WrongPassword999!'
        }
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AUTHENTICATION_FAILED');
    });
  });

  describe('4. Session & CSRF Enforcement', () => {
    it('GET /api/auth/me returns 401 when session cookie is absent', async () => {
      const res = await dispatchRequest(app, { method: 'GET', url: '/api/auth/me' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it('GET /api/auth/me returns 401 when sessionVersion in database does not match token (revocation)', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = jwt.sign(
        { sub: userId.toString(), email: 'user@example.com', sessionVersion: 1 },
        env.SESSION_SECRET
      );

      // User sessionVersion in DB was incremented to 2
      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'user@example.com',
        isActive: true,
        sessionVersion: 2
      });

      const res = await dispatchRequest(app, {
        method: 'GET',
        url: '/api/auth/me',
        cookies: { [env.COOKIE_NAME]: token }
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('SESSION_REVOKED');
    });

    it('POST /api/auth/logout increments sessionVersion and clears cookie', async () => {
      const userId = new mongoose.Types.ObjectId();
      const token = jwt.sign(
        { sub: userId.toString(), email: 'user@example.com', sessionVersion: 1 },
        env.SESSION_SECRET
      );

      vi.spyOn(User, 'findById').mockResolvedValue({
        _id: userId,
        email: 'user@example.com',
        isActive: true,
        sessionVersion: 1
      });

      const findAndUpdateSpy = vi.spyOn(User, 'findByIdAndUpdate').mockResolvedValue({});

      const csrfToken = generateCsrfToken({
        userId: userId.toString(),
        sessionVersion: 1,
        secret: env.CSRF_SECRET
      });

      const res = await dispatchRequest(app, {
        method: 'POST',
        url: '/api/auth/logout',
        headers: { 'x-csrf-token': csrfToken },
        cookies: { [env.COOKIE_NAME]: token }
      });

      expect(res.status).toBe(200);
      expect(findAndUpdateSpy).toHaveBeenCalledWith(userId, { $inc: { sessionVersion: 1 } });
      expect(res.headers['set-cookie']).toContain('Max-Age=0');
    });
  });
});
