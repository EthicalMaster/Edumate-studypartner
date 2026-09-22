/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 9: Reusable Structured Output Schemas
 *
 * Provides strongly-typed Zod schemas for structured educational generations.
 * Guarantees zero parsing of arbitrary or unvalidated natural language when
 * structured output is required.
 */

import { z } from 'zod';
import { AIStructuredOutputError } from './errors.js';

// ==============================================================================
// 1. GENERIC GENERATION RESULT SCHEMA
// ==============================================================================

export const TokenUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  inputChars: z.number().optional(),
});

export const GenericGenerationResultSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  text: z.string(),
  usage: TokenUsageSchema.optional(),
  requestId: z.string().optional(),
  latencyMs: z.number(),
  finishReason: z.enum(['stop', 'length', 'timeout', 'null', 'error']).optional(),
});

export type GenericGenerationResult = z.infer<typeof GenericGenerationResultSchema>;

// ==============================================================================
// 2. QUIZ QUESTION GENERATION SCHEMA
// ==============================================================================

export const QuizOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const QuizQuestionGenerationSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(3),
  options: z.array(QuizOptionSchema).min(2).max(6),
  correctOptionId: z.string().min(1),
  explanation: z.string().min(5),
  formulaHint: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

export const QuizQuestionBatchGenerationSchema = z.object({
  title: z.string().min(1),
  subject: z.string().min(1),
  topic: z.string().min(1),
  questions: z.array(QuizQuestionGenerationSchema).min(1),
});

export type QuizQuestionGenerated = z.infer<typeof QuizQuestionGenerationSchema>;

// ==============================================================================
// 3. FLASHCARD GENERATION SCHEMA
// ==============================================================================

export const FlashcardGenerationSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  question: z.string().min(3),
  answer: z.string().min(1),
  keyConcept: z.string().min(1),
  formula: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

export const FlashcardBatchGenerationSchema = z.object({
  subject: z.string().min(1),
  topic: z.string().min(1),
  flashcards: z.array(FlashcardGenerationSchema).min(1),
});

export type FlashcardGenerated = z.infer<typeof FlashcardGenerationSchema>;

// ==============================================================================
// 4. SUMMARY GENERATION SCHEMA
// ==============================================================================

export const CriticalTermSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
});

export const SummaryGenerationSchema = z.object({
  title: z.string().min(1),
  overview: z.string().min(10),
  keyPoints: z.array(z.string().min(3)).min(1),
  criticalTerms: z.array(CriticalTermSchema).default([]),
});

export type SummaryGenerated = z.infer<typeof SummaryGenerationSchema>;

// ==============================================================================
// 5. EXPLANATION GENERATION SCHEMA
// ==============================================================================

export const ExplanationGenerationSchema = z.object({
  concept: z.string().min(1),
  summary: z.string().min(5),
  detailedExplanation: z.string().min(20),
  keyTakeaways: z.array(z.string().min(2)).min(1),
  followUpQuestions: z.array(z.string().min(5)).optional(),
});

export type ExplanationGenerated = z.infer<typeof ExplanationGenerationSchema>;

// ==============================================================================
// 6. STUDY PLAN GENERATION SCHEMA
// ==============================================================================

export const DailyStudyTaskSchema = z.object({
  day: z.number().int().min(1),
  topic: z.string().min(1),
  goal: z.string().min(3),
  estimatedMinutes: z.number().int().min(5).max(360),
});

export const StudyPlanGenerationSchema = z.object({
  title: z.string().min(1),
  targetDurationDays: z.number().int().min(1).max(90),
  dailyTasks: z.array(DailyStudyTaskSchema).min(1),
});

export type StudyPlanGenerated = z.infer<typeof StudyPlanGenerationSchema>;

// ==============================================================================
// 7. TEACHER & BUDDY RESPONSE SCHEMAS
// ==============================================================================

export const TeacherResponseSchema = z.object({
  directAnswer: z.string().min(1),
  pedagogicalExplanation: z.string().min(10),
  checkForUnderstanding: z.string().min(5),
  suggestedNextStep: z.string().min(5),
});

export type TeacherResponseGenerated = z.infer<typeof TeacherResponseSchema>;

export const BuddyResponseSchema = z.object({
  encouragement: z.string().min(1),
  friendlyTip: z.string().min(5),
  relatableAnalogy: z.string().min(5),
});

export type BuddyResponseGenerated = z.infer<typeof BuddyResponseSchema>;

// ==============================================================================
// 8. STRUCTURED OUTPUT VALIDATION UTILITY
// ==============================================================================

/**
 * Validates a raw JSON string against a given Zod schema.
 * Throws AIStructuredOutputError if JSON parsing fails or schema validation fails.
 */
export function validateStructuredOutput<T>(schema: z.ZodType<T>, rawText: string): T {
  let parsed: unknown;
  try {
    // Attempt standard JSON parsing
    parsed = JSON.parse(rawText);
  } catch (err: any) {
    // If wrapped in markdown code blocks like ```json ... ```, attempt strip
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1]);
      } catch (innerErr: any) {
        throw new AIStructuredOutputError(`Failed to parse AI output as JSON: ${err.message}`);
      }
    } else {
      throw new AIStructuredOutputError(`Failed to parse AI output as JSON: ${err.message}`);
    }
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const errorDetails = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AIStructuredOutputError(
      `AI structured output failed schema validation: ${errorDetails}`,
      { issues: result.error.issues }
    );
  }

  return result.data;
}
