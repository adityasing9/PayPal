import { authService } from '../services/AuthService.js';
import { generateCsrfToken } from '../utils/cryptoUtils.js';
import { env } from '../config/env.js';

export async function registerController(req, res, next) {
  try {
    const { user, token } = await authService.register(req.body);
    authService.setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      data: { user },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function loginController(req, res, next) {
  try {
    const { user, token } = await authService.login(req.body);
    authService.setSessionCookie(res, token);

    return res.status(200).json({
      success: true,
      data: { user },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutController(req, res, next) {
  try {
    if (req.user) {
      await authService.logout(req.user._id);
    }
    authService.clearSessionCookie(res);

    return res.status(200).json({
      success: true,
      data: { message: 'Logged out successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

export async function meController(req, res) {
  return res.status(200).json({
    success: true,
    data: {
      user: {
        id: req.user._id.toString(),
        email: req.user.email,
        name: req.user.name,
        role: req.user.role
      }
    },
    timestamp: new Date().toISOString()
  });
}

export async function csrfController(req, res) {
  // If user is authenticated, bind token to userId and sessionVersion; otherwise generate anonymous session token
  const userId = req.user ? req.user._id.toString() : 'anonymous_session';
  const sessionVersion = req.user ? req.user.sessionVersion : 1;

  const csrfToken = generateCsrfToken({
    userId,
    sessionVersion,
    secret: env.CSRF_SECRET
  });

  return res.status(200).json({
    success: true,
    data: { csrfToken },
    timestamp: new Date().toISOString()
  });
}
