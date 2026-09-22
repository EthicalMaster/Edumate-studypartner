/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Quiz,
  SafeQuizQuestion,
  QuizSession,
  DetailedQuizResult,
  QuizHistoryItem,
  QuestionBankMeta,
  QuizQuestionType,
  QuizMode,
  LeaderboardResponse,
} from '../types';

export interface CreateQuizParams {
  title: string;
  description?: string;
  mode: QuizMode;
  source?: 'question_bank' | 'topic' | 'subject' | 'uploaded_material';
  subject: string;
  topic: string;
  question_count: number;
  time_limit_minutes: number;
  difficulty: string;
  question_types?: QuizQuestionType[];
  negative_marking: boolean;
  negative_mark_value: number;
  randomization: boolean;
  sections?: string[];
}

export interface GenerateQuizFromMaterialParams {
  material_id: string;
  title?: string;
  mode: QuizMode;
  question_count: number;
  time_limit_minutes: number;
  difficulty: string;
  topic_focus?: string;
  negative_marking: boolean;
  negative_mark_value: number;
  randomization: boolean;
}

export interface SessionStateResponse {
  session: QuizSession;
  quiz: {
    id: string;
    title: string;
    subject: string;
    topic: string;
    mode: QuizMode;
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
}

export const quizApi = {
  /**
   * Fetch all quizzes for the authenticated student.
   */
  async getQuizzes(): Promise<Quiz[]> {
    const res = await fetch('/api/quizzes', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to load quizzes');
    }
    const data = await res.json();
    return data.quizzes || [];
  },

  /**
   * Fetch subjects and metadata from question bank.
   */
  async getQuestionBankMeta(): Promise<QuestionBankMeta> {
    const res = await fetch('/api/quizzes/bank/meta', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error('Failed to load curriculum subjects and question bank metadata');
    }
    return res.json();
  },

  /**
   * Check how many questions match criteria before generation.
   */
  async countAvailableQuestions(params: {
    subject: string;
    topic?: string;
    difficulty?: string;
    question_types?: string[];
  }): Promise<number> {
    const query = new URLSearchParams();
    query.set('subject', params.subject);
    if (params.topic) query.set('topic', params.topic);
    if (params.difficulty) query.set('difficulty', params.difficulty);
    if (params.question_types && params.question_types.length > 0) {
      query.set('question_types', params.question_types.join(','));
    }

    const res = await fetch(`/api/quizzes/bank/count?${query.toString()}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.available || 0;
  },

  /**
   * Create a new Quiz using the paper builder.
   */
  async createQuiz(params: CreateQuizParams): Promise<{ quiz: Quiz; questions: SafeQuizQuestion[] }> {
    const res = await fetch('/api/quizzes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to generate quiz paper');
    }
    return res.json();
  },

  /**
   * Generate an AI quiz directly from uploaded study material.
   */
  async generateQuizFromMaterial(
    params: GenerateQuizFromMaterialParams
  ): Promise<{ quiz: Quiz; questions: SafeQuizQuestion[] }> {
    const res = await fetch('/api/quizzes/generate-from-material', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to generate quiz from study material');
    }
    return res.json();
  },

  /**
   * Start an authoritative quiz session.
   */
  async startSession(quizId: string): Promise<QuizSession> {
    const res = await fetch('/api/quiz-sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ quiz_id: quizId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to start quiz session');
    }
    const data = await res.json();
    return data.session;
  },

  /**
   * Fetch active session state (sanitized questions, timer, answers).
   */
  async getSessionState(sessionId: string): Promise<SessionStateResponse> {
    const res = await fetch(`/api/quiz-sessions/${sessionId}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch session state');
    }
    return res.json();
  },

  /**
   * Record student's answer for a question.
   */
  async saveAnswer(
    sessionId: string,
    payload: {
      question_id: string;
      selected_option_ids: string[];
      answer_text?: string | null;
      time_spent_seconds?: number;
    }
  ): Promise<void> {
    const res = await fetch(`/api/quiz-sessions/${sessionId}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to save answer');
    }
  },

  /**
   * Submit and finalize a quiz session.
   */
  async submitSession(
    sessionId: string,
    submissionReason: 'manual_submit' | 'time_expired' | 'tab_switch' | 'auto_submit' = 'manual_submit'
  ): Promise<DetailedQuizResult> {
    const res = await fetch(`/api/quiz-sessions/${sessionId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ submission_reason: submissionReason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to submit quiz');
    }
    return res.json();
  },

  /**
   * Fetch finalized results and question review.
   */
  async getResult(sessionId: string): Promise<DetailedQuizResult> {
    const res = await fetch(`/api/quiz-results/${sessionId}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to load quiz results');
    }
    return res.json();
  },

  /**
   * Fetch authenticated student's history of completed attempts.
   */
  async getHistory(): Promise<QuizHistoryItem[]> {
    const res = await fetch('/api/quiz-history', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to load quiz history');
    }
    const data = await res.json();
    return data.history || [];
  },

  /**
   * Fetch real database-backed leaderboard derived from finalized quiz results.
   */
  async getLeaderboard(): Promise<LeaderboardResponse> {
    const res = await fetch('/api/leaderboard', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to load leaderboard');
    }
    return res.json();
  },
};
