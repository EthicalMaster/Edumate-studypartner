/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AdaptiveProfileData {
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
  last_learning_activity: string | null;
  last_assessment_activity: string | null;
  metadata: {
    activeStreakDays?: number;
    isActiveToday?: boolean;
    distinctActiveDaysCount?: number;
  };
}

export interface SubjectMasteryData {
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
  last_assessed: string | null;
}

export interface TopicMasteryData {
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
  last_attempted: string | null;
  retention_indicator: 'fresh' | 'consolidating' | 'decaying' | 'needs_revision' | 'baseline';
  recommended_difficulty: 'easy' | 'medium' | 'hard';
}

export interface AdaptiveRecommendationData {
  id: string;
  type: 'revision' | 'retention' | 'evidence' | 'challenge';
  priority: 'high' | 'medium' | 'low';
  subject: string;
  topic: string;
  title: string;
  description: string;
  recommendedDifficulty: 'easy' | 'medium' | 'hard';
  suggestedQuestionCount: number;
  reason: string;
}

export interface CompleteStudentModelData {
  profile: AdaptiveProfileData;
  subjects: SubjectMasteryData[];
  topics: TopicMasteryData[];
  recommendations: AdaptiveRecommendationData[];
  summary: {
    totalAssessedQuestions: number;
    overallAccuracy: number;
    overallMastery: number;
    overallConfidence: number;
    learningConsistency: number;
    masteredTopicsCount: number;
    topicsNeedingRevisionCount: number;
    decayingTopicsCount: number;
  };
}

export const adaptiveApi = {
  /**
   * Fetch complete adaptive student model.
   */
  async getModel(): Promise<CompleteStudentModelData> {
    const res = await fetch('/api/adaptive/model', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch adaptive student model.');
    }
    return res.json();
  },

  /**
   * Fetch subject mastery records.
   */
  async getSubjects(): Promise<{ subjects: SubjectMasteryData[] }> {
    const res = await fetch('/api/adaptive/subjects', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch subject mastery.');
    }
    return res.json();
  },

  /**
   * Fetch topic mastery records, optionally filtered by subject.
   */
  async getTopics(subject?: string): Promise<{ topics: TopicMasteryData[] }> {
    const url = subject
      ? `/api/adaptive/topics?subject=${encodeURIComponent(subject)}`
      : '/api/adaptive/topics';
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch topic mastery.');
    }
    return res.json();
  },

  /**
   * Fetch explainable recommendations.
   */
  async getRecommendations(): Promise<{ recommendations: AdaptiveRecommendationData[] }> {
    const res = await fetch('/api/adaptive/recommendations', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch recommendations.');
    }
    return res.json();
  },

  /**
   * Force synchronization / recalculation from observed activity.
   */
  async sync(): Promise<{ success: boolean; model: CompleteStudentModelData }> {
    const res = await fetch('/api/adaptive/sync', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to sync adaptive student model.');
    }
    return res.json();
  },
};
