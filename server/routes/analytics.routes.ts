/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { analyticsService } from '../services/analytics.service.js';

export const analyticsRouter = Router();

// All analytics endpoints require authenticated student identity
analyticsRouter.use(requireAuth);

function getStudentProfileId(req: Request): string {
  if (!req.user?.profile?.id) {
    throw new Error('MISSING_PROFILE: Authenticated user has no student profile.');
  }
  return req.user.profile.id;
}

/**
 * GET /api/analytics/dashboard
 * Aggregates authenticated student's real database activity for Home view.
 */
analyticsRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const dashboard = await analyticsService.getDashboard(studentId);
    res.json(dashboard);
  } catch (err: any) {
    console.error('[Analytics Routes] GET /api/analytics/dashboard error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch dashboard analytics.' });
  }
});

/**
 * GET /api/analytics/progress
 * Aggregates authenticated student's detailed progress & retention statistics.
 */
analyticsRouter.get('/progress', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const progress = await analyticsService.getProgress(studentId);
    res.json(progress);
  } catch (err: any) {
    console.error('[Analytics Routes] GET /api/analytics/progress error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch progress analytics.' });
  }
});

/**
 * GET /api/analytics/weak-topics
 * Evaluates topics with >= 3 attempts and < 70% accuracy.
 */
analyticsRouter.get('/weak-topics', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const weakTopics = await analyticsService.getWeakTopics(studentId);
    res.json({ weakTopics });
  } catch (err: any) {
    console.error('[Analytics Routes] GET /api/analytics/weak-topics error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch weak topics.' });
  }
});

/**
 * POST /api/analytics/study-sessions/start
 * Starts a server-authoritative study tracking session.
 */
analyticsRouter.post('/study-sessions/start', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const { subject, topic } = req.body || {};
    const session = await analyticsService.startStudySession(studentId, subject, topic);
    res.status(201).json({ session });
  } catch (err: any) {
    console.error('[Analytics Routes] POST /api/analytics/study-sessions/start error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to start study session.' });
  }
});

/**
 * POST /api/analytics/study-sessions/:id/heartbeat
 * Heartbeat update for active study session.
 */
analyticsRouter.post('/study-sessions/:id/heartbeat', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const sessionId = req.params.id;
    const result = await analyticsService.heartbeatStudySession(sessionId, studentId);
    res.json(result);
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND', message: err.message });
      return;
    }
    if (err.code === 'FORBIDDEN') {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    if (err.code === 'SESSION_NOT_ACTIVE') {
      res.status(400).json({ error: 'SESSION_NOT_ACTIVE', message: err.message });
      return;
    }
    console.error('[Analytics Routes] POST /study-sessions/:id/heartbeat error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to update study session heartbeat.' });
  }
});

/**
 * POST /api/analytics/study-sessions/:id/complete
 * Completes a study session and saves final server-authoritative duration.
 */
analyticsRouter.post('/study-sessions/:id/complete', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const sessionId = req.params.id;
    const session = await analyticsService.completeStudySession(sessionId, studentId);
    res.json({ session });
  } catch (err: any) {
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: 'NOT_FOUND', message: err.message });
      return;
    }
    if (err.code === 'FORBIDDEN') {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[Analytics Routes] POST /study-sessions/:id/complete error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to complete study session.' });
  }
});
