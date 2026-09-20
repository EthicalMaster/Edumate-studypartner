/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware.js';
import { retrievalService } from '../services/retrieval/retrieval.service.js';
import { quotaService } from '../services/governance/quota.service.js';
import { embeddingRepository } from '../repositories/embedding.repository.js';
import { embeddingService } from '../services/embedding/embedding.service.js';
import { embeddingQueueService } from '../services/embedding/embedding-queue.service.js';
import { materialRepository } from '../repositories/material.repository.js';

export const retrievalRouter = Router();

// Ensure all retrieval routes are strictly authenticated
retrievalRouter.use(requireAuth);

function getStudentProfileId(req: Request): string {
  if (!req.user?.profile?.id) {
    throw new Error('MISSING_PROFILE: Authenticated user has no student profile.');
  }
  return req.user.profile.id;
}

const searchSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty').max(1000, 'Query too long'),
  materialId: z.string().uuid('Invalid material ID format').optional(),
  subject: z.string().max(100).optional(),
  topic: z.string().max(100).optional(),
  topK: z.number().int().min(1).max(10).optional(),
});

/**
 * POST /api/retrieval/search
 * Executes a semantic vector search scoped strictly to the authenticated student's documents.
 */
retrievalRouter.post('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);

    const parseResult = searchSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: parseResult.error.issues.map((e) => e.message).join(', '),
      });
      return;
    }

    const { query, materialId, subject, topic, topK } = parseResult.data;

    const response = await retrievalService.search({
      studentId,
      query,
      materialId,
      subject,
      topic,
      topK,
    });

    res.json(response);
  } catch (err: any) {
    if (err.status === 404 || err.code === 'MATERIAL_NOT_FOUND') {
      res.status(404).json({
        error: 'MATERIAL_NOT_FOUND',
        message: 'The specified study material was not found in your library.',
      });
      return;
    }
    if (err.status === 429 || err.code === 'SEARCH_RATE_LIMIT_EXCEEDED') {
      res.status(429).json({
        error: 'SEARCH_RATE_LIMIT_EXCEEDED',
        message: err.message,
        limit: err.limit || 100,
      });
      return;
    }
    if (err.message && err.message.includes('EmbeddingEngineUnavailable')) {
      res.status(503).json({
        error: 'EMBEDDING_ENGINE_UNAVAILABLE',
        message: 'The BAAI/bge-small-en-v1.5 embedding engine is not initialized on this host.',
      });
      return;
    }
    if (err.message && (err.message.includes('DATABASE_URL') || err.message.includes('ECONNREFUSED'))) {
      res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Database service is unavailable. Please verify local PostgreSQL is running.',
      });
      return;
    }

    console.error('[Retrieval Routes] Search error:', err);
    res.status(500).json({
      error: 'RETRIEVAL_ERROR',
      message: err.message || 'An error occurred while performing semantic retrieval.',
    });
  }
});

/**
 * GET /api/quotas/usage
 * Returns the authenticated student's storage, material, chunk, and search quota usage.
 */
retrievalRouter.get('/quotas', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const usage = await quotaService.getQuotaUsage(studentId);
    res.json({ usage });
  } catch (err: any) {
    console.error('[Retrieval Routes] GET /api/quotas error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve resource quota usage.',
    });
  }
});

/**
 * GET /api/materials/:id/embedding-status
 * Inspects embedding generation status for a study material.
 */
retrievalRouter.get('/materials/:id/embedding-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const { id } = req.params;

    const summary = await embeddingRepository.getMaterialEmbeddingSummary(id, studentId);
    if (!summary) {
      res.status(404).json({
        error: 'MATERIAL_NOT_FOUND',
        message: 'Study material not found.',
      });
      return;
    }

    res.json({ embedding: summary });
  } catch (err: any) {
    console.error('[Retrieval Routes] GET /materials/:id/embedding-status error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve embedding status.',
    });
  }
});

/**
 * POST /api/materials/:id/re-embed
 * Triggers re-embedding generation for a material.
 */
retrievalRouter.post('/materials/:id/re-embed', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getStudentProfileId(req);
    const { id } = req.params;

    const material = await materialRepository.getMaterialById(id, studentId);
    if (!material) {
      res.status(404).json({
        error: 'MATERIAL_NOT_FOUND',
        message: 'Study material not found.',
      });
      return;
    }

    // Queue re-embedding asynchronously
    embeddingQueueService.enqueue(id, studentId).catch((err) => {
      console.error(`[Re-embed Worker] Async embedding failed for ${id}:`, err);
    });

    res.json({
      success: true,
      message: 'Embedding generation has been queued.',
      materialId: id,
    });
  } catch (err: any) {
    console.error('[Retrieval Routes] POST /materials/:id/re-embed error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to trigger re-embedding.',
    });
  }
});

/**
 * GET /api/retrieval/diagnostics
 * Returns the current embedding engine status, model identity, fallback mode, and resource quotas.
 */
retrievalRouter.get('/diagnostics', async (_req: Request, res: Response): Promise<void> => {
  try {
    const diag = embeddingService.getDiagnostics();
    const quotas = quotaService.getConfig();
    const queue = embeddingQueueService.getQueueStats();
    res.json({
      embeddingEngine: diag,
      quotas,
      queue,
    });
  } catch (err: any) {
    console.error('[Retrieval Routes] GET /diagnostics error:', err);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve diagnostics.',
    });
  }
});

