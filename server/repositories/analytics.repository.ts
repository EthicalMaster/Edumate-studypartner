/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';

export interface StudySessionRecord {
  id: string;
  student_id: string;
  subject: string | null;
  topic: string | null;
  started_at: Date;
  last_heartbeat_at: Date;
  completed_at: Date | null;
  duration_seconds: number;
  status: 'active' | 'completed' | 'abandoned';
  created_at: Date;
  updated_at: Date;
}

export interface ActivityRecord {
  id: string;
  student_id: string;
  activity_type: string;
  duration_seconds: number;
  metadata: any;
  activity_timestamp: Date;
}

export interface SubjectProgressItem {
  subject: string;
  attempted: number;
  correct: number;
  accuracy: number;
  quizzesCount: number;
}

export interface TopicProgressItem {
  subject: string;
  topic: string;
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  sessionCount: number;
  firstHalfAccuracy?: number;
  secondHalfAccuracy?: number;
}

export interface WeakTopicItem {
  id: string;
  subject: string;
  topic: string;
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  priority: 'HIGH' | 'MEDIUM' | 'REVIEW';
  trend: 'improving' | 'declining' | 'steady' | 'insufficient_data';
}

export class AnalyticsRepository {
  /**
   * Log an activity event to the audit trail.
   */
  async logActivity(
    studentId: string,
    activityType: string,
    durationSeconds: number = 0,
    metadata: any = {}
  ): Promise<void> {
    const pool = getRequiredPool();
    await pool.query(
      `INSERT INTO student_activity (student_id, activity_type, duration_seconds, metadata, activity_timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [studentId, activityType, Math.max(0, durationSeconds), JSON.stringify(metadata)]
    );
  }

  /**
   * Retrieve the most recent activity items for a student.
   */
  async getRecentActivity(studentId: string, limit: number = 8): Promise<ActivityRecord[]> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT id, student_id, activity_type, duration_seconds, metadata, activity_timestamp
       FROM student_activity
       WHERE student_id = $1
       ORDER BY activity_timestamp DESC
       LIMIT $2`,
      [studentId, limit]
    );

    return res.rows.map((row) => ({
      id: row.id,
      student_id: row.student_id,
      activity_type: row.activity_type,
      duration_seconds: Number(row.duration_seconds) || 0,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      activity_timestamp: new Date(row.activity_timestamp),
    }));
  }

  /**
   * Create and start a new server-authoritative study session.
   */
  async createStudySession(
    studentId: string,
    subject?: string,
    topic?: string
  ): Promise<StudySessionRecord> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `INSERT INTO study_sessions (student_id, subject, topic, started_at, last_heartbeat_at, status, duration_seconds)
       VALUES ($1, $2, $3, NOW(), NOW(), 'active', 0)
       RETURNING id, student_id, subject, topic, started_at, last_heartbeat_at, completed_at, duration_seconds, status, created_at, updated_at`,
      [studentId, subject || null, topic || null]
    );

    const row = res.rows[0];
    return {
      ...row,
      started_at: new Date(row.started_at),
      last_heartbeat_at: new Date(row.last_heartbeat_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Retrieve a study session by ID.
   */
  async getStudySessionById(sessionId: string): Promise<StudySessionRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT id, student_id, subject, topic, started_at, last_heartbeat_at, completed_at, duration_seconds, status, created_at, updated_at
       FROM study_sessions
       WHERE id = $1`,
      [sessionId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      started_at: new Date(row.started_at),
      last_heartbeat_at: new Date(row.last_heartbeat_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Update study session heartbeat and duration.
   */
  async updateStudySessionHeartbeat(
    sessionId: string,
    durationSeconds: number
  ): Promise<StudySessionRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `UPDATE study_sessions
       SET last_heartbeat_at = NOW(),
           duration_seconds = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING id, student_id, subject, topic, started_at, last_heartbeat_at, completed_at, duration_seconds, status, created_at, updated_at`,
      [sessionId, durationSeconds]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      started_at: new Date(row.started_at),
      last_heartbeat_at: new Date(row.last_heartbeat_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Complete study session with final duration.
   */
  async completeStudySession(
    sessionId: string,
    finalDurationSeconds: number
  ): Promise<StudySessionRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `UPDATE study_sessions
       SET completed_at = NOW(),
           duration_seconds = $2,
           status = 'completed',
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, student_id, subject, topic, started_at, last_heartbeat_at, completed_at, duration_seconds, status, created_at, updated_at`,
      [sessionId, finalDurationSeconds]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      started_at: new Date(row.started_at),
      last_heartbeat_at: new Date(row.last_heartbeat_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  /**
   * Get distinct active dates (YYYY-MM-DD in UTC) for streak calculation.
   */
  async getDistinctActiveDates(studentId: string): Promise<string[]> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT activity_timestamp FROM student_activity WHERE student_id = $1
       UNION ALL
       SELECT submitted_at as activity_timestamp FROM quiz_results WHERE student_id = $1
       UNION ALL
       SELECT started_at as activity_timestamp FROM study_sessions WHERE student_id = $1 AND (status = 'completed' OR duration_seconds > 0)`,
      [studentId]
    );

    const dateSet = new Set<string>();
    for (const row of res.rows) {
      if (row.activity_timestamp) {
        const d = new Date(row.activity_timestamp);
        if (!isNaN(d.getTime())) {
          dateSet.add(d.toISOString().slice(0, 10));
        }
      }
    }

    return Array.from(dateSet).sort().reverse();
  }

  /**
   * Get total study seconds from both study_sessions and quiz_results.
   */
  async getStudyTimeSeconds(studentId: string, sinceDate?: Date): Promise<number> {
    const pool = getRequiredPool();
    let querySessions = `SELECT COALESCE(SUM(duration_seconds), 0)::int as total FROM study_sessions WHERE student_id = $1`;
    let queryQuizzes = `SELECT COALESCE(SUM(time_taken_seconds), 0)::int as total FROM quiz_results WHERE student_id = $1`;
    const params: any[] = [studentId];

    if (sinceDate) {
      params.push(sinceDate);
      querySessions += ` AND started_at >= $2`;
      queryQuizzes += ` AND submitted_at >= $2`;
    }

    const [sessionsRes, quizzesRes] = await Promise.all([
      pool.query(querySessions, params),
      pool.query(queryQuizzes, params),
    ]);

    const sessionSeconds = Number(sessionsRes.rows[0]?.total) || 0;
    const quizSeconds = Number(quizzesRes.rows[0]?.total) || 0;
    return sessionSeconds + quizSeconds;
  }

  /**
   * Aggregate quiz performance metrics from quiz_results.
   */
  async getQuizPerformanceStats(studentId: string): Promise<{
    totalQuizzes: number;
    totalAttempted: number;
    totalCorrect: number;
    overallAccuracy: number;
    averagePercentage: number;
    completedToday: number;
    recentPercentage: number;
  }> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT 
        id, total_questions, attempted_questions, correct_answers, 
        percentage::float as percentage, time_taken_seconds, submitted_at
       FROM quiz_results
       WHERE student_id = $1
       ORDER BY submitted_at DESC`,
      [studentId]
    );

    const rows = res.rows;
    if (rows.length === 0) {
      return {
        totalQuizzes: 0,
        totalAttempted: 0,
        totalCorrect: 0,
        overallAccuracy: 0,
        averagePercentage: 0,
        completedToday: 0,
        recentPercentage: 0,
      };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    let totalAttempted = 0;
    let totalCorrect = 0;
    let totalPercentage = 0;
    let completedToday = 0;

    for (const r of rows) {
      totalAttempted += Number(r.attempted_questions) || 0;
      totalCorrect += Number(r.correct_answers) || 0;
      totalPercentage += Number(r.percentage) || 0;

      const subDate = new Date(r.submitted_at).toISOString().slice(0, 10);
      if (subDate === todayStr) {
        completedToday++;
      }
    }

    const totalQuizzes = rows.length;
    const averagePercentage = Math.round((totalPercentage / totalQuizzes) * 10) / 10;
    const overallAccuracy =
      totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 1000) / 10 : 0;

    // Recent 3 quizzes average
    const recentRows = rows.slice(0, 3);
    const recentTotal = recentRows.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0);
    const recentPercentage =
      recentRows.length > 0 ? Math.round((recentTotal / recentRows.length) * 10) / 10 : averagePercentage;

    return {
      totalQuizzes,
      totalAttempted,
      totalCorrect,
      overallAccuracy,
      averagePercentage,
      completedToday,
      recentPercentage,
    };
  }

  /**
   * Retrieve all graded question answers for detailed topic and subject performance.
   */
  async getDetailedStudentAnswers(studentId: string) {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT 
        qa.id,
        qa.session_id,
        qa.question_id,
        qa.selected_option_ids,
        qa.answer_text,
        qa.answered_at,
        qq.question_type,
        qq.options,
        qq.correct_option_ids,
        qq.correct_answer_text,
        COALESCE(qq.topic, q.topic) as topic,
        q.subject,
        qs.start_time
       FROM quiz_answers qa
       JOIN quiz_questions qq ON qa.question_id = qq.id
       JOIN quizzes q ON qq.quiz_id = q.id
       JOIN quiz_sessions qs ON qa.session_id = qs.id
       WHERE qa.student_id = $1 AND qs.status IN ('submitted', 'auto_submitted', 'completed')
       ORDER BY qs.start_time ASC, qa.answered_at ASC`,
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
        subject: row.subject || 'General',
        topic: row.topic || 'General',
        isCorrect,
        answeredAt: new Date(row.answered_at),
        sessionStartTime: new Date(row.start_time),
      };
    });
  }

  /**
   * Calculate Subject Progress breakdown.
   */
  async getSubjectProgress(studentId: string): Promise<SubjectProgressItem[]> {
    const answers = await this.getDetailedStudentAnswers(studentId);
    if (answers.length === 0) return [];

    const subjectMap = new Map<string, { attempted: number; correct: number; sessions: Set<string> }>();

    for (const a of answers) {
      if (!subjectMap.has(a.subject)) {
        subjectMap.set(a.subject, { attempted: 0, correct: 0, sessions: new Set() });
      }
      const s = subjectMap.get(a.subject)!;
      s.attempted++;
      if (a.isCorrect) s.correct++;
      s.sessions.add(a.sessionId);
    }

    return Array.from(subjectMap.entries()).map(([subject, stats]) => ({
      subject,
      attempted: stats.attempted,
      correct: stats.correct,
      accuracy: stats.attempted > 0 ? Math.round((stats.correct / stats.attempted) * 100) : 0,
      quizzesCount: stats.sessions.size,
    })).sort((a, b) => b.attempted - a.attempted);
  }

  /**
   * Calculate Topic Performance and Weak Topics.
   */
  async getTopicPerformance(studentId: string): Promise<TopicProgressItem[]> {
    const answers = await this.getDetailedStudentAnswers(studentId);
    if (answers.length === 0) return [];

    const topicMap = new Map<
      string,
      {
        subject: string;
        topic: string;
        attempts: number;
        correct: number;
        sessions: Set<string>;
        chronologicalAnswers: boolean[];
      }
    >();

    for (const a of answers) {
      const key = `${a.subject}:::${a.topic}`;
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          subject: a.subject,
          topic: a.topic,
          attempts: 0,
          correct: 0,
          sessions: new Set(),
          chronologicalAnswers: [],
        });
      }
      const t = topicMap.get(key)!;
      t.attempts++;
      if (a.isCorrect) t.correct++;
      t.sessions.add(a.sessionId);
      t.chronologicalAnswers.push(a.isCorrect);
    }

    return Array.from(topicMap.values()).map((t) => {
      const incorrect = t.attempts - t.correct;
      const accuracy = t.attempts > 0 ? Math.round((t.correct / t.attempts) * 100) : 0;

      let firstHalfAccuracy: number | undefined;
      let secondHalfAccuracy: number | undefined;

      if (t.sessions.size >= 2 && t.attempts >= 4) {
        const mid = Math.floor(t.chronologicalAnswers.length / 2);
        const firstHalf = t.chronologicalAnswers.slice(0, mid);
        const secondHalf = t.chronologicalAnswers.slice(mid);

        const firstCorrect = firstHalf.filter(Boolean).length;
        const secondCorrect = secondHalf.filter(Boolean).length;

        firstHalfAccuracy = Math.round((firstCorrect / firstHalf.length) * 100);
        secondHalfAccuracy = Math.round((secondCorrect / secondHalf.length) * 100);
      }

      return {
        subject: t.subject,
        topic: t.topic,
        attempts: t.attempts,
        correct: t.correct,
        incorrect,
        accuracy,
        sessionCount: t.sessions.size,
        firstHalfAccuracy,
        secondHalfAccuracy,
      };
    });
  }

  /**
   * Calculate Weak Topics according to deterministic specification:
   * - attempts >= 3
   * - accuracy < 70%
   * - priority: HIGH (< 50%), MEDIUM (50..59%), REVIEW (60..69%)
   * - trend: 'improving', 'declining', 'steady', or 'insufficient_data'
   */
  async getWeakTopics(studentId: string): Promise<WeakTopicItem[]> {
    const topics = await this.getTopicPerformance(studentId);

    const weakList: WeakTopicItem[] = [];

    for (const t of topics) {
      if (t.attempts >= 3 && t.accuracy < 70) {
        let priority: 'HIGH' | 'MEDIUM' | 'REVIEW' = 'REVIEW';
        if (t.accuracy < 50) {
          priority = 'HIGH';
        } else if (t.accuracy < 60) {
          priority = 'MEDIUM';
        }

        let trend: 'improving' | 'declining' | 'steady' | 'insufficient_data' = 'insufficient_data';
        if (t.sessionCount >= 2 && t.firstHalfAccuracy !== undefined && t.secondHalfAccuracy !== undefined) {
          const delta = t.secondHalfAccuracy - t.firstHalfAccuracy;
          if (delta >= 5) {
            trend = 'improving';
          } else if (delta <= -5) {
            trend = 'declining';
          } else {
            trend = 'steady';
          }
        }

        weakList.push({
          id: `wt-${Buffer.from(`${t.subject}-${t.topic}`).toString('base64').replace(/=/g, '')}`,
          subject: t.subject,
          topic: t.topic,
          attempts: t.attempts,
          correct: t.correct,
          incorrect: t.incorrect,
          accuracy: t.accuracy,
          priority,
          trend,
        });
      }
    }

    // Sort by priority (HIGH first), then lowest accuracy, then most missed
    const priorityWeight: Record<string, number> = { HIGH: 3, MEDIUM: 2, REVIEW: 1 };
    weakList.sort((a, b) => {
      const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
      if (pDiff !== 0) return pDiff;
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return b.incorrect - a.incorrect;
    });

    return weakList;
  }

  /**
   * Flashcards and Flashcard Review statistics.
   */
  async getFlashcardStats(studentId: string): Promise<{
    totalCards: number;
    totalReviews: number;
    masteredCards: number;
    learningCards: number;
  }> {
    const pool = getRequiredPool();
    const [cardsRes, reviewsRes] = await Promise.all([
      pool.query(
        `SELECT mastery_state, COUNT(*)::int as count
         FROM flashcards
         WHERE student_id = $1
         GROUP BY mastery_state`,
        [studentId]
      ),
      pool.query(
        `SELECT COUNT(*)::int as count
         FROM flashcard_reviews
         WHERE student_id = $1`,
        [studentId]
      ),
    ]);

    let totalCards = 0;
    let masteredCards = 0;
    let learningCards = 0;

    for (const r of cardsRes.rows) {
      const c = Number(r.count) || 0;
      totalCards += c;
      if (r.mastery_state === 'mastered') masteredCards += c;
      if (r.mastery_state === 'learning') learningCards += c;
    }

    const totalReviews = Number(reviewsRes.rows[0]?.count) || 0;

    return {
      totalCards,
      totalReviews,
      masteredCards,
      learningCards,
    };
  }

  /**
   * Materials count for student.
   */
  async getMaterialsCount(studentId: string): Promise<number> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT COUNT(*)::int as count FROM study_materials WHERE student_id = $1`,
      [studentId]
    );
    return Number(res.rows[0]?.count) || 0;
  }

  /**
   * Get student full name / profile info for greeting.
   */
  async getStudentProfileGreetingInfo(studentId: string): Promise<{ fullName: string; email: string }> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT sp.full_name, u.email
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.id
       WHERE sp.id = $1`,
      [studentId]
    );

    if (res.rows.length === 0) {
      return { fullName: 'Student', email: '' };
    }
    return {
      fullName: res.rows[0].full_name || 'Student',
      email: res.rows[0].email || '',
    };
  }

  /**
   * Find most recent item for "Continue Learning" card.
   */
  async getContinueLearning(studentId: string) {
    const pool = getRequiredPool();

    // 1. Check for active or recently submitted quiz session
    const sessionRes = await pool.query(
      `SELECT qs.id, qs.quiz_id, qs.status, qs.start_time, q.title, q.subject, q.topic
       FROM quiz_sessions qs
       JOIN quizzes q ON qs.quiz_id = q.id
       WHERE qs.student_id = $1
       ORDER BY qs.start_time DESC
       LIMIT 1`,
      [studentId]
    );

    if (sessionRes.rows.length > 0) {
      const s = sessionRes.rows[0];
      return {
        type: 'quiz',
        id: s.quiz_id,
        sessionId: s.id,
        title: s.title,
        subject: s.subject,
        topic: s.topic,
        status: s.status,
      };
    }

    // 2. Check for latest study material
    const matRes = await pool.query(
      `SELECT id, title, subject, topic, created_at
       FROM study_materials
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [studentId]
    );

    if (matRes.rows.length > 0) {
      const m = matRes.rows[0];
      return {
        type: 'material',
        id: m.id,
        title: m.title,
        subject: m.subject,
        topic: m.topic,
      };
    }

    return null;
  }
}

export const analyticsRepository = new AnalyticsRepository();
