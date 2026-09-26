/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FlashcardItem {
  id: string;
  study_kit_id: string | null;
  student_id: string;
  subject: string;
  topic: string;
  question: string;
  answer: string;
  key_concept: string | null;
  formula: string | null;
  explanation: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  mastery_state: 'learning' | 'reviewing' | 'mastered';
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_due: string;
  source_type: 'curriculum' | 'study_material' | 'custom';
  source_material_id: string | null;
  curriculum_question_id: string | null;
  tags: string[];
  last_reviewed_at: string | null;
  last_rating: number | null;
  created_at: string;
}

export interface FlashcardStatsSummary {
  totalCards: number;
  masteredCount: number;
  reviewingCount: number;
  learningCount: number;
  dueTodayCount: number;
  reviewedTodayCount: number;
  retentionScore: number;
  reviewsBreakdown: {
    again: number;
    hard: number;
    good: number;
    easy: number;
  };
}

export interface SubjectDeckSummary {
  subject: string;
  totalCards: number;
  masteredCount: number;
  learningCount: number;
  dueCount: number;
  topicCount: number;
  eligible: boolean;
  retentionIndicator?: string;
}

export interface TopicDeckSummary {
  topic: string;
  subject: string;
  totalCards: number;
  masteredCount: number;
  learningCount: number;
  dueCount: number;
}

export interface MaterialDeckSummary {
  materialId: string;
  title: string;
  subject: string;
  totalCards: number;
  masteredCount: number;
  learningCount: number;
  dueCount: number;
  createdAt: string;
}

export interface FlashcardDashboardResponse {
  success: boolean;
  dashboard: {
    stats: FlashcardStatsSummary;
    dueCards: FlashcardItem[];
    weakTopicCards: FlashcardItem[];
    recommendedDeck: FlashcardItem[];
    continueReviewCard: FlashcardItem | null;
    curriculumSubjects: SubjectDeckSummary[];
    studyMaterialDecks: MaterialDeckSummary[];
    academicContext: {
      educationLevel: string;
      academicStage: string;
      program: string;
      stream: string;
      eligibleSubjectsCount: number;
    };
  };
}

export interface ReviewResponse {
  success: boolean;
  card: FlashcardItem;
  review: {
    id: string;
    rating: number;
    reviewedAt: string;
    previousIntervalDays: number;
    newIntervalDays: number;
    previousEaseFactor: number;
    newEaseFactor: number;
  };
  adaptiveSignal: {
    subject: string;
    topic: string;
    retentionIndicator: string;
    actionTaken: string;
  };
  message: string;
}

export const flashcardApi = {
  async getDashboard(): Promise<FlashcardDashboardResponse> {
    const res = await fetch('/api/flashcards/dashboard', {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch flashcard dashboard');
    }
    return res.json();
  },

  async getFlashcards(filters: {
    subject?: string;
    topic?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    sourceType?: 'curriculum' | 'study_material' | 'custom';
    studyKitId?: string;
    materialId?: string;
    masteryState?: 'learning' | 'reviewing' | 'mastered';
    dueOnly?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ success: boolean; cards: FlashcardItem[]; total: number }> {
    const params = new URLSearchParams();
    if (filters.subject) params.append('subject', filters.subject);
    if (filters.topic) params.append('topic', filters.topic);
    if (filters.difficulty) params.append('difficulty', filters.difficulty);
    if (filters.sourceType) params.append('sourceType', filters.sourceType);
    if (filters.studyKitId) params.append('studyKitId', filters.studyKitId);
    if (filters.materialId) params.append('materialId', filters.materialId);
    if (filters.masteryState) params.append('masteryState', filters.masteryState);
    if (filters.dueOnly) params.append('dueOnly', 'true');
    if (filters.search) params.append('search', filters.search);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());

    const res = await fetch(`/api/flashcards?${params.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch flashcards');
    }
    return res.json();
  },

  async getDeck(params: {
    mode?: 'due' | 'weak' | 'recommended' | 'curriculum' | 'material' | 'all';
    subject?: string;
    topic?: string;
    materialId?: string;
    limit?: number;
  }): Promise<{ success: boolean; cards: FlashcardItem[]; total: number; mode: string }> {
    const query = new URLSearchParams();
    if (params.mode) query.append('mode', params.mode);
    if (params.subject) query.append('subject', params.subject);
    if (params.topic) query.append('topic', params.topic);
    if (params.materialId) query.append('materialId', params.materialId);
    if (params.limit) query.append('limit', params.limit.toString());

    const res = await fetch(`/api/flashcards/deck?${query.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch flashcard deck');
    }
    return res.json();
  },

  async getCurriculumSubjectTopics(subject: string): Promise<{
    success: boolean;
    subject: string;
    topics: TopicDeckSummary[];
  }> {
    const res = await fetch(`/api/flashcards/curriculum/${encodeURIComponent(subject)}`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to fetch topics for ${subject}`);
    }
    return res.json();
  },

  async submitReview(
    cardId: string,
    rating: 1 | 2 | 3 | 4,
    timeTakenMs: number = 0
  ): Promise<ReviewResponse> {
    const res = await fetch(`/api/flashcards/${cardId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, timeTakenMs }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to submit flashcard review');
    }
    return res.json();
  },

  async generateFromMaterial(materialId: string): Promise<{
    success: boolean;
    cards: FlashcardItem[];
    totalGenerated: number;
    message: string;
  }> {
    const res = await fetch(`/api/flashcards/generate-from-material/${materialId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to generate flashcards from document');
    }
    return res.json();
  },

  async createCustomCard(data: {
    subject: string;
    topic: string;
    question: string;
    answer: string;
    keyConcept?: string;
    formula?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    tags?: string[];
  }): Promise<{ success: boolean; card: FlashcardItem; message: string }> {
    const res = await fetch('/api/flashcards/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create custom flashcard');
    }
    return res.json();
  },

  async deleteCard(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/flashcards/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to delete flashcard');
    }
    return res.json();
  },
};
