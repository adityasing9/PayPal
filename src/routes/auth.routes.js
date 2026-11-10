import { Router } from 'express';
import {
  registerController,
  loginController,
  logoutController,
  meController,
  csrfController
} from '../controllers/auth.controller.js';
import { requireAuth, requireCsrf, optionalAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';

const router = Router();

// CSRF token retrieval endpoint (must be accessible before registration/login)
router.get('/csrf', optionalAuth, csrfController);

// Registration & Login (Rate-limited, CSRF-protected, Zod-validated)
router.post('/register', authLimiter, optionalAuth, requireCsrf, validate(registerSchema), registerController);
router.post('/login', authLimiter, optionalAuth, requireCsrf, validate(loginSchema), loginController);

// Authenticated session management
router.post('/logout', requireAuth, requireCsrf, logoutController);
router.get('/me', requireAuth, meController);

export default router;
