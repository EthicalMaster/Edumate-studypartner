/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Request, Response, NextFunction } from 'express';
import { authService, SESSION_COOKIE_NAME } from '../services/auth.service.js';
import type { SafeStudentUser } from '../repositories/user.repository.js';

// Extend Express Request interface to include authenticated user context
declare global {
  namespace Express {
    interface Request {
      user?: SafeStudentUser;
    }
  }
}

/**
 * Reusable authentication middleware.
 * Verifies the incoming HTTP-only session cookie (or Bearer token) against
 * the database user_sessions table. Rejects unauthenticated requests with HTTP 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Extract session token from HTTP-only cookie first, then fallback to Bearer header
    let sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!sessionToken && req.headers.authorization?.startsWith('Bearer ')) {
      sessionToken = req.headers.authorization.slice(7).trim();
    }

    if (!sessionToken) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required. Please sign in to access this resource.',
      });
      return;
    }

    // 2. Resolve active session from database
    const user = await authService.resolveSession(sessionToken);
    if (!user) {
      // Clear invalid/stale cookie if present
      res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });

      res.status(401).json({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired or was revoked. Please sign in again.',
      });
      return;
    }

    // 3. Attach authenticated identity to request context
    req.user = user;
    next();
  } catch (err: any) {
    if (err.message === 'DATABASE_NOT_CONFIGURED') {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'PostgreSQL database is not configured. Set DATABASE_URL in your environment.',
      });
      return;
    }
    console.error('[Auth Middleware Error]:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Authentication service encountered an unexpected error.',
    });
  }
}

/**
 * Optional authentication middleware for endpoints that can be viewed by guests
 * or enriched for authenticated users.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let sessionToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (!sessionToken && req.headers.authorization?.startsWith('Bearer ')) {
      sessionToken = req.headers.authorization.slice(7).trim();
    }

    if (sessionToken) {
      const user = await authService.resolveSession(sessionToken);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch {
    // If DB is offline or token invalid, continue as unauthenticated guest
    next();
  }
}

/**
 * Student Data Isolation Guard.
 * Guarantees that any student-scoped query strictly accesses the authenticated student's data.
 * Prevents horizontal privilege escalation (IDOR).
 */
export function getAuthenticatedStudentId(req: Request): string {
  if (!req.user || !req.user.profile?.id) {
    throw new Error('Authentication required: no active student identity found in request context.');
  }
  return req.user.profile.id;
}
