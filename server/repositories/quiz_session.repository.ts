/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomInt } from 'node:crypto';
import { getRequiredPool } from '../db/connection.js';
import type { SafeQuizQuestion } from './quiz.repository.js';
import type { SubmitAnswerInput } from '../utils/validation.js';

export interface QuizSessionRecord {
  id: string;
  student_id: string;
  quiz_id: string;
  start_time: Date;
  server_deadline: Date;
  time_limit_seconds: number;
  status: 'created' | 'active' | 'submitted' | 'expired' | 'auto_submitted';
  submission_reason: string | null;
  mode: 'PRACTICE' | 'EXAM';
  question_order: string[]; // array of question UUIDs
  scoring_config: {
    negative_marking: boolean;
    negative_mark_value: number;
    total_marks: number;
  };
  created_at: Date;
  completed_at: Date | null;
}

export interface QuizAnswerRecord {
  id: string;
  session_id: string;
  question_id: string;
  student_id: string;
  selected_option_ids: string[];
  answer_text: string | null;
  time_spent_seconds: number;
  answered_at: Date;
}

export interface QuizResultRecord {
  id: string;
  session_id: string;
  student_id: string;
  quiz_id: string;
  total_questions: number;
  attempted_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  skipped_questions: number;
  score_obtained: number;
  total_possible_score: number;
  percentage: number;
  negative_marks_deducted: number;
  time_taken_seconds: number;
  submission_reason: string;
  subject_breakdown: Record<string, any>;
  topic_breakdown: Record<string, any>;
  section_breakdown: Record<string, any>;
  submitted_at: Date;
}

export interface HistoryItem {
  id: string;
  session_id: string;
  quiz_id: string;
  quiz_title: string;
  subject: string;
  topic: string;
  mode: 'PRACTICE' | 'EXAM';
  difficulty: string;
  total_questions: number;
  attempted_questions: number;
  correct_answers: number;
  score_obtained: number;
  total_possible_score: number;
  percentage: number;
  negative_marks_deducted: number;
  time_taken_seconds: number;
  time_limit_minutes: number;
  submission_reason: string;
  status: string;
  submitted_at: Date;
}

export class QuizSessionRepository {
  /**
   * Create a new authoritative database-backed quiz session.
   */
  async createSession(studentId: string, quizId: string): Promise<QuizSessionRecord> {
    const pool = getRequiredPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Fetch quiz details
      const quizRes = await client.query(
        `SELECT id, student_id, title, mode, question_count, total_marks::float as total_marks,
                time_limit_minutes, negative_marking, negative_mark_value::float as negative_mark_value,
                randomization
         FROM quizzes WHERE id = $1`,
        [quizId]
      );

      if (quizRes.rows.length === 0) {
        throw new Error('QUIZ_NOT_FOUND: The requested quiz does not exist.');
      }

      const quiz = quizRes.rows[0];

      // Fetch questions to build session question order
      const qRes = await client.query<{ id: string }>(
        `SELECT id FROM quiz_questions WHERE quiz_id = $1 ORDER BY question_order ASC`,
        [quizId]
      );

      if (qRes.rows.length === 0) {
        throw new Error('QUIZ_HAS_NO_QUESTIONS: This quiz has no questions.');
      }

      let questionIds = qRes.rows.map((r) => r.id);
      if (quiz.randomization) {
        // Cryptographically secure Fisher-Yates shuffle using Node.js CSPRNG
        for (let i = questionIds.length - 1; i > 0; i--) {
          const j = randomInt(0, i + 1);
          [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
        }
      }

      const timeLimitSeconds = (quiz.time_limit_minutes || 15) * 60;
      const startTime = new Date();
      const serverDeadline = new Date(startTime.getTime() + timeLimitSeconds * 1000);

      const scoringConfig = {
        negative_marking: Boolean(quiz.negative_marking),
        negative_mark_value: Number(quiz.negative_mark_value) || 0,
        total_marks: Number(quiz.total_marks) || 0,
      };

      const sessionRes = await client.query<QuizSessionRecord>(
        `INSERT INTO quiz_sessions (
          student_id, quiz_id, start_time, server_deadline,
          time_limit_seconds, status, mode, question_order, scoring_config
        ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
        RETURNING 
          id, student_id, quiz_id, start_time, server_deadline,
          time_limit_seconds, status, submission_reason, mode,
          question_order, scoring_config, created_at, completed_at`,
        [
          studentId,
          quiz.id,
          startTime,
          serverDeadline,
          timeLimitSeconds,
          quiz.mode || 'PRACTICE',
          JSON.stringify(questionIds),
          JSON.stringify(scoringConfig),
        ]
      );

      await client.query('COMMIT');
      return sessionRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get raw session by ID.
   */
  async getSessionById(sessionId: string): Promise<QuizSessionRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query<QuizSessionRecord>(
      `SELECT 
        id, student_id, quiz_id, start_time, server_deadline,
        time_limit_seconds, status, submission_reason, mode,
        question_order, scoring_config, created_at, completed_at
      FROM quiz_sessions
      WHERE id = $1`,
      [sessionId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      question_order: typeof row.question_order === 'string' ? JSON.parse(row.question_order) : row.question_order || [],
      scoring_config: typeof row.scoring_config === 'string' ? JSON.parse(row.scoring_config) : row.scoring_config || {},
    };
  }

  /**
   * Get active session with sanitized questions in authoritative order.
   * Strips correct answers, explanations, and hints.
   */
  async getActiveSessionState(
    sessionId: string,
    studentId: string
  ): Promise<{
    session: QuizSessionRecord;
    quiz: {
      id: string;
      title: string;
      subject: string;
      topic: string;
      mode: 'PRACTICE' | 'EXAM';
      difficulty: string;
      time_limit_minutes: number;
      total_marks: number;
      negative_marking: boolean;
      negative_mark_value: number;
    };
    questions: SafeQuizQuestion[];
    savedAnswers: Record<string, { selected_option_ids: string[]; answer_text: string | null }>;
    serverTime: string;
    isExpired: boolean;
  }> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND: Quiz session was not found.');
    }

    if (session.student_id !== studentId) {
      throw new Error('FORBIDDEN: You are not authorized to access this quiz session.');
    }

    const pool = getRequiredPool();

    // Fetch quiz metadata
    const quizRes = await pool.query(
      `SELECT id, title, subject, topic, mode, difficulty, time_limit_minutes,
              total_marks::float as total_marks, negative_marking,
              negative_mark_value::float as negative_mark_value
       FROM quizzes WHERE id = $1`,
      [session.quiz_id]
    );

    const quiz = quizRes.rows[0];

    // Fetch questions
    const qRes = await pool.query(
      `SELECT id, quiz_id, question_order, question_text, question_type,
              options, marks::float AS marks, section, topic
       FROM quiz_questions
       WHERE quiz_id = $1`,
      [session.quiz_id]
    );

    const questionMap = new Map<string, SafeQuizQuestion>();
    for (const row of qRes.rows) {
      const rawOptions = typeof row.options === 'string' ? JSON.parse(row.options) : row.options || [];
      const safeOptions = rawOptions.map((opt: any) => ({
        id: String(opt.id),
        text: String(opt.text || opt.label || ''),
      }));

      questionMap.set(row.id, {
        id: row.id,
        quiz_id: row.quiz_id,
        question_order: row.question_order,
        question_text: row.question_text,
        question_type: row.question_type,
        options: safeOptions,
        marks: Number(row.marks) || 1,
        section: row.section || 'Section A',
        topic: row.topic,
      });
    }

    // Order questions according to session.question_order
    const orderedQuestions: SafeQuizQuestion[] = [];
    for (let i = 0; i < session.question_order.length; i++) {
      const qId = session.question_order[i];
      const q = questionMap.get(qId);
      if (q) {
        orderedQuestions.push({
          ...q,
          question_order: i + 1,
        });
      }
    }

    // Fetch current saved answers for this session
    const aRes = await pool.query<QuizAnswerRecord>(
      `SELECT question_id, selected_option_ids, answer_text FROM quiz_answers WHERE session_id = $1`,
      [sessionId]
    );

    const savedAnswers: Record<string, { selected_option_ids: string[]; answer_text: string | null }> = {};
    for (const a of aRes.rows) {
      savedAnswers[a.question_id] = {
        selected_option_ids:
          typeof a.selected_option_ids === 'string'
            ? JSON.parse(a.selected_option_ids)
            : a.selected_option_ids || [],
        answer_text: a.answer_text,
      };
    }

    const now = new Date();
    const isExpired = now.getTime() > new Date(session.server_deadline).getTime();

    return {
      session,
      quiz,
      questions: orderedQuestions,
      savedAnswers,
      serverTime: now.toISOString(),
      isExpired,
    };
  }

  /**
   * Save or update an answer for an active session.
   */
  async saveAnswer(sessionId: string, studentId: string, answer: SubmitAnswerInput): Promise<QuizAnswerRecord> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND: Quiz session was not found.');
    }

    if (session.student_id !== studentId) {
      throw new Error('FORBIDDEN: You do not own this quiz session.');
    }

    if (session.status !== 'active') {
      throw new Error(`SESSION_NOT_ACTIVE: Cannot record answers for a session with status '${session.status}'.`);
    }

    const now = new Date();
    // Allow small 5-second network buffer
    if (now.getTime() > new Date(session.server_deadline).getTime() + 5000) {
      throw new Error('TIME_EXPIRED: The authoritative session deadline has passed.');
    }

    const pool = getRequiredPool();
    const res = await pool.query<QuizAnswerRecord>(
      `INSERT INTO quiz_answers (
        session_id, question_id, student_id, selected_option_ids, answer_text, time_spent_seconds, answered_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (session_id, question_id)
      DO UPDATE SET
        selected_option_ids = EXCLUDED.selected_option_ids,
        answer_text = EXCLUDED.answer_text,
        time_spent_seconds = quiz_answers.time_spent_seconds + EXCLUDED.time_spent_seconds,
        answered_at = NOW()
      RETURNING 
        id, session_id, question_id, student_id,
        selected_option_ids, answer_text, time_spent_seconds, answered_at`,
      [
        sessionId,
        answer.question_id,
        studentId,
        JSON.stringify(answer.selected_option_ids || []),
        answer.answer_text || null,
        answer.time_spent_seconds || 0,
      ]
    );

    return res.rows[0];
  }

  /**
   * Fetch all saved answers for a session.
   */
  async getSessionAnswers(sessionId: string): Promise<QuizAnswerRecord[]> {
    const pool = getRequiredPool();
    const res = await pool.query<QuizAnswerRecord>(
      `SELECT 
        id, session_id, question_id, student_id,
        selected_option_ids, answer_text, time_spent_seconds, answered_at
      FROM quiz_answers
      WHERE session_id = $1`,
      [sessionId]
    );

    return res.rows.map((r) => ({
      ...r,
      selected_option_ids:
        typeof r.selected_option_ids === 'string'
          ? JSON.parse(r.selected_option_ids)
          : r.selected_option_ids || [],
    }));
  }

  /**
   * Finalize session status and record completion timestamp.
   */
  async finalizeSession(
    sessionId: string,
    status: 'submitted' | 'expired' | 'auto_submitted',
    reason: string
  ): Promise<QuizSessionRecord> {
    const pool = getRequiredPool();
    const res = await pool.query<QuizSessionRecord>(
      `UPDATE quiz_sessions
       SET status = $1, submission_reason = $2, completed_at = NOW()
       WHERE id = $3
       RETURNING 
        id, student_id, quiz_id, start_time, server_deadline,
        time_limit_seconds, status, submission_reason, mode,
        question_order, scoring_config, created_at, completed_at`,
      [status, reason, sessionId]
    );
    return res.rows[0];
  }

  /**
   * Get finalized result by session ID with student ownership check.
   */
  async getResultBySessionId(sessionId: string, studentId: string): Promise<QuizResultRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query<QuizResultRecord>(
      `SELECT 
        id, session_id, student_id, quiz_id, total_questions, attempted_questions,
        correct_answers, incorrect_answers, skipped_questions,
        score_obtained::float AS score_obtained,
        total_possible_score::float AS total_possible_score,
        percentage::float AS percentage,
        negative_marks_deducted::float AS negative_marks_deducted,
        time_taken_seconds, submission_reason,
        subject_breakdown, topic_breakdown, section_breakdown, submitted_at
      FROM quiz_results
      WHERE session_id = $1 AND student_id = $2`,
      [sessionId, studentId]
    );

    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  /**
   * Get student quiz attempt history.
   */
  async getStudentHistory(studentId: string): Promise<HistoryItem[]> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT 
        qr.id,
        qr.session_id,
        qr.quiz_id,
        q.title AS quiz_title,
        q.subject,
        q.topic,
        qs.mode,
        q.difficulty,
        qr.total_questions,
        qr.attempted_questions,
        qr.correct_answers,
        qr.score_obtained::float AS score_obtained,
        qr.total_possible_score::float AS total_possible_score,
        qr.percentage::float AS percentage,
        qr.negative_marks_deducted::float AS negative_marks_deducted,
        qr.time_taken_seconds,
        q.time_limit_minutes,
        qr.submission_reason,
        qs.status,
        qr.submitted_at
      FROM quiz_results qr
      JOIN quizzes q ON qr.quiz_id = q.id
      JOIN quiz_sessions qs ON qr.session_id = qs.id
      WHERE qr.student_id = $1
      ORDER BY qr.submitted_at DESC`,
      [studentId]
    );

    return res.rows;
  }
}

export const quizSessionRepository = new QuizSessionRepository();
