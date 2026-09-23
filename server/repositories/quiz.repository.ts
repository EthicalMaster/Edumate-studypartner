/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';
import type { CreateQuizInput, QuizQuestionType } from '../utils/validation.js';

export interface QuizRecord {
  id: string;
  student_id: string;
  study_kit_id: string | null;
  title: string;
  description: string | null;
  mode: 'PRACTICE' | 'EXAM';
  source: string;
  subject: string;
  topic: string;
  question_count: number;
  total_marks: number;
  time_limit_minutes: number;
  difficulty: string;
  is_diagnostic: boolean;
  negative_marking: boolean;
  negative_mark_value: number;
  randomization: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface QuizQuestionRecord {
  id: string;
  quiz_id: string;
  question_order: number;
  question_text: string;
  question_type: QuizQuestionType;
  options: { id: string; text: string }[];
  correct_option_ids?: string[];
  correct_answer_text?: string | null;
  explanation?: string;
  formula_hint?: string | null;
  marks: number;
  section: string;
  topic: string | null;
}

export interface SafeQuizQuestion {
  id: string;
  quiz_id: string;
  question_order: number;
  question_text: string;
  question_type: QuizQuestionType;
  options: { id: string; text: string }[];
  marks: number;
  section: string;
  topic: string | null;
}

export interface QuestionBankMeta {
  subjects: {
    name: string;
    topics: string[];
    total_questions: number;
  }[];
  difficulties: string[];
  question_types: string[];
}

export class QuizRepository {
  /**
   * Get all quizzes created by or available to a student.
   */
  async getQuizzesForStudent(studentId: string): Promise<QuizRecord[]> {
    const pool = getRequiredPool();
    const res = await pool.query<QuizRecord>(
      `SELECT 
        id, student_id, study_kit_id, title, description, mode, source,
        subject, topic, question_count, total_marks::float AS total_marks,
        time_limit_minutes, difficulty, is_diagnostic,
        negative_marking, negative_mark_value::float AS negative_mark_value,
        randomization, created_at, updated_at
      FROM quizzes
      WHERE student_id = $1
      ORDER BY created_at DESC`,
      [studentId]
    );
    return res.rows;
  }

  /**
   * Get a quiz by ID.
   */
  async getQuizById(quizId: string): Promise<QuizRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query<QuizRecord>(
      `SELECT 
        id, student_id, study_kit_id, title, description, mode, source,
        subject, topic, question_count, total_marks::float AS total_marks,
        time_limit_minutes, difficulty, is_diagnostic,
        negative_marking, negative_mark_value::float AS negative_mark_value,
        randomization, created_at, updated_at
      FROM quizzes
      WHERE id = $1`,
      [quizId]
    );
    return res.rows[0] || null;
  }

  /**
   * Get questions for a quiz.
   * If includeAnswers is false, strictly strips all answer keys and explanations.
   */
  async getQuizQuestions(
    quizId: string,
    options: { includeAnswers?: boolean } = {}
  ): Promise<Array<QuizQuestionRecord | SafeQuizQuestion>> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT 
        id, quiz_id, question_order, question_text, question_type,
        options, correct_option_ids, correct_answer_text,
        explanation, formula_hint, marks::float AS marks, section, topic
      FROM quiz_questions
      WHERE quiz_id = $1
      ORDER BY question_order ASC`,
      [quizId]
    );

    return res.rows.map((row) => {
      const rawOptions = typeof row.options === 'string' ? JSON.parse(row.options) : row.options || [];
      // Sanitize options to ensure no hidden properties like is_correct
      const safeOptions = rawOptions.map((opt: any) => ({
        id: String(opt.id),
        text: String(opt.text || opt.label || ''),
      }));

      if (options.includeAnswers) {
        const correctIds =
          typeof row.correct_option_ids === 'string'
            ? JSON.parse(row.correct_option_ids)
            : row.correct_option_ids || [];
        return {
          id: row.id,
          quiz_id: row.quiz_id,
          question_order: row.question_order,
          question_text: row.question_text,
          question_type: row.question_type,
          options: safeOptions,
          correct_option_ids: correctIds,
          correct_answer_text: row.correct_answer_text,
          explanation: row.explanation,
          formula_hint: row.formula_hint,
          marks: Number(row.marks) || 1,
          section: row.section || 'Section A',
          topic: row.topic,
        } as QuizQuestionRecord;
      }

      // Safe Active Quiz payload: NO correct answers, explanations, formula hints
      return {
        id: row.id,
        quiz_id: row.quiz_id,
        question_order: row.question_order,
        question_text: row.question_text,
        question_type: row.question_type,
        options: safeOptions,
        marks: Number(row.marks) || 1,
        section: row.section || 'Section A',
        topic: row.topic,
      } as SafeQuizQuestion;
    });
  }

  /**
   * Question Bank metadata for paper builder dropdowns and dynamic availability check.
   */
  async getQuestionBankMetadata(): Promise<QuestionBankMeta> {
    const pool = getRequiredPool();
    const res = await pool.query(`
      SELECT 
        subject,
        topic,
        COUNT(*)::int AS count
      FROM question_bank
      GROUP BY subject, topic
      ORDER BY subject, topic
    `);

    const subjectsMap = new Map<string, { topics: Set<string>; total: number }>();

    for (const row of res.rows) {
      if (!subjectsMap.has(row.subject)) {
        subjectsMap.set(row.subject, { topics: new Set(), total: 0 });
      }
      const s = subjectsMap.get(row.subject)!;
      s.topics.add(row.topic);
      s.total += row.count;
    }

    const subjects = Array.from(subjectsMap.entries()).map(([name, data]) => ({
      name,
      topics: Array.from(data.topics),
      total_questions: data.total,
    }));

    return {
      subjects,
      difficulties: ['easy', 'medium', 'hard', 'mixed'],
      question_types: ['MCQ', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'FILL_BLANK', 'VERY_SHORT', 'SHORT', 'LONG'],
    };
  }

  /**
   * Count available questions in question bank matching criteria.
   */
  async countAvailableQuestions(filters: {
    subject: string;
    topic?: string;
    difficulty?: string;
    question_types?: string[];
  }): Promise<number> {
    const pool = getRequiredPool();
    const conditions: string[] = ['subject = $1'];
    const params: any[] = [filters.subject];

    if (filters.topic && filters.topic !== 'all' && filters.topic !== 'All Topics') {
      params.push(filters.topic);
      conditions.push(`topic = $${params.length}`);
    }

    if (filters.difficulty && filters.difficulty.toLowerCase() !== 'mixed') {
      params.push(filters.difficulty.toLowerCase());
      conditions.push(`difficulty = $${params.length}`);
    }

    if (filters.question_types && filters.question_types.length > 0) {
      params.push(filters.question_types);
      conditions.push(`question_type = ANY($${params.length})`);
    }

    const res = await pool.query(
      `SELECT COUNT(*)::int AS count FROM question_bank WHERE ${conditions.join(' AND ')}`,
      params
    );

    return res.rows[0]?.count || 0;
  }

  /**
   * Create a new Quiz using the Paper Builder.
   * Pulls from Question Bank or custom questions, validates available count, and calculates total marks.
   */
  async createQuiz(studentId: string, input: CreateQuizInput): Promise<{ quiz: QuizRecord; questions: SafeQuizQuestion[] }> {
    const pool = getRequiredPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let questionsToInsert: Array<{
        question_text: string;
        question_type: QuizQuestionType;
        options: any[];
        correct_option_ids: string[];
        correct_answer_text?: string | null;
        explanation: string;
        formula_hint?: string | null;
        marks: number;
        section: string;
        topic: string | null;
      }> = [];

      if (input.custom_questions && input.custom_questions.length > 0) {
        questionsToInsert = input.custom_questions.map((q) => ({
          question_text: q.question_text,
          question_type: q.question_type,
          options: q.options || [],
          correct_option_ids: q.correct_option_ids || [],
          correct_answer_text: q.correct_answer_text || null,
          explanation: q.explanation || '',
          formula_hint: q.formula_hint || null,
          marks: q.marks || 1,
          section: q.section || 'Section A',
          topic: q.topic || input.topic,
        }));
      } else {
        // Query matching questions from question_bank
        const conditions: string[] = ['subject = $1'];
        const params: any[] = [input.subject];

        if (input.topic && input.topic !== 'all' && input.topic !== 'All Topics') {
          params.push(input.topic);
          conditions.push(`topic = $${params.length}`);
        }

        if (input.difficulty && input.difficulty.toLowerCase() !== 'mixed') {
          params.push(input.difficulty.toLowerCase());
          conditions.push(`difficulty = $${params.length}`);
        }

        if (input.question_types && input.question_types.length > 0) {
          params.push(input.question_types);
          conditions.push(`question_type = ANY($${params.length})`);
        }

        const orderBy = input.randomization ? 'RANDOM()' : 'created_at ASC';
        const qbRes = await client.query(
          `SELECT 
            question_text, question_type, options, correct_option_ids,
            correct_answer_text, explanation, formula_hint,
            default_marks::float AS marks, section, topic
          FROM question_bank
          WHERE ${conditions.join(' AND ')}
          ORDER BY ${orderBy}
          LIMIT $${params.length + 1}`,
          [...params, input.question_count]
        );

        if (qbRes.rows.length < input.question_count) {
          throw new Error(
            `INSUFFICIENT_QUESTIONS: Requested ${input.question_count} questions, but only ${qbRes.rows.length} questions match the selected criteria.`
          );
        }

        questionsToInsert = qbRes.rows.map((row) => ({
          question_text: row.question_text,
          question_type: row.question_type,
          options: typeof row.options === 'string' ? JSON.parse(row.options) : row.options || [],
          correct_option_ids:
            typeof row.correct_option_ids === 'string'
              ? JSON.parse(row.correct_option_ids)
              : row.correct_option_ids || [],
          correct_answer_text: row.correct_answer_text,
          explanation: row.explanation,
          formula_hint: row.formula_hint,
          marks: Number(row.marks) || 1,
          section: row.section || 'Section A',
          topic: row.topic || input.topic,
        }));
      }

      // Calculate authoritative total marks
      const totalMarks = questionsToInsert.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
      const normalizedMode = input.mode.toUpperCase() as 'PRACTICE' | 'EXAM';
      const normalizedDifficulty = input.difficulty.toLowerCase();

      // Insert Quiz
      const quizRes = await client.query<QuizRecord>(
        `INSERT INTO quizzes (
          student_id, title, description, mode, source,
          subject, topic, question_count, total_marks,
          time_limit_minutes, difficulty, is_diagnostic,
          negative_marking, negative_mark_value, randomization
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING 
          id, student_id, study_kit_id, title, description, mode, source,
          subject, topic, question_count, total_marks::float AS total_marks,
          time_limit_minutes, difficulty, is_diagnostic,
          negative_marking, negative_mark_value::float AS negative_mark_value,
          randomization, created_at, updated_at`,
        [
          studentId,
          input.title,
          input.description || null,
          normalizedMode,
          input.source,
          input.subject,
          input.topic,
          questionsToInsert.length,
          totalMarks,
          input.time_limit_minutes,
          normalizedDifficulty,
          false,
          input.negative_marking,
          input.negative_marking ? input.negative_mark_value : 0,
          input.randomization,
        ]
      );

      const quiz = quizRes.rows[0];

      // Insert Quiz Questions
      const safeQuestions: SafeQuizQuestion[] = [];

      for (let i = 0; i < questionsToInsert.length; i++) {
        const q = questionsToInsert[i];
        const qRes = await client.query(
          `INSERT INTO quiz_questions (
            quiz_id, question_order, question_text, question_type,
            options, correct_option_ids, correct_answer_text,
            explanation, formula_hint, marks, section, topic
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id, quiz_id, question_order, question_text, question_type, options, marks::float AS marks, section, topic`,
          [
            quiz.id,
            i + 1,
            q.question_text,
            q.question_type,
            JSON.stringify(q.options),
            JSON.stringify(q.correct_option_ids),
            q.correct_answer_text || null,
            q.explanation,
            q.formula_hint || null,
            q.marks,
            q.section,
            q.topic,
          ]
        );

        const createdQ = qRes.rows[0];
        safeQuestions.push({
          id: createdQ.id,
          quiz_id: createdQ.quiz_id,
          question_order: createdQ.question_order,
          question_text: createdQ.question_text,
          question_type: createdQ.question_type,
          options: typeof createdQ.options === 'string' ? JSON.parse(createdQ.options) : createdQ.options,
          marks: Number(createdQ.marks),
          section: createdQ.section,
          topic: createdQ.topic,
        });
      }

      await client.query('COMMIT');
      return { quiz, questions: safeQuestions };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Update quiz metadata (title, description).
   */
  async updateQuiz(
    quizId: string,
    studentId: string,
    updates: { title?: string; description?: string }
  ): Promise<QuizRecord | null> {
    const pool = getRequiredPool();
    const fields: string[] = ['updated_at = NOW()'];
    const params: any[] = [quizId, studentId];

    if (updates.title) {
      params.push(updates.title);
      fields.push(`title = $${params.length}`);
    }
    if (updates.description !== undefined) {
      params.push(updates.description);
      fields.push(`description = $${params.length}`);
    }

    const res = await pool.query<QuizRecord>(
      `UPDATE quizzes 
       SET ${fields.join(', ')}
       WHERE id = $1 AND student_id = $2
       RETURNING 
        id, student_id, study_kit_id, title, description, mode, source,
        subject, topic, question_count, total_marks::float AS total_marks,
        time_limit_minutes, difficulty, is_diagnostic,
        negative_marking, negative_mark_value::float AS negative_mark_value,
        randomization, created_at, updated_at`,
      params
    );

    return res.rows[0] || null;
  }
}

export const quizRepository = new QuizRepository();
