/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { materialRepository } from '../../repositories/material.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { retrievalService } from '../retrieval/retrieval.service.js';
import { aiGatewayService } from '../ai/gateway.service.js';
import { quizRepository } from '../../repositories/quiz.repository.js';
import {
  QuizQuestionBatchGenerationSchema,
  QUIZ_BATCH_JSON_SCHEMA,
} from '../ai/schemas.js';
import type { QuizMode } from '../../../src/types.js';

export interface GenerateQuizFromMaterialInput {
  studentId: string;
  materialId: string;
  title?: string;
  mode: QuizMode;
  questionCount: number;
  timeLimitMinutes: number;
  difficulty: 'easy' | 'medium' | 'hard';
  topicFocus?: string;
  negativeMarking?: boolean;
  negativeMarkValue?: number;
  randomization?: boolean;
}

/**
 * Strict provenance filter guardrail:
 * - valid retrieved chunkId -> accept
 * - missing chunkId -> reject
 * - unknown / hallucinated chunkId -> reject
 * Does NOT silently re-map or substitute another chunk ID.
 */
export function filterQuestionsByProvenance<T extends { chunkId?: string | null }>(
  questions: T[],
  validChunkIds: Set<string>
): T[] {
  return questions.filter((q) => {
    if (!q.chunkId || !validChunkIds.has(q.chunkId)) {
      console.warn(
        `[QuizGenerationService] Quarantined question due to invalid/hallucinated chunk provenance (chunkId="${q.chunkId}")`
      );
      return false;
    }
    return true;
  });
}

export class QuizGenerationService {
  /**
   * Orchestrates the complete pipeline:
   * 1. Authenticate & Verify Student Ownership of Study Material
   * 2. Verify Material Readiness & Content Availability
   * 3. Retrieve Grounding Chunks (via Vector Search or Document Chunks)
   * 4. Synthesize Pedagogy Prompt & Context for Groq / AI Gateway
   * 5. Call AIGateway.executeStructured with QuizQuestionBatchGenerationSchema
   * 6. Validate & Normalize Output with Material and Chunk Provenance
   * 7. Persist Quiz & Questions via QuizRepository.createQuiz
   */
  public async generateQuizFromMaterial(input: GenerateQuizFromMaterialInput) {
    const {
      studentId,
      materialId,
      title,
      mode,
      questionCount,
      timeLimitMinutes,
      difficulty,
      topicFocus,
      negativeMarking = false,
      negativeMarkValue = 0,
      randomization = true,
    } = input;

    // 1. Verify studentId
    if (!studentId) {
      throw new Error('UNAUTHORIZED: studentId is required.');
    }

    // 2. Verify material ownership & existence
    const material = await materialRepository.getMaterialById(materialId, studentId);
    if (!material) {
      throw new Error('NOT_FOUND: Study material not found or unauthorized access.');
    }

    if (material.processing_status !== 'ready') {
      throw new Error(
        `MATERIAL_NOT_READY: Study material is currently in '${material.processing_status}' status. It must be processed and ready to generate quizzes.`
      );
    }

    // 3. Retrieve chunks for grounding
    let chunks: Array<{
      id: string;
      text: string;
      pageStart?: number;
      pageEnd?: number;
      chunkIndex?: number;
    }> = [];

    // Try vector retrieval if topicFocus or keywords provided
    const queryTerm = topicFocus?.trim() || material.topic || material.title;
    try {
      const searchRes = await retrievalService.search({
        studentId,
        query: queryTerm,
        materialId,
        topK: Math.max(questionCount * 2, 8),
      });

      if (searchRes.results && searchRes.results.length > 0) {
        chunks = searchRes.results.map((r) => ({
          id: r.chunkId,
          text: r.text,
          pageStart: r.pageStart,
          pageEnd: r.pageEnd,
          chunkIndex: r.chunkIndex,
        }));
      }
    } catch (searchErr) {
      console.warn('[QuizGenerationService] Semantic search retrieval failed or unavailable, falling back to document chunks:', searchErr);
    }

    // Fallback directly to document_chunks if semantic search returned no results
    if (chunks.length === 0) {
      const dbChunks = await documentRepository.getChunksByMaterial(materialId, studentId);
      if (!dbChunks || dbChunks.length === 0) {
        throw new Error(
          'INSUFFICIENT_CONTENT: No readable text chunks found for this study material. Please ensure the document was parsed.'
        );
      }
      chunks = dbChunks.slice(0, Math.max(questionCount * 2, 10)).map((c) => ({
        id: c.id,
        text: c.text,
        pageStart: c.page_start,
        pageEnd: c.page_end,
        chunkIndex: c.chunk_index,
      }));
    }

    // 4. Construct context text and chunk lookup
    const validChunkIds = new Set(chunks.map((c) => c.id));

    const formattedContext = chunks
      .slice(0, 10)
      .map((c, i) => `[Source Chunk ${i + 1} | ChunkID: ${c.id}${c.pageStart ? ` | Pages: ${c.pageStart}-${c.pageEnd}` : ''}]\n${c.text.trim()}`)
      .join('\n\n---\n\n');

    const expectedTitle = title?.trim() || `${material.title} • AI Assessment`;
    const expectedSubject = material.subject;
    const expectedTopic = material.topic || topicFocus || material.title;

    const prompt = `You are EDUMATE's Senior Academic Assessment Specialist.
Generate an academically rigorous, strictly grounded quiz with exactly ${questionCount} multiple-choice questions based ONLY on the provided study material excerpt.

STUDY MATERIAL:
Title: "${material.title}"
Subject: "${expectedSubject}"
Topic: "${expectedTopic}"
Target Difficulty: "${difficulty}"

SOURCE CONTEXT EXCERPTS:
${formattedContext}

STRICT JSON OUTPUT CONTRACT:
You MUST respond with a single valid JSON object at the top level. Do NOT return a JSON array, markdown code fences, or conversational preambles.
The JSON object MUST strictly adhere to this exact structure:
{
  "title": "${expectedTitle.replace(/"/g, '\\"')}",
  "subject": "${expectedSubject.replace(/"/g, '\\"')}",
  "topic": "${expectedTopic.replace(/"/g, '\\"')}",
  "questions": [
    {
      "question": "Clear, unambiguous question statement",
      "questionType": "MCQ",
      "options": [
        { "id": "A", "text": "Option A text" },
        { "id": "B", "text": "Option B text" },
        { "id": "C", "text": "Option C text" },
        { "id": "D", "text": "Option D text" }
      ],
      "correctOptionId": "A",
      "explanation": "Concise pedagogical rationale explaining why the correct option is true based on the source text excerpt",
      "formulaHint": null,
      "difficulty": "${difficulty}",
      "marks": 1,
      "section": "Section A",
      "subject": "${expectedSubject.replace(/"/g, '\\"')}",
      "topic": "${expectedTopic.replace(/"/g, '\\"')}",
      "chunkId": "EXACT_CHUNK_ID_FROM_HEADER_ABOVE"
    }
  ]
}

STRICT PEDAGOGICAL & PROVENANCE RULES:
1. Generate exactly ${questionCount} multiple-choice questions in the "questions" array.
2. Every question MUST be directly answerable from and grounded in the source text excerpts. Do NOT hallucinate facts or external theories.
3. Every question must have exactly 4 options with unique IDs ("A", "B", "C", "D").
4. "correctOptionId" MUST exactly match one of the IDs in the "options" list ("A", "B", "C", or "D").
5. "chunkId" MUST be copied verbatim from one of the [Source Chunk X | ChunkID: <id>] headers above that provides the evidence for the question.
6. "questionType" MUST be "MCQ".
7. Return ONLY the raw JSON object conforming to this specification.`;

    // 5. Generate with AI Gateway
    const { data } = await aiGatewayService.executeStructured(
      {
        studentId,
        purpose: 'quiz_generation',
        prompt,
        retrievedContext: chunks.slice(0, 10).map((c) => ({
          chunkId: c.id,
          materialId,
          sectionId: null,
          text: c.text,
          score: 1.0,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          materialTitle: material.title,
          subject: material.subject,
          topic: material.topic,
        })),
        temperature: 0.3,
        maxTokens: Math.max(2500, questionCount * 350),
      },
      QuizQuestionBatchGenerationSchema,
      QUIZ_BATCH_JSON_SCHEMA
    );

    if (!data.questions || data.questions.length === 0) {
      throw new Error('AI_GENERATION_FAILED: The AI provider failed to generate valid quiz questions.');
    }

    // 6. Map and normalize generated questions with strict provenance verification
    // Strict provenance guardrail:
    // - Valid retrieved chunkId -> accept
    // - Missing chunkId -> reject
    // - Unknown / hallucinated chunkId -> reject (quarantine question; do NOT silently remap or fallback)
    const validQuestions = filterQuestionsByProvenance(data.questions, validChunkIds);

    if (validQuestions.length === 0) {
      throw new Error(
        'AI_PROVENANCE_FAILED: All generated questions failed provenance verification (hallucinated or unrecognized chunk IDs).'
      );
    }

    const customQuestions = validQuestions.map((q) => ({
      question_text: q.question,
      question_type: 'MCQ' as const,
      options: q.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
      })),
      correct_option_ids: [q.correctOptionId],
      correct_answer_text: null,
      explanation: q.explanation,
      formula_hint: q.formulaHint || null,
      marks: q.marks || 1,
      section: q.section || 'Section A',
      topic: q.topic || expectedTopic,
      material_id: materialId,
      chunk_id: q.chunkId,
    }));

    const quizTitle =
      title?.trim() ||
      `${material.title} • AI Assessment`;

    // 7. Persist via QuizRepository.createQuiz
    const result = await quizRepository.createQuiz(studentId, {
      title: quizTitle,
      description: `Generated from uploaded study material: ${material.title}`,
      mode,
      source: 'uploaded_material',
      subject: material.subject,
      topic: material.topic || topicFocus || material.title,
      question_count: customQuestions.length,
      time_limit_minutes: timeLimitMinutes,
      difficulty,
      negative_marking: negativeMarking,
      negative_mark_value: negativeMarkValue,
      randomization,
      custom_questions: customQuestions,
    });

    return result;
  }
}

export const quizGenerationService = new QuizGenerationService();
