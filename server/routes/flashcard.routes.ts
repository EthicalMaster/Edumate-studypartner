/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { flashcardRepository } from '../repositories/flashcard.repository.js';
import { flashcardService } from '../services/flashcard.service.js';
import { curriculumService, CurriculumIneligibleError } from '../services/curriculum.service.js';
import { z } from 'zod';

export const flashcardRouter = express.Router();

// Strict session authentication required across all flashcard endpoints
flashcardRouter.use(requireAuth);

function getStudentProfile(req: Request) {
  if (!req.user?.profile?.id) {
    throw new Error('MISSING_PROFILE: Authenticated user has no student profile.');
  }
  return req.user.profile;
}

/**
 * GET /api/flashcards/dashboard
 * Aggregated dashboard containing stats, due reviews, weak topic decks,
 * eligible curriculum subjects, and study materials decks.
 */
flashcardRouter.get('/dashboard', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const dashboard = await flashcardService.getDashboard(profile.id, {
      education_level: profile.education_level,
      academic_stage: profile.academic_stage,
      program: profile.program,
      stream: profile.stream,
    });

    res.json({
      success: true,
      dashboard,
    });
  } catch (err: any) {
    console.error('[Flashcard Routes] GET /api/flashcards/dashboard error:', err);
    res.status(500).json({
      error: 'DASHBOARD_ERROR',
      message: err.message || 'Failed to retrieve flashcard dashboard.',
    });
  }
});

/**
 * GET /api/flashcards
 * List student flashcards with rich filtering, search, and pagination.
 */
flashcardRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const {
      subject,
      topic,
      difficulty,
      sourceType,
      studyKitId,
      materialId,
      masteryState,
      dueOnly,
      search,
      limit,
      offset,
    } = req.query;

    // Academic boundary check for curriculum content
    if (subject && typeof subject === 'string') {
      const isEligible = curriculumService.isSubjectEligible(
        {
          education_level: profile.education_level,
          academic_stage: profile.academic_stage,
          program: profile.program,
          stream: profile.stream,
        },
        subject
      );

      if (!isEligible && sourceType === 'curriculum') {
        res.status(403).json({
          error: 'CURRICULUM_INELIGIBLE',
          message: `Subject '${subject}' is not eligible for your academic stage.`,
        });
        return;
      }
    }

    const filters = {
      subject: typeof subject === 'string' ? subject : undefined,
      topic: typeof topic === 'string' ? topic : undefined,
      difficulty:
        difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard'
          ? (difficulty as 'easy' | 'medium' | 'hard')
          : undefined,
      sourceType:
        sourceType === 'curriculum' || sourceType === 'study_material' || sourceType === 'custom'
          ? (sourceType as 'curriculum' | 'study_material' | 'custom')
          : undefined,
      studyKitId: typeof studyKitId === 'string' ? studyKitId : undefined,
      materialId: typeof materialId === 'string' ? materialId : undefined,
      masteryState:
        masteryState === 'learning' || masteryState === 'reviewing' || masteryState === 'mastered'
          ? (masteryState as 'learning' | 'reviewing' | 'mastered')
          : undefined,
      dueOnly: dueOnly === 'true',
      search: typeof search === 'string' ? search : undefined,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    };

    const result = await flashcardRepository.getFlashcards(profile.id, filters);

    res.json({
      success: true,
      cards: result.cards,
      total: result.total,
    });
  } catch (err: any) {
    console.error('[Flashcard Routes] GET /api/flashcards error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to list flashcards.',
    });
  }
});

/**
 * GET /api/flashcards/deck
 * Curates an active study session deck according to mode and criteria.
 */
flashcardRouter.get('/deck', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const { mode, subject, topic, materialId, limit } = req.query;
    const deckLimit = limit ? Math.min(50, parseInt(limit as string, 10)) : 20;

    let cards;

    if (mode === 'due') {
      const resData = await flashcardRepository.getFlashcards(profile.id, {
        dueOnly: true,
        limit: deckLimit,
      });
      cards = resData.cards;
    } else if (mode === 'curriculum' && subject && typeof subject === 'string') {
      curriculumService.assertCurriculumEligibility(
        {
          education_level: profile.education_level,
          academic_stage: profile.academic_stage,
          program: profile.program,
          stream: profile.stream,
        },
        subject,
        typeof topic === 'string' ? topic : undefined
      );

      const resData = await flashcardRepository.getFlashcards(profile.id, {
        subject,
        topic: typeof topic === 'string' ? topic : undefined,
        sourceType: 'curriculum',
        limit: deckLimit,
      });
      cards = resData.cards;
    } else if (mode === 'material' && materialId && typeof materialId === 'string') {
      const resData = await flashcardRepository.getFlashcards(profile.id, {
        materialId,
        sourceType: 'study_material',
        limit: deckLimit,
      });
      cards = resData.cards;
    } else if (mode === 'weak') {
      // Weak topics from dashboard
      const dash = await flashcardService.getDashboard(profile.id, {
        education_level: profile.education_level,
        academic_stage: profile.academic_stage,
        program: profile.program,
        stream: profile.stream,
      });
      cards = dash.weakTopicCards.slice(0, deckLimit);
    } else {
      // Smart recommended deck default
      const dash = await flashcardService.getDashboard(profile.id, {
        education_level: profile.education_level,
        academic_stage: profile.academic_stage,
        program: profile.program,
        stream: profile.stream,
      });
      cards = dash.recommendedDeck.slice(0, deckLimit);
    }

    res.json({
      success: true,
      mode: mode || 'recommended',
      cards,
      total: cards.length,
    });
  } catch (err: any) {
    if (err instanceof CurriculumIneligibleError) {
      res.status(err.status).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    console.error('[Flashcard Routes] GET /api/flashcards/deck error:', err);
    res.status(500).json({
      error: 'DECK_ERROR',
      message: err.message || 'Failed to assemble flashcard deck.',
    });
  }
});

/**
 * GET /api/flashcards/curriculum/:subject
 * Retrieves topics and cards for an eligible curriculum subject.
 */
flashcardRouter.get('/curriculum/:subject', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const { subject } = req.params;

    curriculumService.assertCurriculumEligibility(
      {
        education_level: profile.education_level,
        academic_stage: profile.academic_stage,
        program: profile.program,
        stream: profile.stream,
      },
      subject
    );

    const topicsSummary = await flashcardRepository.getCurriculumTopicsSummary(
      profile.id,
      subject
    );

    res.json({
      success: true,
      subject,
      topics: topicsSummary,
    });
  } catch (err: any) {
    if (err instanceof CurriculumIneligibleError) {
      res.status(err.status).json({
        error: err.code,
        message: err.message,
      });
      return;
    }

    console.error('[Flashcard Routes] GET /api/flashcards/curriculum/:subject error:', err);
    res.status(500).json({
      error: 'CURRICULUM_FETCH_ERROR',
      message: err.message || 'Failed to fetch curriculum subject flashcards.',
    });
  }
});

/**
 * GET /api/flashcards/:id
 * Retrieve a single flashcard by ID (student-isolated).
 */
flashcardRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const { id } = req.params;

    const card = await flashcardRepository.getFlashcardById(id, profile.id);
    if (!card) {
      res.status(404).json({
        error: 'FLASHCARD_NOT_FOUND',
        message: 'Flashcard not found or unauthorized.',
      });
      return;
    }

    res.json({
      success: true,
      card,
    });
  } catch (err: any) {
    console.error('[Flashcard Routes] GET /api/flashcards/:id error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: err.message || 'Failed to retrieve flashcard.',
    });
  }
});

const ReviewSchema = z.object({
  rating: z.number().int().min(1).max(4),
  timeTakenMs: z.number().int().min(0).optional().default(0),
});

/**
 * POST /api/flashcards/:id/review
 * Record a review rating, update SM-2 retention state, and feed back into the Adaptive Model.
 */
flashcardRouter.post('/:id/review', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const { id } = req.params;

    const parsed = ReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: 'Rating must be an integer between 1 and 4 (1: Again, 2: Hard, 3: Good, 4: Easy).',
      });
      return;
    }

    const result = await flashcardService.submitReview(
      profile.id,
      id,
      parsed.data.rating,
      parsed.data.timeTakenMs
    );

    res.json({
      success: true,
      card: result.card,
      review: result.review,
      adaptiveSignal: result.adaptiveSignal,
      message: 'Review recorded and adaptive retention model updated.',
    });
  } catch (err: any) {
    console.error('[Flashcard Routes] POST /api/flashcards/:id/review error:', err);
    res.status(500).json({
      error: 'REVIEW_ERROR',
      message: err.message || 'Failed to record flashcard review.',
    });
  }
});

/**
 * POST /api/flashcards/generate-from-material/:materialId
 * Generate active recall flashcards from an uploaded study material using Document Intelligence.
 */
flashcardRouter.post(
  '/generate-from-material/:materialId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const profile = getStudentProfile(req);
      const { materialId } = req.params;

      const cards = await flashcardService.generateFromMaterial(materialId, profile.id);

      res.json({
        success: true,
        cards,
        totalGenerated: cards.length,
        message: `Successfully generated ${cards.length} flashcards from study document.`,
      });
    } catch (err: any) {
      console.error(
        '[Flashcard Routes] POST /api/flashcards/generate-from-material/:materialId error:',
        err
      );
      res.status(400).json({
        error: 'GENERATION_FAILED',
        message: err.message || 'Failed to generate flashcards from material.',
      });
    }
  }
);

const CreateCustomCardSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(3),
  answer: z.string().min(1),
  keyConcept: z.string().optional(),
  formula: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  tags: z.array(z.string()).optional(),
});

/**
 * POST /api/flashcards/custom
 * Create a student custom flashcard.
 */
flashcardRouter.post('/custom', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const parsed = CreateCustomCardSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'INVALID_INPUT',
        message: parsed.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const { subject, topic, question, answer, keyConcept, formula, difficulty, tags } = parsed.data;

    const card = await flashcardRepository.createFlashcard({
      student_id: profile.id,
      subject,
      topic,
      question,
      answer,
      key_concept: keyConcept || topic,
      formula: formula || null,
      difficulty,
      source_type: 'custom',
      tags: tags || [subject, topic],
    });

    res.status(201).json({
      success: true,
      card,
      message: 'Custom flashcard created successfully.',
    });
  } catch (err: any) {
    console.error('[Flashcard Routes] POST /api/flashcards/custom error:', err);
    res.status(500).json({
      error: 'CREATION_FAILED',
      message: err.message || 'Failed to create custom flashcard.',
    });
  }
});

/**
 * DELETE /api/flashcards/:id
 * Delete a flashcard (student-isolated).
 */
flashcardRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const profile = getStudentProfile(req);
    const { id } = req.params;

    const deleted = await flashcardRepository.deleteFlashcard(id, profile.id);
    if (!deleted) {
      res.status(404).json({
        error: 'FLASHCARD_NOT_FOUND',
        message: 'Flashcard not found or unauthorized.',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Flashcard deleted successfully.',
    });
  } catch (err: any) {
    console.error('[Flashcard Routes] DELETE /api/flashcards/:id error:', err);
    res.status(500).json({
      error: 'DELETION_FAILED',
      message: err.message || 'Failed to delete flashcard.',
    });
  }
});
