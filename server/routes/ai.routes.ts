/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: AI Gateway Routes
 *
 * Minimal development and diagnostic endpoints for verifying the AI Gateway.
 * Strictly requires active student authentication.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, getAuthenticatedStudentId } from '../middleware/auth.middleware.js';
import { aiGatewayService } from '../services/ai/gateway.service.js';
import { AIGatewayError, normalizeAIGatewayError } from '../services/ai/errors.js';
import {
  GenericGenerationResultSchema,
  ExplanationGenerationSchema,
} from '../services/ai/schemas.js';

export const aiRouter = Router();

// Enforce mandatory session authentication on all AI routes
aiRouter.use(requireAuth);

const testAiRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty.'),
  purpose: z
    .enum(['general', 'tutoring', 'quiz_explanation', 'retrieval_qa', 'diagnostic', 'test'])
    .optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(1).optional(),
  responseFormat: z.enum(['text', 'json_object']).optional(),
});

const testStructuredAiRequestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required and cannot be empty.'),
  schemaType: z.enum(['generic', 'explanation']).optional().default('explanation'),
  purpose: z
    .enum(['general', 'tutoring', 'quiz_explanation', 'retrieval_qa', 'diagnostic', 'test'])
    .optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(1).optional(),
});

/**
 * POST /api/ai/test
 * Minimal authenticated test endpoint to verify the AI Gateway pipeline.
 */
aiRouter.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getAuthenticatedStudentId(req);

    const parseResult = testAiRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'AI_REQUEST_INVALID',
        code: 'AI_REQUEST_INVALID',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const { prompt, purpose, temperature, maxTokens, responseFormat } = parseResult.data;

    const response = await aiGatewayService.execute({
      studentId,
      prompt,
      purpose: purpose || 'test',
      temperature,
      maxTokens,
      responseFormat,
    });

    res.status(200).json({
      success: true,
      response,
    });
  } catch (err: unknown) {
    const normalized = err instanceof AIGatewayError ? err : normalizeAIGatewayError(err);
    res.status(normalized.statusCode).json(normalized.toResponse());
  }
});

/**
 * POST /api/ai/test/structured
 * Authenticated test endpoint to verify structured generation and schema validation.
 */
aiRouter.post('/test/structured', async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = getAuthenticatedStudentId(req);

    const parseResult = testStructuredAiRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'AI_REQUEST_INVALID',
        code: 'AI_REQUEST_INVALID',
        message: parseResult.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const { prompt, schemaType, purpose, temperature, maxTokens } = parseResult.data;

    const result =
      schemaType === 'generic'
        ? await aiGatewayService.executeStructured(
            {
              studentId,
              prompt,
              purpose: purpose || 'test',
              temperature,
              maxTokens,
            },
            GenericGenerationResultSchema
          )
        : await aiGatewayService.executeStructured(
            {
              studentId,
              prompt,
              purpose: purpose || 'test',
              temperature,
              maxTokens,
            },
            ExplanationGenerationSchema
          );

    res.status(200).json({
      success: true,
      response: result.response,
      data: result.data,
    });
  } catch (err: unknown) {
    const normalized = err instanceof AIGatewayError ? err : normalizeAIGatewayError(err);
    res.status(normalized.statusCode).json(normalized.toResponse());
  }
});

/**
 * GET /api/ai/diagnostics
 * Health and diagnostics endpoint for monitoring AI Gateway state.
 */
aiRouter.get('/diagnostics', async (_req: Request, res: Response): Promise<void> => {
  try {
    const diagnostics = await aiGatewayService.getDiagnostics();
    res.status(200).json({
      success: true,
      diagnostics,
    });
  } catch (err: unknown) {
    const normalized = err instanceof AIGatewayError ? err : normalizeAIGatewayError(err);
    res.status(normalized.statusCode).json(normalized.toResponse());
  }
});
