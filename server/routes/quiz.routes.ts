/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import {
  createQuizSchema,
  createQuizSessionSchema,
  submitAnswerSchema,
  submitQuizSchema,
} from '../utils/validation.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { quizSessionRepository } from '../repositories/quiz_session.repository.js';
import { scoringService } from '../services/scoring.service.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';
import { curriculumService, CurriculumIneligibleError } from '../services/curriculum.service.js';

export const quizRouter = Router();

// All quiz routes require authenticated student identity
quizRouter.use(requireAuth);

/**
 * Helper to retrieve student profile ID from authenticated request.
 */
function getStudentProfileId(req: Request): string {
  if (!req.user?.profile?.id) {
    throw new Error('MISSING_PROFILE: Authenticated user has no student profile.');
  }
  return req.user.profile.id;
}

// ============================================================================
// 1. Quizzes & Paper Builder Endpoints
// ============================================================================

/**
 * GET /api/quizzes
 * Retrieve all quizzes created by or available to the authenticated student.
 */
quizRouter.get('/', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const quizzes = await quizRepository.getQuizzesForStudent(studentId);
    res.json({ quizzes });
  } catch (err: any) {
    console.error('[Quiz Routes] GET /api/quizzes error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to fetch quizzes.' });
  }
});

/**
 * GET /api/quizzes/bank/meta
 * Retrieve subjects, topics, and question availability in the question bank,
 * strictly filtered to the authenticated student's academic curriculum eligibility.
 */
quizRouter.get('/bank/meta', async (req: Request, res: Response) => {
  try {
    const rawMeta = await quizRepository.getQuestionBankMetadata();
    const profile = req.user?.profile || {};
    const filteredMeta = curriculumService.filterQuestionBankMeta(rawMeta, profile);
    res.json(filteredMeta);
  } catch (err: any) {
    console.error('[Quiz Routes] GET /api/quizzes/bank/meta error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch question bank metadata.' });
  }
});

/**
 * GET /api/quizzes/bank/count
 * Count matching questions in the question bank before generation.
 * Enforces curriculum eligibility: returns 403 if subject/topic is outside academic context.
 */
quizRouter.get('/bank/count', async (req: Request, res: Response): Promise<void> => {
  try {
    const subject = String(req.query.subject || '');
    const topic = req.query.topic ? String(req.query.topic) : undefined;
    const difficulty = req.query.difficulty ? String(req.query.difficulty) : undefined;
    const questionTypes = req.query.question_types
      ? (String(req.query.question_types).split(',') as any)
      : undefined;

    if (!subject) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Subject query parameter is required.' });
      return;
    }

    // Server-Authoritative Academic Curriculum Check
    const profile = req.user?.profile || {};
    try {
      curriculumService.assertCurriculumEligibility(profile, subject, topic);
    } catch (ineligibleErr: any) {
      if (ineligibleErr instanceof CurriculumIneligibleError) {
        res.status(403).json({
          error: 'CURRICULUM_INELIGIBLE',
          message: ineligibleErr.message,
        });
        return;
      }
      throw ineligibleErr;
    }

    const count = await quizRepository.countAvailableQuestions({
      subject,
      topic,
      difficulty,
      question_types: questionTypes,
    });

    res.json({ available: count });
  } catch (err: any) {
    console.error('[Quiz Routes] GET /api/quizzes/bank/count error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to count available questions.' });
  }
});

/**
 * POST /api/quizzes
 * Create / build a quiz paper.
 * Server-Authoritative Gate: Enforces curriculum eligibility.
 * An authenticated user CANNOT bypass frontend and generate a quiz for an unauthorized subject/topic.
 */
quizRouter.post('/', validateBody(createQuizSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const profile = req.user?.profile || {};

    // Strict Curriculum Authorization Check
    try {
      curriculumService.assertCurriculumEligibility(profile, req.body.subject, req.body.topic);
    } catch (ineligibleErr: any) {
      if (ineligibleErr instanceof CurriculumIneligibleError) {
        res.status(403).json({
          error: 'CURRICULUM_INELIGIBLE',
          message: ineligibleErr.message,
        });
        return;
      }
      throw ineligibleErr;
    }

    const created = await quizRepository.createQuiz(studentId, req.body);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.message?.startsWith('INSUFFICIENT_QUESTIONS:')) {
      res.status(400).json({
        error: 'INSUFFICIENT_QUESTIONS',
        message: err.message.replace('INSUFFICIENT_QUESTIONS: ', ''),
      });
      return;
    }
    console.error('[Quiz Routes] POST /api/quizzes error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to create quiz paper.' });
  }
});

/**
 * GET /api/quizzes/:quizId
 * Get single quiz configuration.
 */
quizRouter.get('/:quizId', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const quiz = await quizRepository.getQuizById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz paper not found.' });
      return;
    }
    // Verify ownership
    if (quiz.student_id !== studentId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to view this quiz.' });
      return;
    }
    res.json({ quiz });
  } catch (err: any) {
    console.error('[Quiz Routes] GET /api/quizzes/:quizId error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch quiz.' });
  }
});

/**
 * PATCH /api/quizzes/:quizId
 * Update quiz title or description.
 */
quizRouter.patch('/:quizId', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const updated = await quizRepository.updateQuiz(req.params.quizId, studentId, req.body);
    if (!updated) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz not found or not owned by you.' });
      return;
    }
    res.json({ quiz: updated });
  } catch (err: any) {
    console.error('[Quiz Routes] PATCH /api/quizzes/:quizId error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to update quiz.' });
  }
});

/**
 * GET /api/quizzes/:quizId/questions
 * Retrieve safe questions for a quiz without answer keys.
 */
quizRouter.get('/:quizId/questions', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const quiz = await quizRepository.getQuizById(req.params.quizId);
    if (!quiz) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz paper not found.' });
      return;
    }
    if (quiz.student_id !== studentId) {
      res.status(403).json({ error: 'FORBIDDEN', message: 'You do not have permission to access these questions.' });
      return;
    }

    const questions = await quizRepository.getQuizQuestions(req.params.quizId, {
      includeAnswers: false, // SECURITY: Never leak answers to browser
    });

    res.json({ questions });
  } catch (err: any) {
    console.error('[Quiz Routes] GET /api/quizzes/:quizId/questions error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch quiz questions.' });
  }
});

// ============================================================================
// 2. Quiz Session Endpoints
// ============================================================================

/**
 * POST /api/quiz-sessions
 * Start an authoritative quiz session.
 */
quizRouter.post('/sessions', validateBody(createQuizSessionSchema), async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const session = await quizSessionRepository.createSession(studentId, req.body.quiz_id);
    
    // Log quiz_started event
    analyticsRepository.logActivity(studentId, 'quiz_started', 0, {
      session_id: session.id,
      quiz_id: req.body.quiz_id,
    }).catch((err) => console.error('[Quiz Routes] Failed to log quiz_started:', err));

    res.status(201).json({ session });
  } catch (err: any) {
    if (err.message?.startsWith('QUIZ_NOT_FOUND:')) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz paper does not exist.' });
      return;
    }
    console.error('[Quiz Routes] POST /api/quiz-sessions error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to start quiz session.' });
  }
});

/**
 * GET /api/quiz-sessions/:sessionId
 * Get active session state (with sanitized questions, timer, and saved answers).
 */
quizRouter.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const state = await quizSessionRepository.getActiveSessionState(req.params.sessionId, studentId);
    res.json(state);
  } catch (err: any) {
    if (err.message?.startsWith('SESSION_NOT_FOUND:')) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz session not found.' });
      return;
    }
    if (err.message?.startsWith('FORBIDDEN:')) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    console.error('[Quiz Routes] GET /api/quiz-sessions/:sessionId error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to load session state.' });
  }
});

/**
 * POST /api/quiz-sessions/:sessionId/answers
 * Record / update student answer in an active session.
 */
quizRouter.post(
  '/sessions/:sessionId/answers',
  validateBody(submitAnswerSchema),
  async (req: Request, res: Response) => {
    try {
      const studentId = getStudentProfileId(req);
      const answer = await quizSessionRepository.saveAnswer(req.params.sessionId, studentId, req.body);
      res.json({ answer });
    } catch (err: any) {
      if (err.message?.startsWith('SESSION_NOT_FOUND:')) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz session not found.' });
        return;
      }
      if (err.message?.startsWith('FORBIDDEN:')) {
        res.status(403).json({ error: 'FORBIDDEN', message: err.message });
        return;
      }
      if (err.message?.startsWith('SESSION_NOT_ACTIVE:')) {
        res.status(400).json({ error: 'SESSION_NOT_ACTIVE', message: err.message });
        return;
      }
      if (err.message?.startsWith('TIME_EXPIRED:')) {
        res.status(400).json({ error: 'TIME_EXPIRED', message: 'The session deadline has passed.' });
        return;
      }
      console.error('[Quiz Routes] POST /api/quiz-sessions/:sessionId/answers error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to save answer.' });
    }
  }
);

/**
 * POST /api/quiz-sessions/:sessionId/submit
 * Finalize active session, run server-side scoring, and persist results.
 */
quizRouter.post(
  '/sessions/:sessionId/submit',
  validateBody(submitQuizSchema),
  async (req: Request, res: Response) => {
    try {
      const studentId = getStudentProfileId(req);
      
      // Log quiz_submitted event
      analyticsRepository.logActivity(studentId, 'quiz_submitted', 0, {
        session_id: req.params.sessionId,
        submission_reason: req.body.submission_reason,
      }).catch((err) => console.error('[Quiz Routes] Failed to log quiz_submitted:', err));

      const detailedResult = await scoringService.submitAndScoreSession(
        req.params.sessionId,
        studentId,
        req.body.submission_reason
      );
      res.json(detailedResult);
    } catch (err: any) {
      if (err.message?.startsWith('SESSION_NOT_FOUND:')) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz session not found.' });
        return;
      }
      if (err.message?.startsWith('FORBIDDEN:')) {
        res.status(403).json({ error: 'FORBIDDEN', message: err.message });
        return;
      }
      console.error('[Quiz Routes] POST /api/quiz-sessions/:sessionId/submit error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Failed to submit quiz.' });
    }
  }
);

// ============================================================================
// 3. Results & History Endpoints
// ============================================================================

/**
 * GET /api/quiz-results/:sessionId
 * Retrieve finalized results and full question review for a submitted session.
 */
quizRouter.get('/results/:sessionId', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const detailed = await scoringService.getDetailedResult(req.params.sessionId, studentId);
    res.json(detailed);
  } catch (err: any) {
    if (err.message?.startsWith('SESSION_NOT_FOUND:')) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Quiz session not found.' });
      return;
    }
    if (err.message?.startsWith('FORBIDDEN:')) {
      res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      return;
    }
    if (err.message?.startsWith('RESULT_NOT_FOUND:')) {
      res.status(404).json({ error: 'RESULT_NOT_FOUND', message: 'Quiz result not yet generated.' });
      return;
    }
    console.error('[Quiz Routes] GET /api/quiz-results/:sessionId error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch quiz results.' });
  }
});

/**
 * GET /api/quiz-history
 * Retrieve full quiz attempt history for the authenticated student.
 */
quizRouter.get('/history/attempts', async (req: Request, res: Response) => {
  try {
    const studentId = getStudentProfileId(req);
    const history = await quizSessionRepository.getStudentHistory(studentId);
    res.json({ history });
  } catch (err: any) {
    console.error('[Quiz Routes] GET /api/quiz-history error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch quiz history.' });
  }
});
