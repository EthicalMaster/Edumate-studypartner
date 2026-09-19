/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type Request, type Response } from 'express';
import {
  authService,
  SESSION_COOKIE_NAME,
  AuthenticationError,
  DuplicateEmailError,
  InvalidEmailError,
} from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { authRateLimiter } from '../middleware/rateLimit.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  type RegisterInput,
  type LoginInput,
  type UpdateProfileInput,
} from '../utils/validation.js';

export const authRouter = Router();

const isProduction = process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
};

/**
 * POST /api/auth/register
 * Registers a new student account, establishes an authenticated session,
 * and sets the secure HTTP-only cookie.
 */
authRouter.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const input = req.body as RegisterInput;
      const userAgent = req.headers['user-agent'];
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress;

      const result = await authService.register(input, { userAgent, ipAddress });

      // Set secure HTTP-only cookie
      res.cookie(SESSION_COOKIE_NAME, result.sessionToken, COOKIE_OPTIONS);

      res.status(201).json({
        success: true,
        message: 'Account successfully registered and authenticated.',
        user: result.user,
      });
    } catch (err: any) {
      if (err instanceof DuplicateEmailError || err.code === 'DUPLICATE_EMAIL') {
        res.status(409).json({
          error: 'DUPLICATE_EMAIL',
          message: 'An account with this email address already exists. Please sign in instead.',
        });
        return;
      }
      if (err instanceof InvalidEmailError) {
        res.status(400).json({
          error: 'INVALID_EMAIL',
          message: err.message,
        });
        return;
      }
      if (err.message === 'DATABASE_NOT_CONFIGURED') {
        res.status(503).json({
          error: 'DATABASE_NOT_CONFIGURED',
          message: 'PostgreSQL database is not configured. Set DATABASE_URL in your local environment.',
        });
        return;
      }
      console.error('[Auth Register Error]:', err);
      res.status(500).json({
        error: 'REGISTRATION_FAILED',
        message: 'Unable to complete registration. Please try again.',
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Validates student credentials, issues a new session, and sets the secure HTTP-only cookie.
 * Employs generic error responses to prevent account enumeration.
 */
authRouter.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const input = req.body as LoginInput;
      const userAgent = req.headers['user-agent'];
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress;

      const result = await authService.login(input, { userAgent, ipAddress });

      // Set secure HTTP-only cookie
      res.cookie(SESSION_COOKIE_NAME, result.sessionToken, COOKIE_OPTIONS);

      res.json({
        success: true,
        message: 'Authentication successful.',
        user: result.user,
      });
    } catch (err: any) {
      if (err instanceof AuthenticationError) {
        res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password. Please check your credentials.',
        });
        return;
      }
      if (err.message === 'DATABASE_NOT_CONFIGURED') {
        res.status(503).json({
          error: 'DATABASE_NOT_CONFIGURED',
          message: 'PostgreSQL database is not configured. Set DATABASE_URL in your local environment.',
        });
        return;
      }
      console.error('[Auth Login Error]:', err);
      res.status(500).json({
        error: 'LOGIN_FAILED',
        message: 'An unexpected authentication error occurred.',
      });
    }
  }
);

/**
 * POST /api/auth/logout
 * Revokes the server-side session in the database and clears the browser's session cookie.
 */
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    let sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!sessionToken && req.headers.authorization?.startsWith('Bearer ')) {
      sessionToken = req.headers.authorization.slice(7).trim();
    }

    if (sessionToken) {
      await authService.logout(sessionToken);
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });

    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err: any) {
    // Clear cookie regardless of DB errors
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });
    res.json({
      success: true,
      message: 'Logged out.',
    });
  }
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated student user and academic profile.
 * Protected by requireAuth.
 */
authRouter.get('/me', requireAuth, (req: Request, res: Response): void => {
  // req.user was securely resolved and verified by requireAuth middleware
  res.json({
    authenticated: true,
    user: req.user,
  });
});

/**
 * PATCH /api/auth/profile
 * Updates the authenticated student's profile information.
 * Protected by requireAuth.
 */
authRouter.patch(
  '/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const input = req.body as UpdateProfileInput;
      const updatedUser = await authService.updateProfile(req.user!.id, input);

      res.json({
        success: true,
        message: 'Profile updated successfully.',
        user: updatedUser,
      });
    } catch (err: any) {
      console.error('[Update Profile Error]:', err);
      res.status(500).json({
        error: 'UPDATE_FAILED',
        message: 'Unable to update profile. Please try again.',
      });
    }
  }
);
