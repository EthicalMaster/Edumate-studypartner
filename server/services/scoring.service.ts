/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';
import { quizSessionRepository, type QuizResultRecord } from '../repositories/quiz_session.repository.js';
import { quizRepository, type QuizQuestionRecord } from '../repositories/quiz.repository.js';

export interface QuestionReviewItem {
  id: string;
  question_order: number;
  question_text: string;
  question_type: string;
  section: string;
  topic: string | null;
  marks_possible: number;
  marks_earned: number;
  status: 'correct' | 'incorrect' | 'skipped' | 'manual_evaluation';
  student_selected_option_ids: string[];
  student_answer_text: string | null;
  correct_option_ids: string[];
  correct_answer_text: string | null;
  explanation: string;
  formula_hint: string | null;
  options: { id: string; text: string }[];
  material_id?: string | null;
  chunk_id?: string | null;
}

export interface DetailedQuizResult {
  result: QuizResultRecord;
  review: QuestionReviewItem[];
  quiz: {
    id: string;
    title: string;
    subject: string;
    topic: string;
    mode: 'PRACTICE' | 'EXAM';
    difficulty: string;
    total_marks: number;
    time_limit_minutes: number;
    negative_marking: boolean;
    negative_mark_value: number;
  };
}

export class ScoringService {
  /**
   * Finalize and score an active session.
   * Handles server-authoritative timer, exam tab switch, idempotency, and non-AI scoring rules.
   */
  async submitAndScoreSession(
    sessionId: string,
    studentId: string,
    requestedReason: string = 'manual_submit'
  ): Promise<DetailedQuizResult> {
    const session = await quizSessionRepository.getSessionById(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND: Quiz session was not found.');
    }

    if (session.student_id !== studentId) {
      throw new Error('FORBIDDEN: You do not own this quiz session.');
    }

    // 1. Idempotent check: If already submitted or expired, return existing result
    if (session.status === 'submitted' || session.status === 'auto_submitted' || session.status === 'expired') {
      const existingResult = await quizSessionRepository.getResultBySessionId(sessionId, studentId);
      if (existingResult) {
        return this.getDetailedResult(sessionId, studentId);
      }
    }

    const now = new Date();
    const deadline = new Date(session.server_deadline);

    // 2. Authoritative deadline check
    let actualReason = requestedReason;
    let finalStatus: 'submitted' | 'auto_submitted' | 'expired' = 'submitted';

    if (now.getTime() > deadline.getTime()) {
      actualReason = requestedReason === 'tab_switch' ? 'tab_switch' : 'time_expired';
      finalStatus = 'auto_submitted';
    } else if (requestedReason === 'tab_switch') {
      actualReason = 'tab_switch';
      finalStatus = 'auto_submitted';
    } else if (requestedReason === 'auto_submit' || requestedReason === 'timeout') {
      actualReason = 'time_expired';
      finalStatus = 'auto_submitted';
    }

    // 3. Fetch all authoritative questions for the quiz (WITH correct answers for server-side grading)
    const questions = (await quizRepository.getQuizQuestions(session.quiz_id, {
      includeAnswers: true,
    })) as QuizQuestionRecord[];

    // Order questions according to session question_order
    const questionMap = new Map<string, QuizQuestionRecord>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }
    const sessionQuestions: QuizQuestionRecord[] = [];
    for (let i = 0; i < session.question_order.length; i++) {
      const q = questionMap.get(session.question_order[i]);
      if (q) sessionQuestions.push({ ...q, question_order: i + 1 });
    }

    // 4. Fetch all student answers saved in database
    const savedAnswers = await quizSessionRepository.getSessionAnswers(sessionId);
    const answersMap = new Map(savedAnswers.map((a) => [a.question_id, a]));

    // 5. Evaluate each question
    const negativeMarking = Boolean(session.scoring_config.negative_marking);
    const negativePenalty = Number(session.scoring_config.negative_mark_value) || 0;

    let correctCount = 0;
    let incorrectCount = 0;
    let skippedCount = 0;
    let attemptedCount = 0;
    let totalScoreEarned = 0;
    let totalNegativeDeducted = 0;
    let totalPossibleScore = 0;

    const subjectStats: Record<string, { total: number; correct: number; score: number }> = {};
    const topicStats: Record<string, { total: number; correct: number; score: number }> = {};
    const sectionStats: Record<string, { total: number; correct: number; score: number }> = {};

    const reviewItems: QuestionReviewItem[] = [];

    for (const q of sessionQuestions) {
      const qMarks = Number(q.marks) || 1;
      totalPossibleScore += qMarks;

      const subjectName = q.topic || 'General';
      const sectionName = q.section || 'Section A';

      if (!subjectStats['Subject']) subjectStats['Subject'] = { total: 0, correct: 0, score: 0 };
      if (!topicStats[subjectName]) topicStats[subjectName] = { total: 0, correct: 0, score: 0 };
      if (!sectionStats[sectionName]) sectionStats[sectionName] = { total: 0, correct: 0, score: 0 };

      topicStats[subjectName].total++;
      sectionStats[sectionName].total++;

      const studentAns = answersMap.get(q.id);
      const hasOptionSelection =
        studentAns && Array.isArray(studentAns.selected_option_ids) && studentAns.selected_option_ids.length > 0;
      const hasTextAnswer =
        studentAns && typeof studentAns.answer_text === 'string' && studentAns.answer_text.trim().length > 0;

      let isAttempted = Boolean(hasOptionSelection || hasTextAnswer);
      let marksEarned = 0;
      let questionStatus: 'correct' | 'incorrect' | 'skipped' | 'manual_evaluation' = 'skipped';

      if (!isAttempted) {
        skippedCount++;
        questionStatus = 'skipped';
      } else {
        attemptedCount++;

        switch (q.question_type) {
          case 'MCQ': {
            const chosenId = studentAns!.selected_option_ids[0];
            const correctId = q.correct_option_ids?.[0];
            if (chosenId && correctId && chosenId === correctId) {
              correctCount++;
              marksEarned = qMarks;
              questionStatus = 'correct';
            } else {
              incorrectCount++;
              questionStatus = 'incorrect';
              if (negativeMarking) {
                marksEarned = -negativePenalty;
                totalNegativeDeducted += negativePenalty;
              }
            }
            break;
          }

          case 'TRUE_FALSE': {
            const chosenId = studentAns!.selected_option_ids[0];
            const correctId = q.correct_option_ids?.[0];
            if (chosenId && correctId && chosenId === correctId) {
              correctCount++;
              marksEarned = qMarks;
              questionStatus = 'correct';
            } else {
              incorrectCount++;
              questionStatus = 'incorrect';
              if (negativeMarking) {
                marksEarned = -negativePenalty;
                totalNegativeDeducted += negativePenalty;
              }
            }
            break;
          }

          case 'MULTIPLE_SELECT': {
            const chosenSet = new Set(studentAns!.selected_option_ids || []);
            const correctSet = new Set(q.correct_option_ids || []);

            let isFullyCorrect = chosenSet.size === correctSet.size;
            if (isFullyCorrect) {
              for (const id of chosenSet) {
                if (!correctSet.has(id)) {
                  isFullyCorrect = false;
                  break;
                }
              }
            }

            if (isFullyCorrect) {
              correctCount++;
              marksEarned = qMarks;
              questionStatus = 'correct';
            } else {
              incorrectCount++;
              questionStatus = 'incorrect';
              if (negativeMarking) {
                marksEarned = -negativePenalty;
                totalNegativeDeducted += negativePenalty;
              }
            }
            break;
          }

          case 'FILL_BLANK': {
            const studentText = (studentAns!.answer_text || '').trim().toLowerCase();
            const correctText = (q.correct_answer_text || '').trim().toLowerCase();

            // Check direct match or symbol equivalents
            if (
              studentText &&
              correctText &&
              (studentText === correctText ||
                studentText.replace(/\s+/g, '') === correctText.replace(/\s+/g, ''))
            ) {
              correctCount++;
              marksEarned = qMarks;
              questionStatus = 'correct';
            } else {
              incorrectCount++;
              questionStatus = 'incorrect';
              if (negativeMarking) {
                marksEarned = -negativePenalty;
                totalNegativeDeducted += negativePenalty;
              }
            }
            break;
          }

          case 'VERY_SHORT':
          case 'SHORT':
          case 'LONG': {
            // Subjective questions: strictly non-AI approach.
            // Marked as 'manual_evaluation' (ungraded state, score pending review).
            questionStatus = 'manual_evaluation';
            marksEarned = 0; // Not auto-graded
            break;
          }

          default: {
            questionStatus = 'manual_evaluation';
            marksEarned = 0;
            break;
          }
        }
      }

      totalScoreEarned += marksEarned;
      if (marksEarned > 0) {
        topicStats[subjectName].correct++;
        topicStats[subjectName].score += marksEarned;
        sectionStats[sectionName].correct++;
        sectionStats[sectionName].score += marksEarned;
      }

      reviewItems.push({
        id: q.id,
        question_order: q.question_order,
        question_text: q.question_text,
        question_type: q.question_type,
        section: q.section,
        topic: q.topic,
        marks_possible: qMarks,
        marks_earned: marksEarned,
        status: questionStatus,
        student_selected_option_ids: studentAns?.selected_option_ids || [],
        student_answer_text: studentAns?.answer_text || null,
        correct_option_ids: q.correct_option_ids || [],
        correct_answer_text: q.correct_answer_text || null,
        explanation: q.explanation || '',
        formula_hint: q.formula_hint || null,
        options: q.options || [],
        material_id: q.material_id || null,
        chunk_id: q.chunk_id || null,
      });
    }

    // Clamp score to zero minimum if negative marking exceeds earned marks
    const finalScore = Math.max(0, Math.round(totalScoreEarned * 100) / 100);
    const percentage = totalPossibleScore > 0 ? Math.min(100, Math.max(0, Math.round((finalScore / totalPossibleScore) * 10000) / 100)) : 0;
    const timeTakenSeconds = Math.max(
      1,
      Math.min(
        session.time_limit_seconds,
        Math.round((now.getTime() - new Date(session.start_time).getTime()) / 1000)
      )
    );

    const pool = getRequiredPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 6. Update session status
      await client.query(
        `UPDATE quiz_sessions
         SET status = $1, submission_reason = $2, completed_at = NOW()
         WHERE id = $3`,
        [finalStatus, actualReason, sessionId]
      );

      // 7. Insert into quiz_results (upsert in case of race conditions)
      const resultRes = await client.query<QuizResultRecord>(
        `INSERT INTO quiz_results (
          session_id, student_id, quiz_id, total_questions, attempted_questions,
          correct_answers, incorrect_answers, skipped_questions,
          score_obtained, total_possible_score, percentage,
          negative_marks_deducted, time_taken_seconds, submission_reason,
          subject_breakdown, topic_breakdown, section_breakdown, submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (session_id)
        DO UPDATE SET
          attempted_questions = EXCLUDED.attempted_questions,
          correct_answers = EXCLUDED.correct_answers,
          incorrect_answers = EXCLUDED.incorrect_answers,
          skipped_questions = EXCLUDED.skipped_questions,
          score_obtained = EXCLUDED.score_obtained,
          percentage = EXCLUDED.percentage,
          negative_marks_deducted = EXCLUDED.negative_marks_deducted,
          time_taken_seconds = EXCLUDED.time_taken_seconds,
          submission_reason = EXCLUDED.submission_reason,
          subject_breakdown = EXCLUDED.subject_breakdown,
          topic_breakdown = EXCLUDED.topic_breakdown,
          section_breakdown = EXCLUDED.section_breakdown,
          submitted_at = NOW()
        RETURNING 
          id, session_id, student_id, quiz_id, total_questions, attempted_questions,
          correct_answers, incorrect_answers, skipped_questions,
          score_obtained::float AS score_obtained,
          total_possible_score::float AS total_possible_score,
          percentage::float AS percentage,
          negative_marks_deducted::float AS negative_marks_deducted,
          time_taken_seconds, submission_reason,
          subject_breakdown, topic_breakdown, section_breakdown, submitted_at`,
        [
          sessionId,
          studentId,
          session.quiz_id,
          sessionQuestions.length,
          attemptedCount,
          correctCount,
          incorrectCount,
          skippedCount,
          finalScore,
          totalPossibleScore,
          percentage,
          totalNegativeDeducted,
          timeTakenSeconds,
          actualReason,
          JSON.stringify(subjectStats),
          JSON.stringify(topicStats),
          JSON.stringify(sectionStats),
        ]
      );

      // 8. Log student activity
      await client.query(
        `INSERT INTO student_activity (student_id, activity_type, duration_seconds, metadata)
         VALUES ($1, 'quiz_completed', $2, $3)`,
        [
          studentId,
          timeTakenSeconds,
          JSON.stringify({
            session_id: sessionId,
            quiz_id: session.quiz_id,
            score: finalScore,
            percentage,
            submission_reason: actualReason,
          }),
        ]
      );

      await client.query('COMMIT');

      // Fetch quiz header info
      const quizRes = await pool.query(
        `SELECT id, title, subject, topic, mode, difficulty, total_marks::float as total_marks,
                time_limit_minutes, negative_marking, negative_mark_value::float as negative_mark_value
         FROM quizzes WHERE id = $1`,
        [session.quiz_id]
      );

      return {
        result: resultRes.rows[0],
        review: reviewItems,
        quiz: quizRes.rows[0],
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get finalized result and complete question review for a session.
   */
  async getDetailedResult(sessionId: string, studentId: string): Promise<DetailedQuizResult> {
    const session = await quizSessionRepository.getSessionById(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND: Quiz session was not found.');
    }

    if (session.student_id !== studentId) {
      throw new Error('FORBIDDEN: You do not have permission to view this result.');
    }

    const result = await quizSessionRepository.getResultBySessionId(sessionId, studentId);
    if (!result) {
      throw new Error('RESULT_NOT_FOUND: Results have not been calculated for this session yet.');
    }

    const pool = getRequiredPool();
    const quizRes = await pool.query(
      `SELECT id, title, subject, topic, mode, difficulty, total_marks::float as total_marks,
              time_limit_minutes, negative_marking, negative_mark_value::float as negative_mark_value
       FROM quizzes WHERE id = $1`,
      [session.quiz_id]
    );

    // Fetch questions WITH answers since session is finalized
    const questions = (await quizRepository.getQuizQuestions(session.quiz_id, {
      includeAnswers: true,
    })) as QuizQuestionRecord[];

    const questionMap = new Map<string, QuizQuestionRecord>();
    for (const q of questions) {
      questionMap.set(q.id, q);
    }
    const sessionQuestions: QuizQuestionRecord[] = [];
    for (let i = 0; i < session.question_order.length; i++) {
      const q = questionMap.get(session.question_order[i]);
      if (q) sessionQuestions.push({ ...q, question_order: i + 1 });
    }

    const savedAnswers = await quizSessionRepository.getSessionAnswers(sessionId);
    const answersMap = new Map(savedAnswers.map((a) => [a.question_id, a]));

    const reviewItems: QuestionReviewItem[] = [];

    for (const q of sessionQuestions) {
      const studentAns = answersMap.get(q.id);
      const hasOptionSelection =
        studentAns && Array.isArray(studentAns.selected_option_ids) && studentAns.selected_option_ids.length > 0;
      const hasTextAnswer =
        studentAns && typeof studentAns.answer_text === 'string' && studentAns.answer_text.trim().length > 0;

      let marksEarned = 0;
      let status: 'correct' | 'incorrect' | 'skipped' | 'manual_evaluation' = 'skipped';

      if (!hasOptionSelection && !hasTextAnswer) {
        status = 'skipped';
      } else {
        switch (q.question_type) {
          case 'MCQ':
          case 'TRUE_FALSE': {
            if (
              studentAns?.selected_option_ids?.[0] &&
              q.correct_option_ids?.[0] &&
              studentAns.selected_option_ids[0] === q.correct_option_ids[0]
            ) {
              status = 'correct';
              marksEarned = Number(q.marks) || 1;
            } else {
              status = 'incorrect';
              if (session.scoring_config.negative_marking) {
                marksEarned = -session.scoring_config.negative_mark_value;
              }
            }
            break;
          }

          case 'MULTIPLE_SELECT': {
            const chosenSet = new Set(studentAns?.selected_option_ids || []);
            const correctSet = new Set(q.correct_option_ids || []);
            let isFull = chosenSet.size === correctSet.size;
            if (isFull) {
              for (const id of chosenSet) {
                if (!correctSet.has(id)) {
                  isFull = false;
                  break;
                }
              }
            }
            if (isFull) {
              status = 'correct';
              marksEarned = Number(q.marks) || 1;
            } else {
              status = 'incorrect';
              if (session.scoring_config.negative_marking) {
                marksEarned = -session.scoring_config.negative_mark_value;
              }
            }
            break;
          }

          case 'FILL_BLANK': {
            const studentText = (studentAns?.answer_text || '').trim().toLowerCase();
            const correctText = (q.correct_answer_text || '').trim().toLowerCase();
            if (
              studentText &&
              correctText &&
              (studentText === correctText ||
                studentText.replace(/\s+/g, '') === correctText.replace(/\s+/g, ''))
            ) {
              status = 'correct';
              marksEarned = Number(q.marks) || 1;
            } else {
              status = 'incorrect';
              if (session.scoring_config.negative_marking) {
                marksEarned = -session.scoring_config.negative_mark_value;
              }
            }
            break;
          }

          default: {
            status = 'manual_evaluation';
            marksEarned = 0;
            break;
          }
        }
      }

      reviewItems.push({
        id: q.id,
        question_order: q.question_order,
        question_text: q.question_text,
        question_type: q.question_type,
        section: q.section,
        topic: q.topic,
        marks_possible: Number(q.marks) || 1,
        marks_earned: marksEarned,
        status,
        student_selected_option_ids: studentAns?.selected_option_ids || [],
        student_answer_text: studentAns?.answer_text || null,
        correct_option_ids: q.correct_option_ids || [],
        correct_answer_text: q.correct_answer_text || null,
        explanation: q.explanation || '',
        formula_hint: q.formula_hint || null,
        options: q.options || [],
        material_id: q.material_id || null,
        chunk_id: q.chunk_id || null,
      });
    }

    return {
      result,
      review: reviewItems,
      quiz: quizRes.rows[0],
    };
  }
}

export const scoringService = new ScoringService();
