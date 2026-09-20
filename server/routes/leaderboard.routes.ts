/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { leaderboardRepository } from '../repositories/leaderboard.repository.js';

export const leaderboardRouter = Router();

leaderboardRouter.use(requireAuth);

function getStudentProfileId(req: Request): string {
  if (!req.user?.profile?.id) {
    throw new Error('MISSING_PROFILE: Authenticated user has no student profile.');
  }
  return req.user.profile.id;
}

/**
 * GET /api/leaderboard
 * Computes and returns the top 10 leaderboard and the authenticated student's rank.
 * Derived strictly from finalized quiz results.
 */
leaderboardRouter.get('/', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const result = await leaderboardRepository.getLeaderboard(studentId);
    res.json(result);
  } catch (err: any) {
    console.error('[Leaderboard] GET /api/leaderboard error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch leaderboard.' });
  }
});
