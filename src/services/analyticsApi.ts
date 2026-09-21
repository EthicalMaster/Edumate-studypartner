/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StudyStreakData {
  currentStreak: number;
  isActiveToday: boolean;
}

export interface StudyTimeData {
  totalSeconds: number;
  formatted: string;
  dailyAverageHours?: number;
  hours?: number;
}

export interface QuizzesCompletedData {
  total: number;
  completedToday: number;
}

export interface ActivityFeedItem {
  id: string;
  type: string;
  title: string;
  icon: string;
  durationSeconds: number;
  formattedDuration: string;
  timestamp: string;
  timeAgo: string;
}

export interface SubjectProgressData {
  subject: string;
  attempted: number;
  correct: number;
  accuracy: number;
  quizzesCount: number;
}

export interface WeakTopicData {
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

export interface ContinueLearningData {
  type: 'quiz' | 'material';
  id: string;
  sessionId?: string;
  title: string;
  subject: string;
  topic?: string;
  status?: string;
}

export interface DashboardResponse {
  greeting: {
    name: string;
    timeOfDay: 'morning' | 'afternoon' | 'evening';
  };
  studyStreak: StudyStreakData;
  studyTimeThisWeek: StudyTimeData;
  quizzesCompleted: QuizzesCompletedData;
  averageQuizPercentage: number;
  flashcardsCount: number;
  materialsCount: number;
  recentActivity: ActivityFeedItem[];
  subjectProgress: SubjectProgressData[];
  weakTopics: WeakTopicData[];
  continueLearning: ContinueLearningData | null;
}

export interface WeeklyStudyDay {
  day: string;
  date: string;
  hours: number;
  seconds: number;
  active: boolean;
}

export interface QuizPerformanceData {
  totalQuizzes: number;
  totalQuestionsAttempted: number;
  totalQuestionsCorrect: number;
  overallAccuracy: number;
  averagePercentage: number;
  recentPercentage: number;
}

export interface TopicPerformanceData {
  subject: string;
  topic: string;
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number;
}

export interface FlashcardStatsData {
  totalCards: number;
  totalReviews: number;
  masteredCards: number;
  learningCards: number;
}

export interface RetentionStabilityData {
  averageQuizAccuracy: number;
  recentQuizAccuracy: number;
  accuracyDelta: number;
  stabilityLabel: string;
  totalQuizzesEvaluated: number;
}

export interface ProgressResponse {
  totalStudyTime: StudyTimeData;
  studyStreak: StudyStreakData;
  weeklyStudyDistribution: WeeklyStudyDay[];
  quizPerformance: QuizPerformanceData;
  subjectPerformance: SubjectProgressData[];
  topicPerformance: TopicPerformanceData[];
  flashcardStats: FlashcardStatsData;
  retentionStability: RetentionStabilityData;
}

export interface WeakTopicsResponse {
  weakTopics: WeakTopicData[];
}

export interface StudySession {
  id: string;
  student_id: string;
  subject: string | null;
  topic: string | null;
  started_at: string;
  last_heartbeat_at: string;
  completed_at: string | null;
  duration_seconds: number;
  status: 'active' | 'completed' | 'abandoned';
}

export const analyticsApi = {
  /**
   * Fetch authenticated student's dashboard analytics.
   */
  async getDashboard(): Promise<DashboardResponse> {
    const res = await fetch('/api/analytics/dashboard', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch dashboard analytics.');
    }
    return res.json();
  },

  /**
   * Fetch authenticated student's detailed progress statistics.
   */
  async getProgress(): Promise<ProgressResponse> {
    const res = await fetch('/api/analytics/progress', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch progress analytics.');
    }
    return res.json();
  },

  /**
   * Fetch authenticated student's weak topics.
   */
  async getWeakTopics(): Promise<WeakTopicsResponse> {
    const res = await fetch('/api/analytics/weak-topics', {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch weak topics.');
    }
    return res.json();
  },

  /**
   * Start a new server-authoritative study session.
   */
  async startStudySession(subject?: string, topic?: string): Promise<{ session: StudySession }> {
    const res = await fetch('/api/analytics/study-sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ subject, topic }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to start study session.');
    }
    return res.json();
  },

  /**
   * Send heartbeat to keep study session active.
   */
  async heartbeatStudySession(sessionId: string): Promise<{ status: string; duration_seconds: number }> {
    const res = await fetch(`/api/analytics/study-sessions/${sessionId}/heartbeat`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to send study session heartbeat.');
    }
    return res.json();
  },

  /**
   * Complete a study session.
   */
  async completeStudySession(sessionId: string): Promise<{ session: StudySession }> {
    const res = await fetch(`/api/analytics/study-sessions/${sessionId}/complete`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to complete study session.');
    }
    return res.json();
  },
};
