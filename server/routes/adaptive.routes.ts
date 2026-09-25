/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { adaptiveModelService } from '../services/adaptive-model.service.js';
import { adaptiveModelRepository } from '../repositories/adaptive-model.repository.js';

export const adaptiveRouter = Router();

// All adaptive endpoints require authenticated student identity
adaptiveRouter.use(requireAuth);

function getStudentProfileId(req: Request): string {
  if (!req.user?.profile?.id) {
    throw new Error('MISSING_PROFILE: Authenticated user has no student profile.');
  }
  return req.user.profile.id;
}

/**
 * GET /api/adaptive/model
 * Returns complete adaptive student model including profile, subjects, topics, and explainable recommendations.
 */
adaptiveRouter.get('/model', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const model = await adaptiveModelService.getStudentModel(studentId);
    res.json(model);
  } catch (err: any) {
    console.error('[Adaptive Routes] GET /api/adaptive/model error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch adaptive student model.' });
  }
});

/**
 * GET /api/adaptive/subjects
 * Returns subject mastery breakdown.
 */
adaptiveRouter.get('/subjects', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const subjects = await adaptiveModelRepository.getSubjectMastery(studentId);
    res.json({ subjects });
  } catch (err: any) {
    console.error('[Adaptive Routes] GET /api/adaptive/subjects error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch subject mastery.' });
  }
});

/**
 * GET /api/adaptive/topics
 * Returns topic mastery breakdown, optionally filtered by ?subject=
 */
adaptiveRouter.get('/topics', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const subject = typeof req.query.subject === 'string' ? req.query.subject : undefined;
    const topics = await adaptiveModelRepository.getTopicMastery(studentId, subject);
    res.json({ topics });
  } catch (err: any) {
    console.error('[Adaptive Routes] GET /api/adaptive/topics error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch topic mastery.' });
  }
});

/**
 * GET /api/adaptive/recommendations
 * Returns deterministic explainable recommendations.
 */
adaptiveRouter.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const model = await adaptiveModelService.getStudentModel(studentId);
    res.json({ recommendations: model.recommendations });
  } catch (err: any) {
    console.error('[Adaptive Routes] GET /api/adaptive/recommendations error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch recommendations.' });
  }
});

/**
 * POST /api/adaptive/sync
 * Manually or programmatically triggers a full evidence recalculation.
 */
adaptiveRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const model = await adaptiveModelService.syncStudentModel(studentId);
    res.json({ success: true, model });
  } catch (err: any) {
    console.error('[Adaptive Routes] POST /api/adaptive/sync error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to sync adaptive student model.' });
  }
});
