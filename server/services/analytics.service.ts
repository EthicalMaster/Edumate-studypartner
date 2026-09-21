/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { analyticsRepository, type StudySessionRecord } from '../repositories/analytics.repository.js';
import { getRequiredPool } from '../db/connection.js';

export const MAX_SESSION_DURATION_SECONDS = 14400; // 4 hours cap
export const MAX_HEARTBEAT_GAP_SECONDS = 900; // 15 minutes max gap between heartbeats

/**
 * Pure, deterministic streak calculation function.
 * Evaluates consecutive qualifying active days ending either today or yesterday.
 *
 * @param activeDates Array of 'YYYY-MM-DD' formatted dates when student had activity
 * @param referenceDate Optional reference Date for testing (defaults to now)
 */
export function calculateStudyStreak(
  activeDates: string[],
  referenceDate: Date = new Date()
): { currentStreak: number; isActiveToday: boolean } {
  if (!activeDates || activeDates.length === 0) {
    return { currentStreak: 0, isActiveToday: false };
  }

  const dateSet = new Set(activeDates);

  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth();
  const refDay = referenceDate.getUTCDate();

  const getDateStr = (offsetDays: number): string => {
    const d = new Date(Date.UTC(refYear, refMonth, refDay + offsetDays));
    return d.toISOString().slice(0, 10);
  };

  const todayStr = getDateStr(0);
  const yesterdayStr = getDateStr(-1);

  const isActiveToday = dateSet.has(todayStr);

  let currentStreak = 0;

  if (isActiveToday) {
    currentStreak = 1;
    // Check backwards from yesterday
    let offset = -1;
    while (dateSet.has(getDateStr(offset))) {
      currentStreak++;
      offset--;
    }
  } else if (dateSet.has(yesterdayStr)) {
    // Active yesterday: streak is alive but student has not studied yet today
    currentStreak = 1;
    let offset = -2;
    while (dateSet.has(getDateStr(offset))) {
      currentStreak++;
      offset--;
    }
  } else {
    // Neither today nor yesterday had activity; streak is 0
    currentStreak = 0;
  }

  return { currentStreak, isActiveToday };
}

/**
 * Format total seconds into human-readable e.g. "6h 32m" or "0h 0m".
 */
export function formatDurationSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return '0h 0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Format relative time (e.g. "2 hours ago", "Just now").
 */
export function formatTimeAgo(timestamp: Date, referenceDate: Date = new Date()): string {
  const diffMs = referenceDate.getTime() - timestamp.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

export class AnalyticsService {
  /**
   * Start a new study session.
   */
  async startStudySession(
    studentId: string,
    subject?: string,
    topic?: string
  ): Promise<StudySessionRecord> {
    const session = await analyticsRepository.createStudySession(studentId, subject, topic);
    await analyticsRepository.logActivity(studentId, 'study_session_started', 0, {
      session_id: session.id,
      subject: session.subject,
      topic: session.topic,
    });
    return session;
  }

  /**
   * Update heartbeat for an active study session.
   */
  async heartbeatStudySession(
    sessionId: string,
    studentId: string
  ): Promise<{ status: string; duration_seconds: number }> {
    const session = await analyticsRepository.getStudySessionById(sessionId);
    if (!session) {
      const err: any = new Error('Study session not found.');
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (session.student_id !== studentId) {
      const err: any = new Error('You do not have permission to access this study session.');
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (session.status !== 'active') {
      const err: any = new Error(`Cannot send heartbeat for ${session.status} session.`);
      err.code = 'SESSION_NOT_ACTIVE';
      throw err;
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(
      0,
      Math.min(MAX_SESSION_DURATION_SECONDS, Math.round((now - session.started_at.getTime()) / 1000))
    );

    const updated = await analyticsRepository.updateStudySessionHeartbeat(sessionId, elapsedSeconds);
    return {
      status: updated?.status || 'active',
      duration_seconds: updated?.duration_seconds || elapsedSeconds,
    };
  }

  /**
   * Complete study session with final server-authoritative elapsed duration.
   */
  async completeStudySession(
    sessionId: string,
    studentId: string
  ): Promise<StudySessionRecord> {
    const session = await analyticsRepository.getStudySessionById(sessionId);
    if (!session) {
      const err: any = new Error('Study session not found.');
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (session.student_id !== studentId) {
      const err: any = new Error('You do not have permission to access this study session.');
      err.code = 'FORBIDDEN';
      throw err;
    }

    // Idempotent completion: if already completed, return as-is
    if (session.status === 'completed') {
      return session;
    }

    const now = Date.now();
    const finalDuration = Math.max(
      0,
      Math.min(MAX_SESSION_DURATION_SECONDS, Math.round((now - session.started_at.getTime()) / 1000))
    );

    const completed = await analyticsRepository.completeStudySession(sessionId, finalDuration);
    if (!completed) {
      throw new Error('Failed to complete study session.');
    }

    await analyticsRepository.logActivity(studentId, 'study_session_completed', completed.duration_seconds, {
      session_id: completed.id,
      duration_seconds: completed.duration_seconds,
      subject: completed.subject,
      topic: completed.topic,
    });

    return completed;
  }

  /**
   * Aggregate all metrics for GET /api/analytics/dashboard.
   */
  async getDashboard(studentId: string, referenceDate: Date = new Date()) {
    // 1. Profile and greeting info
    const profileInfo = await analyticsRepository.getStudentProfileGreetingInfo(studentId);
    const hour = referenceDate.getUTCHours();
    let timeOfDay: 'morning' | 'afternoon' | 'evening' = 'morning';
    if (hour >= 12 && hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour >= 17 || hour < 5) {
      timeOfDay = 'evening';
    }

    // 2. Streak calculation
    const activeDates = await analyticsRepository.getDistinctActiveDates(studentId);
    const studyStreak = calculateStudyStreak(activeDates, referenceDate);

    // 3. Study time this week (last 7 days)
    const sevenDaysAgo = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const totalSecondsThisWeek = await analyticsRepository.getStudyTimeSeconds(studentId, sevenDaysAgo);
    const dailyAverageHours = Math.round((totalSecondsThisWeek / (7 * 3600)) * 10) / 10;

    // 4. Quizzes summary
    const quizStats = await analyticsRepository.getQuizPerformanceStats(studentId);

    // 5. Counts
    const [flashcardStats, materialsCount, recentActivityRows, subjectProgress, weakTopics, continueLearning] =
      await Promise.all([
        analyticsRepository.getFlashcardStats(studentId),
        analyticsRepository.getMaterialsCount(studentId),
        analyticsRepository.getRecentActivity(studentId, 6),
        analyticsRepository.getSubjectProgress(studentId),
        analyticsRepository.getWeakTopics(studentId),
        analyticsRepository.getContinueLearning(studentId),
      ]);

    // Format recent activity
    const recentActivity = recentActivityRows.map((act) => {
      let title = 'Study Activity';
      let icon = 'history';

      switch (act.activity_type) {
        case 'quiz_completed':
          title = `Completed Quiz: ${act.metadata?.score ?? ''} pts (${act.metadata?.percentage ?? 0}%)`;
          icon = 'quiz';
          break;
        case 'quiz_started':
          title = `Started Quiz: ${act.metadata?.title || 'Practice Test'}`;
          icon = 'play_circle';
          break;
        case 'study_material_uploaded':
        case 'material_uploaded':
          title = `Uploaded Study Material`;
          icon = 'upload_file';
          break;
        case 'study_material_processed':
          title = `Document Analyzed & Structured`;
          icon = 'menu_book';
          break;
        case 'flashcard_reviewed':
          title = `Reviewed Flashcard`;
          icon = 'style';
          break;
        case 'study_session_started':
          title = `Started Study Session${act.metadata?.subject ? ` (${act.metadata.subject})` : ''}`;
          icon = 'timer';
          break;
        case 'study_session_completed':
          title = `Completed Study Session (${formatDurationSeconds(act.duration_seconds)})`;
          icon = 'check_circle';
          break;
        default:
          title = act.activity_type.replace(/_/g, ' ');
      }

      return {
        id: act.id,
        type: act.activity_type,
        title,
        icon,
        durationSeconds: act.duration_seconds,
        formattedDuration: formatDurationSeconds(act.duration_seconds),
        timestamp: act.activity_timestamp.toISOString(),
        timeAgo: formatTimeAgo(act.activity_timestamp, referenceDate),
      };
    });

    return {
      greeting: {
        name: profileInfo.fullName,
        timeOfDay,
      },
      studyStreak,
      studyTimeThisWeek: {
        totalSeconds: totalSecondsThisWeek,
        formatted: formatDurationSeconds(totalSecondsThisWeek),
        dailyAverageHours,
      },
      quizzesCompleted: {
        total: quizStats.totalQuizzes,
        completedToday: quizStats.completedToday,
      },
      averageQuizPercentage: quizStats.averagePercentage,
      flashcardsCount: flashcardStats.totalCards,
      materialsCount,
      recentActivity,
      subjectProgress,
      weakTopics: weakTopics.slice(0, 4), // Top 4 priority for dashboard preview
      continueLearning,
    };
  }

  /**
   * Aggregate all metrics for GET /api/analytics/progress.
   */
  async getProgress(studentId: string, referenceDate: Date = new Date()) {
    // 1. Total study time all-time
    const totalStudySeconds = await analyticsRepository.getStudyTimeSeconds(studentId);

    // 2. Streak
    const activeDates = await analyticsRepository.getDistinctActiveDates(studentId);
    const studyStreak = calculateStudyStreak(activeDates, referenceDate);

    // 3. Weekly Study Distribution (last 7 days: day label, date, hours, seconds, active)
    const weeklyDistribution = await this.getWeeklyDistribution(studentId, referenceDate);

    // 4. Quiz Performance Stats
    const quizStats = await analyticsRepository.getQuizPerformanceStats(studentId);

    // 5. Subject & Topic Performance
    const [subjectPerformance, topicPerformance, flashcardStats] = await Promise.all([
      analyticsRepository.getSubjectProgress(studentId),
      analyticsRepository.getTopicPerformance(studentId),
      analyticsRepository.getFlashcardStats(studentId),
    ]);

    // 6. Retention Stability (strictly grounded in measurable data)
    let stabilityLabel = 'Baseline Establishing';
    if (quizStats.totalQuizzes === 0) {
      stabilityLabel = 'No Quiz History';
    } else if (quizStats.totalQuizzes >= 3) {
      const delta = quizStats.recentPercentage - quizStats.averagePercentage;
      if (delta >= 5) {
        stabilityLabel = 'Accelerating Retention (+)';
      } else if (delta <= -5) {
        stabilityLabel = 'Review Recommended (-)';
      } else {
        stabilityLabel = 'Consistent Retention';
      }
    }

    const accuracyDelta =
      quizStats.totalQuizzes > 0
        ? Math.round((quizStats.recentPercentage - quizStats.averagePercentage) * 10) / 10
        : 0;

    return {
      totalStudyTime: {
        totalSeconds: totalStudySeconds,
        formatted: formatDurationSeconds(totalStudySeconds),
        hours: Math.round((totalStudySeconds / 3600) * 10) / 10,
      },
      studyStreak,
      weeklyStudyDistribution: weeklyDistribution,
      quizPerformance: {
        totalQuizzes: quizStats.totalQuizzes,
        totalQuestionsAttempted: quizStats.totalAttempted,
        totalQuestionsCorrect: quizStats.totalCorrect,
        overallAccuracy: quizStats.overallAccuracy,
        averagePercentage: quizStats.averagePercentage,
        recentPercentage: quizStats.recentPercentage,
      },
      subjectPerformance,
      topicPerformance: topicPerformance.map((t) => ({
        subject: t.subject,
        topic: t.topic,
        attempts: t.attempts,
        correct: t.correct,
        incorrect: t.incorrect,
        accuracy: t.accuracy,
      })),
      flashcardStats,
      retentionStability: {
        averageQuizAccuracy: quizStats.averagePercentage,
        recentQuizAccuracy: quizStats.recentPercentage,
        accuracyDelta,
        stabilityLabel,
        totalQuizzesEvaluated: quizStats.totalQuizzes,
      },
    };
  }

  /**
   * Helper to compute 7-day weekly study distribution ending on referenceDate.
   */
  private async getWeeklyDistribution(studentId: string, referenceDate: Date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const pool = getRequiredPool();

    // Fetch study_sessions and quiz_results grouped by day in the last 7 days
    const sevenDaysAgo = new Date(Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate() - 6
    ));

    const [sessionsRes, quizzesRes] = await Promise.all([
      pool.query(
        `SELECT started_at, duration_seconds
         FROM study_sessions
         WHERE student_id = $1 AND started_at >= $2`,
        [studentId, sevenDaysAgo]
      ),
      pool.query(
        `SELECT submitted_at, time_taken_seconds
         FROM quiz_results
         WHERE student_id = $1 AND submitted_at >= $2`,
        [studentId, sevenDaysAgo]
      ),
    ]);

    const daySecondsMap = new Map<string, number>();

    for (const r of sessionsRes.rows) {
      const d = new Date(r.started_at).toISOString().slice(0, 10);
      const secs = Number(r.duration_seconds) || 0;
      daySecondsMap.set(d, (daySecondsMap.get(d) || 0) + secs);
    }

    for (const r of quizzesRes.rows) {
      const d = new Date(r.submitted_at).toISOString().slice(0, 10);
      const secs = Number(r.time_taken_seconds) || 0;
      daySecondsMap.set(d, (daySecondsMap.get(d) || 0) + secs);
    }

    const distribution: Array<{ day: string; date: string; hours: number; seconds: number; active: boolean }> = [];

    for (let offset = 6; offset >= 0; offset--) {
      const current = new Date(Date.UTC(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth(),
        referenceDate.getUTCDate() - offset
      ));
      const dateStr = current.toISOString().slice(0, 10);
      const dayLabel = days[current.getUTCDay()];
      const seconds = daySecondsMap.get(dateStr) || 0;
      const hours = Math.round((seconds / 3600) * 10) / 10;

      distribution.push({
        day: dayLabel,
        date: dateStr,
        hours,
        seconds,
        active: seconds > 0,
      });
    }

    return distribution;
  }

  /**
   * Retrieve weak topics for GET /api/analytics/weak-topics.
   */
  async getWeakTopics(studentId: string) {
    return analyticsRepository.getWeakTopics(studentId);
  }
}

export const analyticsService = new AnalyticsService();
