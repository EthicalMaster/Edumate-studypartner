/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';

export interface StudentAdaptiveProfileRecord {
  id: string;
  student_id: string;
  overall_mastery: number;
  overall_accuracy: number;
  overall_confidence: number;
  learning_consistency: number;
  total_assessed_questions: number;
  total_correct_answers: number;
  total_incorrect_answers: number;
  total_skipped_answers: number;
  total_quizzes_completed: number;
  total_study_seconds: number;
  last_learning_activity: Date | null;
  last_assessment_activity: Date | null;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface StudentSubjectMasteryRecord {
  id: string;
  student_id: string;
  subject: string;
  assessed_question_count: number;
  correct_count: number;
  incorrect_count: number;
  skipped_count: number;
  accuracy: number;
  mastery_score: number;
  confidence_score: number;
  recent_performance: number;
  trend: 'improving' | 'declining' | 'steady' | 'insufficient_data';
  readiness_indicator: 'emerging' | 'developing' | 'competent' | 'proficient' | 'mastered';
  last_assessed: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface StudentTopicMasteryRecord {
  id: string;
  student_id: string;
  subject: string;
  topic: string;
  attempts: number;
  correct: number;
  incorrect: number;
  skipped: number;
  accuracy: number;
  mastery_score: number;
  confidence_score: number;
  recent_accuracy: number;
  trend: 'improving' | 'declining' | 'steady' | 'insufficient_data';
  last_attempted: Date | null;
  retention_indicator: 'fresh' | 'consolidating' | 'decaying' | 'needs_revision' | 'baseline';
  recommended_difficulty: 'easy' | 'medium' | 'hard';
  created_at: Date;
  updated_at: Date;
}

export interface StudentAnswerEvidence {
  id: string;
  sessionId: string;
  questionId: string;
  subject: string;
  topic: string;
  isCorrect: boolean;
  answeredAt: Date;
  sessionStartTime: Date;
}

export class AdaptiveModelRepository {
  /**
   * Upsert student overall adaptive profile.
   */
  async upsertAdaptiveProfile(
    profile: Omit<StudentAdaptiveProfileRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<StudentAdaptiveProfileRecord> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `INSERT INTO student_adaptive_profile (
        student_id, overall_mastery, overall_accuracy, overall_confidence,
        learning_consistency, total_assessed_questions, total_correct_answers,
        total_incorrect_answers, total_skipped_answers, total_quizzes_completed,
        total_study_seconds, last_learning_activity, last_assessment_activity,
        metadata, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (student_id)
      DO UPDATE SET
        overall_mastery = EXCLUDED.overall_mastery,
        overall_accuracy = EXCLUDED.overall_accuracy,
        overall_confidence = EXCLUDED.overall_confidence,
        learning_consistency = EXCLUDED.learning_consistency,
        total_assessed_questions = EXCLUDED.total_assessed_questions,
        total_correct_answers = EXCLUDED.total_correct_answers,
        total_incorrect_answers = EXCLUDED.total_incorrect_answers,
        total_skipped_answers = EXCLUDED.total_skipped_answers,
        total_quizzes_completed = EXCLUDED.total_quizzes_completed,
        total_study_seconds = EXCLUDED.total_study_seconds,
        last_learning_activity = EXCLUDED.last_learning_activity,
        last_assessment_activity = EXCLUDED.last_assessment_activity,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *`,
      [
        profile.student_id,
        profile.overall_mastery,
        profile.overall_accuracy,
        profile.overall_confidence,
        profile.learning_consistency,
        profile.total_assessed_questions,
        profile.total_correct_answers,
        profile.total_incorrect_answers,
        profile.total_skipped_answers,
        profile.total_quizzes_completed,
        profile.total_study_seconds,
        profile.last_learning_activity,
        profile.last_assessment_activity,
        JSON.stringify(profile.metadata || {}),
      ]
    );

    const row = res.rows[0];
    return this.mapProfileRow(row);
  }

  /**
   * Upsert student subject mastery record.
   */
  async upsertSubjectMastery(
    subjectMastery: Omit<StudentSubjectMasteryRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<StudentSubjectMasteryRecord> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `INSERT INTO student_subject_mastery (
        student_id, subject, assessed_question_count, correct_count,
        incorrect_count, skipped_count, accuracy, mastery_score,
        confidence_score, recent_performance, trend, readiness_indicator,
        last_assessed, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (student_id, subject)
      DO UPDATE SET
        assessed_question_count = EXCLUDED.assessed_question_count,
        correct_count = EXCLUDED.correct_count,
        incorrect_count = EXCLUDED.incorrect_count,
        skipped_count = EXCLUDED.skipped_count,
        accuracy = EXCLUDED.accuracy,
        mastery_score = EXCLUDED.mastery_score,
        confidence_score = EXCLUDED.confidence_score,
        recent_performance = EXCLUDED.recent_performance,
        trend = EXCLUDED.trend,
        readiness_indicator = EXCLUDED.readiness_indicator,
        last_assessed = EXCLUDED.last_assessed,
        updated_at = NOW()
      RETURNING *`,
      [
        subjectMastery.student_id,
        subjectMastery.subject,
        subjectMastery.assessed_question_count,
        subjectMastery.correct_count,
        subjectMastery.incorrect_count,
        subjectMastery.skipped_count,
        subjectMastery.accuracy,
        subjectMastery.mastery_score,
        subjectMastery.confidence_score,
        subjectMastery.recent_performance,
        subjectMastery.trend,
        subjectMastery.readiness_indicator,
        subjectMastery.last_assessed,
      ]
    );

    const row = res.rows[0];
    return this.mapSubjectRow(row);
  }

  /**
   * Upsert student topic mastery record.
   */
  async upsertTopicMastery(
    topicMastery: Omit<StudentTopicMasteryRecord, 'id' | 'created_at' | 'updated_at'>
  ): Promise<StudentTopicMasteryRecord> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `INSERT INTO student_topic_mastery (
        student_id, subject, topic, attempts, correct, incorrect, skipped,
        accuracy, mastery_score, confidence_score, recent_accuracy, trend,
        last_attempted, retention_indicator, recommended_difficulty, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
      ON CONFLICT (student_id, subject, topic)
      DO UPDATE SET
        attempts = EXCLUDED.attempts,
        correct = EXCLUDED.correct,
        incorrect = EXCLUDED.incorrect,
        skipped = EXCLUDED.skipped,
        accuracy = EXCLUDED.accuracy,
        mastery_score = EXCLUDED.mastery_score,
        confidence_score = EXCLUDED.confidence_score,
        recent_accuracy = EXCLUDED.recent_accuracy,
        trend = EXCLUDED.trend,
        last_attempted = EXCLUDED.last_attempted,
        retention_indicator = EXCLUDED.retention_indicator,
        recommended_difficulty = EXCLUDED.recommended_difficulty,
        updated_at = NOW()
      RETURNING *`,
      [
        topicMastery.student_id,
        topicMastery.subject,
        topicMastery.topic,
        topicMastery.attempts,
        topicMastery.correct,
        topicMastery.incorrect,
        topicMastery.skipped,
        topicMastery.accuracy,
        topicMastery.mastery_score,
        topicMastery.confidence_score,
        topicMastery.recent_accuracy,
        topicMastery.trend,
        topicMastery.last_attempted,
        topicMastery.retention_indicator,
        topicMastery.recommended_difficulty,
      ]
    );

    const row = res.rows[0];
    return this.mapTopicRow(row);
  }

  /**
   * Get student adaptive profile by studentId.
   */
  async getAdaptiveProfile(studentId: string): Promise<StudentAdaptiveProfileRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT * FROM student_adaptive_profile WHERE student_id = $1`,
      [studentId]
    );
    if (res.rows.length === 0) return null;
    return this.mapProfileRow(res.rows[0]);
  }

  /**
   * Get all subject mastery records for a student.
   */
  async getSubjectMastery(studentId: string): Promise<StudentSubjectMasteryRecord[]> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT * FROM student_subject_mastery WHERE student_id = $1 ORDER BY assessed_question_count DESC, subject ASC`,
      [studentId]
    );
    return res.rows.map((r) => this.mapSubjectRow(r));
  }

  /**
   * Get topic mastery records for a student, optionally filtered by subject.
   */
  async getTopicMastery(studentId: string, subject?: string): Promise<StudentTopicMasteryRecord[]> {
    const pool = getRequiredPool();
    let query = `SELECT * FROM student_topic_mastery WHERE student_id = $1`;
    const params: any[] = [studentId];
    if (subject) {
      params.push(subject);
      query += ` AND LOWER(subject) = LOWER($2)`;
    }
    query += ` ORDER BY subject ASC, mastery_score DESC, attempts DESC`;

    const res = await pool.query(query, params);
    return res.rows.map((r) => this.mapTopicRow(r));
  }

  /**
   * Get raw chronological answer evidence from all quiz submissions for this student.
   */
  async getEvidenceAnswersForStudent(studentId: string): Promise<StudentAnswerEvidence[]> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT 
        qa.id,
        qa.session_id,
        qa.question_id,
        qa.selected_option_ids,
        qa.answer_text,
        qa.time_spent_seconds,
        qa.answered_at,
        qq.question_type,
        qq.correct_option_ids,
        qq.correct_answer_text,
        COALESCE(NULLIF(TRIM(qq.topic), ''), NULLIF(TRIM(q.topic), ''), 'General') as topic,
        COALESCE(NULLIF(TRIM(q.subject), ''), 'General') as subject,
        qs.start_time
      FROM quiz_answers qa
      JOIN quiz_questions qq ON qa.question_id = qq.id
      JOIN quiz_sessions qs ON qa.session_id = qs.id
      JOIN quizzes q ON qs.quiz_id = q.id
      WHERE qa.student_id = $1 AND qs.status IN ('submitted', 'expired', 'auto_submitted')
      ORDER BY qa.answered_at ASC`,
      [studentId]
    );

    return res.rows.map((row) => {
      const selectedOpts: string[] = Array.isArray(row.selected_option_ids)
        ? row.selected_option_ids
        : typeof row.selected_option_ids === 'string'
        ? JSON.parse(row.selected_option_ids || '[]')
        : [];

      const correctOpts: string[] = Array.isArray(row.correct_option_ids)
        ? row.correct_option_ids
        : typeof row.correct_option_ids === 'string'
        ? JSON.parse(row.correct_option_ids || '[]')
        : [];

      let isCorrect = false;

      if (['MCQ', 'single_choice', 'true_false', 'TRUE_FALSE', 'MULTIPLE_SELECT', 'multiple_choice'].includes(row.question_type)) {
        if (selectedOpts.length > 0 && selectedOpts.length === correctOpts.length) {
          isCorrect = selectedOpts.every((id) => correctOpts.includes(id));
        }
      } else if (row.question_type === 'FILL_BLANK') {
        const stud = (row.answer_text || '').trim().toLowerCase();
        const corr = (row.correct_answer_text || '').trim().toLowerCase();
        if (stud && corr && stud === corr) {
          isCorrect = true;
        }
      }

      return {
        id: row.id,
        sessionId: row.session_id,
        questionId: row.question_id,
        subject: row.subject,
        topic: row.topic,
        isCorrect,
        answeredAt: new Date(row.answered_at),
        sessionStartTime: new Date(row.start_time),
      };
    });
  }

  /**
   * Get student's overall quiz stats for model consistency.
   */
  async getStudentQuizStats(studentId: string): Promise<{
    completedQuizzes: number;
    totalAttempted: number;
    totalCorrect: number;
    totalIncorrect: number;
    totalSkipped: number;
    lastAssessmentDate: Date | null;
  }> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT 
        COUNT(*)::int as completed_quizzes,
        COALESCE(SUM(attempted_questions), 0)::int as total_attempted,
        COALESCE(SUM(correct_answers), 0)::int as total_correct,
        COALESCE(SUM(incorrect_answers), 0)::int as total_incorrect,
        COALESCE(SUM(skipped_questions), 0)::int as total_skipped,
        MAX(submitted_at) as last_assessment
       FROM quiz_results
       WHERE student_id = $1`,
      [studentId]
    );

    const row = res.rows[0];
    return {
      completedQuizzes: Number(row?.completed_quizzes) || 0,
      totalAttempted: Number(row?.total_attempted) || 0,
      totalCorrect: Number(row?.total_correct) || 0,
      totalIncorrect: Number(row?.total_incorrect) || 0,
      totalSkipped: Number(row?.total_skipped) || 0,
      lastAssessmentDate: row?.last_assessment ? new Date(row.last_assessment) : null,
    };
  }

  /**
   * Helper mappers.
   */
  private mapProfileRow(row: any): StudentAdaptiveProfileRecord {
    return {
      id: row.id,
      student_id: row.student_id,
      overall_mastery: parseFloat(row.overall_mastery) || 0,
      overall_accuracy: parseFloat(row.overall_accuracy) || 0,
      overall_confidence: parseFloat(row.overall_confidence) || 0,
      learning_consistency: parseFloat(row.learning_consistency) || 0,
      total_assessed_questions: parseInt(row.total_assessed_questions, 10) || 0,
      total_correct_answers: parseInt(row.total_correct_answers, 10) || 0,
      total_incorrect_answers: parseInt(row.total_incorrect_answers, 10) || 0,
      total_skipped_answers: parseInt(row.total_skipped_answers, 10) || 0,
      total_quizzes_completed: parseInt(row.total_quizzes_completed, 10) || 0,
      total_study_seconds: parseInt(row.total_study_seconds, 10) || 0,
      last_learning_activity: row.last_learning_activity ? new Date(row.last_learning_activity) : null,
      last_assessment_activity: row.last_assessment_activity ? new Date(row.last_assessment_activity) : null,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapSubjectRow(row: any): StudentSubjectMasteryRecord {
    return {
      id: row.id,
      student_id: row.student_id,
      subject: row.subject,
      assessed_question_count: parseInt(row.assessed_question_count, 10) || 0,
      correct_count: parseInt(row.correct_count, 10) || 0,
      incorrect_count: parseInt(row.incorrect_count, 10) || 0,
      skipped_count: parseInt(row.skipped_count, 10) || 0,
      accuracy: parseFloat(row.accuracy) || 0,
      mastery_score: parseFloat(row.mastery_score) || 0,
      confidence_score: parseFloat(row.confidence_score) || 0,
      recent_performance: parseFloat(row.recent_performance) || 0,
      trend: row.trend || 'insufficient_data',
      readiness_indicator: row.readiness_indicator || 'emerging',
      last_assessed: row.last_assessed ? new Date(row.last_assessed) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private mapTopicRow(row: any): StudentTopicMasteryRecord {
    return {
      id: row.id,
      student_id: row.student_id,
      subject: row.subject,
      topic: row.topic,
      attempts: parseInt(row.attempts, 10) || 0,
      correct: parseInt(row.correct, 10) || 0,
      incorrect: parseInt(row.incorrect, 10) || 0,
      skipped: parseInt(row.skipped, 10) || 0,
      accuracy: parseFloat(row.accuracy) || 0,
      mastery_score: parseFloat(row.mastery_score) || 0,
      confidence_score: parseFloat(row.confidence_score) || 0,
      recent_accuracy: parseFloat(row.recent_accuracy) || 0,
      trend: row.trend || 'insufficient_data',
      last_attempted: row.last_attempted ? new Date(row.last_attempted) : null,
      retention_indicator: row.retention_indicator || 'baseline',
      recommended_difficulty: row.recommended_difficulty || 'easy',
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}

export const adaptiveModelRepository = new AdaptiveModelRepository();
