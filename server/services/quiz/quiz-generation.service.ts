/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { materialRepository } from '../../repositories/material.repository.js';
import { documentRepository } from '../../repositories/document.repository.js';
import { retrievalService } from '../retrieval/retrieval.service.js';
import { aiGatewayService } from '../ai/gateway.service.js';
import { quizRepository } from '../../repositories/quiz.repository.js';
import { QuizQuestionBatchGenerationSchema } from '../ai/schemas.js';
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
    const defaultChunkId = chunks[0]?.id || null;

    const formattedContext = chunks
      .slice(0, 10)
      .map((c, i) => `[Source Chunk ${i + 1} | ChunkID: ${c.id}${c.pageStart ? ` | Pages: ${c.pageStart}-${c.pageEnd}` : ''}]\n${c.text.trim()}`)
      .join('\n\n---\n\n');

    const prompt = `You are EDUMATE's Senior Academic Assessment Specialist.
Generate an academically rigorous, strictly grounded quiz with exactly ${questionCount} multiple-choice questions based ONLY on the provided study material excerpt.

STUDY MATERIAL:
Title: "${material.title}"
Subject: "${material.subject}"
Topic: "${material.topic || topicFocus || 'Comprehensive Review'}"
Target Difficulty: "${difficulty}"

SOURCE CONTEXT EXCERPTS:
${formattedContext}

STRICT ASSESSMENT REQUIREMENTS:
1. Generate exactly ${questionCount} multiple-choice questions.
2. Every question MUST be directly answerable from and grounded in the source text above. Do NOT invent facts or hallucinate external theories.
3. For each question, provide:
   - "question": clear, unambiguous question statement.
   - "options": 4 realistic options with unique IDs ("A", "B", "C", "D").
   - "correctOptionId": ID of the single correct option.
   - "explanation": a concise pedagogical rationale explaining why the correct option is true based on the source text.
   - "formulaHint": optional mathematical or conceptual formula hint if relevant.
   - "difficulty": "${difficulty}".
   - "subject": "${material.subject}".
   - "topic": "${material.topic || topicFocus || material.title}".
   - "chunkId": The exact ChunkID from the source chunk above that directly supports this question.
4. Output MUST conform strictly to the required JSON schema.`;

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
        maxTokens: 2500,
      },
      QuizQuestionBatchGenerationSchema
    );

    if (!data.questions || data.questions.length === 0) {
      throw new Error('AI_GENERATION_FAILED: The AI provider failed to generate valid quiz questions.');
    }

    // 6. Map and normalize generated questions with provenance
    const customQuestions = data.questions.map((q, idx) => {
      // Validate chunkId provenance
      const assignedChunkId = q.chunkId && validChunkIds.has(q.chunkId) ? q.chunkId : defaultChunkId;

      return {
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
        marks: 1,
        section: 'Section A',
        topic: q.topic || material.topic || material.title,
        material_id: materialId,
        chunk_id: assignedChunkId,
      };
    });

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
