/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';

export interface FlashcardRecord {
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
  next_review_due: Date;
  source_type: 'curriculum' | 'study_material' | 'custom';
  source_material_id: string | null;
  curriculum_question_id: string | null;
  tags: string[];
  last_reviewed_at: Date | null;
  last_rating: number | null;
  created_at: Date;
}

export interface FlashcardReviewRecord {
  id: string;
  flashcard_id: string;
  student_id: string;
  rating: number;
  time_taken_ms: number;
  previous_interval_days: number;
  new_interval_days: number;
  previous_ease_factor: number;
  new_ease_factor: number;
  reviewed_at: Date;
}

export interface FlashcardFilters {
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
  createdAt: Date;
}

export class FlashcardRepository {
  private mapRow(row: any): FlashcardRecord {
    return {
      id: row.id,
      study_kit_id: row.study_kit_id,
      student_id: row.student_id,
      subject: row.subject,
      topic: row.topic,
      question: row.question,
      answer: row.answer,
      key_concept: row.key_concept,
      formula: row.formula,
      explanation: row.explanation,
      difficulty: row.difficulty,
      mastery_state: row.mastery_state,
      ease_factor: parseFloat(row.ease_factor || '2.50'),
      interval_days: parseInt(row.interval_days || '0', 10),
      repetitions: parseInt(row.repetitions || '0', 10),
      next_review_due: new Date(row.next_review_due),
      source_type: row.source_type || 'study_material',
      source_material_id: row.source_material_id,
      curriculum_question_id: row.curriculum_question_id,
      tags: Array.isArray(row.tags) ? row.tags : [],
      last_reviewed_at: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
      last_rating: row.last_rating ? parseInt(row.last_rating, 10) : null,
      created_at: new Date(row.created_at),
    };
  }

  async getFlashcards(
    studentId: string,
    filters: FlashcardFilters = {}
  ): Promise<{ cards: FlashcardRecord[]; total: number }> {
    const pool = getRequiredPool();
    const whereClauses: string[] = ['student_id = $1'];
    const params: any[] = [studentId];
    let paramIndex = 2;

    if (filters.subject) {
      whereClauses.push(`LOWER(subject) = LOWER($${paramIndex++})`);
      params.push(filters.subject.trim());
    }

    if (filters.topic && filters.topic !== 'all') {
      whereClauses.push(`LOWER(topic) = LOWER($${paramIndex++})`);
      params.push(filters.topic.trim());
    }

    if (filters.difficulty) {
      whereClauses.push(`difficulty = $${paramIndex++}`);
      params.push(filters.difficulty);
    }

    if (filters.sourceType) {
      whereClauses.push(`source_type = $${paramIndex++}`);
      params.push(filters.sourceType);
    }

    if (filters.studyKitId) {
      whereClauses.push(`study_kit_id = $${paramIndex++}`);
      params.push(filters.studyKitId);
    }

    if (filters.materialId) {
      whereClauses.push(`source_material_id = $${paramIndex++}`);
      params.push(filters.materialId);
    }

    if (filters.masteryState) {
      whereClauses.push(`mastery_state = $${paramIndex++}`);
      params.push(filters.masteryState);
    }

    if (filters.dueOnly) {
      whereClauses.push(`next_review_due <= NOW()`);
    }

    if (filters.search && filters.search.trim().length > 0) {
      whereClauses.push(
        `(LOWER(question) LIKE $${paramIndex} OR LOWER(answer) LIKE $${paramIndex} OR LOWER(key_concept) LIKE $${paramIndex} OR LOWER(topic) LIKE $${paramIndex})`
      );
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      paramIndex++;
    }

    const whereStr = whereClauses.join(' AND ');

    // Count query
    const countRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM flashcards WHERE ${whereStr}`,
      params
    );
    const total = countRes.rows[0]?.count || 0;

    // Data query with ordering
    let orderClause = 'ORDER BY next_review_due ASC, created_at DESC';
    let limitClause = '';

    if (filters.limit && filters.limit > 0) {
      limitClause += ` LIMIT ${filters.limit}`;
      if (filters.offset && filters.offset > 0) {
        limitClause += ` OFFSET ${filters.offset}`;
      }
    }

    const dataRes = await pool.query(
      `SELECT * FROM flashcards WHERE ${whereStr} ${orderClause} ${limitClause}`,
      params
    );

    return {
      cards: dataRes.rows.map((r) => this.mapRow(r)),
      total,
    };
  }

  async getFlashcardById(id: string, studentId: string): Promise<FlashcardRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT * FROM flashcards WHERE id = $1 AND student_id = $2`,
      [id, studentId]
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async createFlashcard(data: {
    student_id: string;
    subject: string;
    topic: string;
    question: string;
    answer: string;
    key_concept?: string | null;
    formula?: string | null;
    explanation?: string | null;
    difficulty?: 'easy' | 'medium' | 'hard';
    source_type?: 'curriculum' | 'study_material' | 'custom';
    study_kit_id?: string | null;
    source_material_id?: string | null;
    curriculum_question_id?: string | null;
    tags?: string[];
  }): Promise<FlashcardRecord> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `INSERT INTO flashcards (
        student_id, subject, topic, question, answer, key_concept, formula,
        explanation, difficulty, source_type, study_kit_id, source_material_id,
        curriculum_question_id, tags, mastery_state, ease_factor, interval_days,
        repetitions, next_review_due
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, $14, 'learning', 2.50, 0,
        0, NOW()
      ) RETURNING *`,
      [
        data.student_id,
        data.subject,
        data.topic,
        data.question,
        data.answer,
        data.key_concept || null,
        data.formula || null,
        data.explanation || null,
        data.difficulty || 'medium',
        data.source_type || 'custom',
        data.study_kit_id || null,
        data.source_material_id || null,
        data.curriculum_question_id || null,
        data.tags || [],
      ]
    );

    return this.mapRow(res.rows[0]);
  }

  async createFlashcardsBatch(
    cards: Array<{
      student_id: string;
      subject: string;
      topic: string;
      question: string;
      answer: string;
      key_concept?: string | null;
      formula?: string | null;
      explanation?: string | null;
      difficulty?: 'easy' | 'medium' | 'hard';
      source_type?: 'curriculum' | 'study_material' | 'custom';
      study_kit_id?: string | null;
      source_material_id?: string | null;
      curriculum_question_id?: string | null;
      tags?: string[];
    }>
  ): Promise<FlashcardRecord[]> {
    if (cards.length === 0) return [];
    const pool = getRequiredPool();

    const created: FlashcardRecord[] = [];
    for (const card of cards) {
      const res = await this.createFlashcard(card);
      created.push(res);
    }
    return created;
  }

  async updateFlashcardSM2(
    id: string,
    studentId: string,
    updates: {
      mastery_state: 'learning' | 'reviewing' | 'mastered';
      ease_factor: number;
      interval_days: number;
      repetitions: number;
      next_review_due: Date;
      last_reviewed_at: Date;
      last_rating: number;
    }
  ): Promise<FlashcardRecord | null> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `UPDATE flashcards
       SET mastery_state = $1,
           ease_factor = $2,
           interval_days = $3,
           repetitions = $4,
           next_review_due = $5,
           last_reviewed_at = $6,
           last_rating = $7
       WHERE id = $8 AND student_id = $9
       RETURNING *`,
      [
        updates.mastery_state,
        updates.ease_factor,
        updates.interval_days,
        updates.repetitions,
        updates.next_review_due,
        updates.last_reviewed_at,
        updates.last_rating,
        id,
        studentId,
      ]
    );

    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  async recordReview(data: {
    flashcard_id: string;
    student_id: string;
    rating: number;
    time_taken_ms?: number;
    previous_interval_days?: number;
    new_interval_days?: number;
    previous_ease_factor?: number;
    new_ease_factor?: number;
  }): Promise<FlashcardReviewRecord> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `INSERT INTO flashcard_reviews (
        flashcard_id, student_id, rating, time_taken_ms,
        previous_interval_days, new_interval_days,
        previous_ease_factor, new_ease_factor, reviewed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *`,
      [
        data.flashcard_id,
        data.student_id,
        data.rating,
        data.time_taken_ms || 0,
        data.previous_interval_days || 0,
        data.new_interval_days || 0,
        data.previous_ease_factor || 2.5,
        data.new_ease_factor || 2.5,
      ]
    );

    const r = res.rows[0];
    return {
      id: r.id,
      flashcard_id: r.flashcard_id,
      student_id: r.student_id,
      rating: r.rating,
      time_taken_ms: r.time_taken_ms,
      previous_interval_days: r.previous_interval_days,
      new_interval_days: r.new_interval_days,
      previous_ease_factor: parseFloat(r.previous_ease_factor),
      new_ease_factor: parseFloat(r.new_ease_factor),
      reviewed_at: new Date(r.reviewed_at),
    };
  }

  async getStats(studentId: string): Promise<FlashcardStatsSummary> {
    const pool = getRequiredPool();

    // Flashcard status counts
    const cardsRes = await pool.query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(CASE WHEN mastery_state = 'mastered' THEN 1 END)::int as mastered,
        COUNT(CASE WHEN mastery_state = 'reviewing' THEN 1 END)::int as reviewing,
        COUNT(CASE WHEN mastery_state = 'learning' THEN 1 END)::int as learning,
        COUNT(CASE WHEN next_review_due <= NOW() THEN 1 END)::int as due
       FROM flashcards
       WHERE student_id = $1`,
      [studentId]
    );

    const row = cardsRes.rows[0] || {};
    const totalCards = row.total || 0;
    const masteredCount = row.mastered || 0;
    const reviewingCount = row.reviewing || 0;
    const learningCount = row.learning || 0;
    const dueTodayCount = row.due || 0;

    // Reviews today & ratings breakdown
    const reviewsRes = await pool.query(
      `SELECT
        COUNT(CASE WHEN reviewed_at >= CURRENT_DATE THEN 1 END)::int as reviewed_today,
        COUNT(CASE WHEN rating = 1 THEN 1 END)::int as again_cnt,
        COUNT(CASE WHEN rating = 2 THEN 1 END)::int as hard_cnt,
        COUNT(CASE WHEN rating = 3 THEN 1 END)::int as good_cnt,
        COUNT(CASE WHEN rating = 4 THEN 1 END)::int as easy_cnt,
        COUNT(*)::int as total_reviews
       FROM flashcard_reviews
       WHERE student_id = $1`,
      [studentId]
    );

    const revRow = reviewsRes.rows[0] || {};
    const reviewedTodayCount = revRow.reviewed_today || 0;
    const again = revRow.again_cnt || 0;
    const hard = revRow.hard_cnt || 0;
    const good = revRow.good_cnt || 0;
    const easy = revRow.easy_cnt || 0;
    const totalReviews = revRow.total_reviews || 0;

    // Retention score: weighted combination of mastery ratio and review accuracy
    let retentionScore = 0;
    if (totalCards > 0) {
      const masteryRatio = (masteredCount * 1.0 + reviewingCount * 0.6) / totalCards;
      const reviewAccuracy = totalReviews > 0 ? (good * 1.0 + easy * 1.0 + hard * 0.5) / totalReviews : 0.7;
      retentionScore = Math.round((masteryRatio * 0.5 + reviewAccuracy * 0.5) * 100);
      retentionScore = Math.min(100, Math.max(0, retentionScore));
    }

    return {
      totalCards,
      masteredCount,
      reviewingCount,
      learningCount,
      dueTodayCount,
      reviewedTodayCount,
      retentionScore,
      reviewsBreakdown: { again, hard, good, easy },
    };
  }

  async getCurriculumSubjectsSummary(
    studentId: string,
    eligibleSubjects: string[]
  ): Promise<SubjectDeckSummary[]> {
    if (eligibleSubjects.length === 0) return [];
    const pool = getRequiredPool();

    const res = await pool.query(
      `SELECT
        subject,
        COUNT(*)::int as total_cards,
        COUNT(CASE WHEN mastery_state = 'mastered' THEN 1 END)::int as mastered_count,
        COUNT(CASE WHEN mastery_state = 'learning' THEN 1 END)::int as learning_count,
        COUNT(CASE WHEN next_review_due <= NOW() THEN 1 END)::int as due_count,
        COUNT(DISTINCT topic)::int as topic_count
       FROM flashcards
       WHERE student_id = $1 AND source_type = 'curriculum' AND subject = ANY($2::varchar[])
       GROUP BY subject
       ORDER BY subject ASC`,
      [studentId, eligibleSubjects]
    );

    const map = new Map<string, any>();
    for (const r of res.rows) {
      map.set(r.subject.toLowerCase(), r);
    }

    return eligibleSubjects.map((sub) => {
      const found = map.get(sub.toLowerCase());
      return {
        subject: sub,
        totalCards: found ? found.total_cards : 0,
        masteredCount: found ? found.mastered_count : 0,
        learningCount: found ? found.learning_count : 0,
        dueCount: found ? found.due_count : 0,
        topicCount: found ? found.topic_count : 0,
      };
    });
  }

  async getCurriculumTopicsSummary(
    studentId: string,
    subject: string
  ): Promise<TopicDeckSummary[]> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `SELECT
        topic,
        subject,
        COUNT(*)::int as total_cards,
        COUNT(CASE WHEN mastery_state = 'mastered' THEN 1 END)::int as mastered_count,
        COUNT(CASE WHEN mastery_state = 'learning' THEN 1 END)::int as learning_count,
        COUNT(CASE WHEN next_review_due <= NOW() THEN 1 END)::int as due_count
       FROM flashcards
       WHERE student_id = $1 AND source_type = 'curriculum' AND LOWER(subject) = LOWER($2)
       GROUP BY topic, subject
       ORDER BY topic ASC`,
      [studentId, subject]
    );

    return res.rows.map((r) => ({
      topic: r.topic,
      subject: r.subject,
      totalCards: r.total_cards,
      masteredCount: r.mastered_count,
      learningCount: r.learning_count,
      dueCount: r.due_count,
    }));
  }

  async getStudyMaterialDecks(studentId: string): Promise<MaterialDeckSummary[]> {
    const pool = getRequiredPool();

    // Query study materials along with associated flashcard counts
    const res = await pool.query(
      `SELECT
        sm.id as material_id,
        COALESCE(sm.title, sm.filename, 'Untitled Material') as title,
        sm.subject,
        sm.created_at,
        COUNT(fc.id)::int as total_cards,
        COUNT(CASE WHEN fc.mastery_state = 'mastered' THEN 1 END)::int as mastered_count,
        COUNT(CASE WHEN fc.mastery_state = 'learning' THEN 1 END)::int as learning_count,
        COUNT(CASE WHEN fc.next_review_due <= NOW() THEN 1 END)::int as due_count
       FROM study_materials sm
       LEFT JOIN flashcards fc ON (fc.source_material_id = sm.id OR fc.study_kit_id = sm.id) AND fc.student_id = sm.student_id
       WHERE sm.student_id = $1
       GROUP BY sm.id, sm.title, sm.filename, sm.subject, sm.created_at
       ORDER BY sm.created_at DESC`,
      [studentId]
    );

    return res.rows.map((r) => ({
      materialId: r.material_id,
      title: r.title,
      subject: r.subject,
      totalCards: r.total_cards,
      masteredCount: r.mastered_count,
      learningCount: r.learning_count,
      dueCount: r.due_count,
      createdAt: new Date(r.created_at),
    }));
  }

  async deleteFlashcard(id: string, studentId: string): Promise<boolean> {
    const pool = getRequiredPool();
    const res = await pool.query(
      `DELETE FROM flashcards WHERE id = $1 AND student_id = $2 RETURNING id`,
      [id, studentId]
    );
    return res.rows.length > 0;
  }
}

export const flashcardRepository = new FlashcardRepository();
