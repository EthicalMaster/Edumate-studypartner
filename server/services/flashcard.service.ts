/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  flashcardRepository,
  type FlashcardRecord,
  type FlashcardFilters,
  type FlashcardStatsSummary,
  type SubjectDeckSummary,
  type TopicDeckSummary,
  type MaterialDeckSummary,
} from '../repositories/flashcard.repository.js';
import {
  curriculumService,
  type AcademicProfileContext,
  CurriculumIneligibleError,
} from './curriculum.service.js';
import { ALL_CURRICULUM_QUESTIONS } from '../db/seeds/curriculum/index.js';
import { adaptiveModelRepository } from '../repositories/adaptive-model.repository.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';
import { documentRepository } from '../repositories/document.repository.js';
import { materialRepository } from '../repositories/material.repository.js';
import { aiGatewayService } from './ai/gateway.service.js';
import { FlashcardBatchGenerationSchema } from './ai/schemas.js';
import { getRequiredPool } from '../db/connection.js';

export interface SM2Result {
  nextIntervalDays: number;
  nextEaseFactor: number;
  repetitions: number;
  masteryState: 'learning' | 'reviewing' | 'mastered';
  nextReviewDue: Date;
}

export interface ReviewSubmissionResult {
  card: FlashcardRecord;
  review: {
    id: string;
    rating: number;
    reviewedAt: Date;
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
}

export interface FlashcardDashboardData {
  stats: FlashcardStatsSummary;
  dueCards: FlashcardRecord[];
  weakTopicCards: FlashcardRecord[];
  recommendedDeck: FlashcardRecord[];
  continueReviewCard: FlashcardRecord | null;
  curriculumSubjects: Array<SubjectDeckSummary & { eligible: boolean; retentionIndicator?: string }>;
  studyMaterialDecks: MaterialDeckSummary[];
  academicContext: {
    educationLevel: string;
    academicStage: string;
    program: string;
    stream: string;
    eligibleSubjectsCount: number;
  };
}

export class FlashcardService {
  /**
   * SuperMemo SM-2 Spaced Repetition Algorithm.
   * Deterministic, standard cognitive retention curve calculations.
   */
  calculateSM2(
    rating: number,
    currentRepetitions: number,
    currentEaseFactor: number,
    currentIntervalDays: number,
    referenceDate: Date = new Date()
  ): SM2Result {
    // Clamp rating between 1 and 4
    const clampedRating = Math.max(1, Math.min(4, Math.round(rating)));

    let repetitions = currentRepetitions;
    let easeFactor = currentEaseFactor || 2.5;
    let intervalDays = currentIntervalDays || 0;
    let masteryState: 'learning' | 'reviewing' | 'mastered' = 'learning';

    if (clampedRating === 1) {
      // Again (Failed recall) - reset interval and repetitions
      repetitions = 0;
      intervalDays = 0;
      easeFactor = Math.max(1.3, Math.round((easeFactor - 0.2) * 100) / 100);
      masteryState = 'learning';
    } else if (clampedRating === 2) {
      // Hard (Struggled, barely recalled)
      repetitions += 1;
      intervalDays = repetitions === 1 ? 1 : Math.max(1, Math.round(intervalDays * 1.2));
      easeFactor = Math.max(1.3, Math.round((easeFactor - 0.15) * 100) / 100);
      masteryState = 'reviewing';
    } else if (clampedRating === 3) {
      // Good (Standard correct recall)
      repetitions += 1;
      if (repetitions === 1) {
        intervalDays = 1;
      } else if (repetitions === 2) {
        intervalDays = 3;
      } else {
        intervalDays = Math.max(1, Math.round(intervalDays * easeFactor));
      }
      easeFactor = Math.min(3.5, Math.round((easeFactor + 0.05) * 100) / 100);
      masteryState = repetitions >= 4 ? 'mastered' : 'reviewing';
    } else {
      // Easy (Rapid, perfect recall)
      repetitions += 1;
      if (repetitions === 1) {
        intervalDays = 2;
      } else if (repetitions === 2) {
        intervalDays = 5;
      } else {
        intervalDays = Math.max(1, Math.round(intervalDays * easeFactor * 1.3));
      }
      easeFactor = Math.min(3.5, Math.round((easeFactor + 0.15) * 100) / 100);
      masteryState = repetitions >= 3 ? 'mastered' : 'reviewing';
    }

    const nextReviewDue = new Date(referenceDate.getTime() + intervalDays * 24 * 60 * 60 * 1000);
    // If interval is 0, set next review to 10 minutes in the future for same-session re-test
    if (intervalDays === 0) {
      nextReviewDue.setTime(referenceDate.getTime() + 10 * 60 * 1000);
    }

    return {
      nextIntervalDays: intervalDays,
      nextEaseFactor: easeFactor,
      repetitions,
      masteryState,
      nextReviewDue,
    };
  }

  /**
   * Lazily seeds curriculum flashcards for the student if none exist yet for eligible subjects.
   * Derived deterministically from the 558 vetted curriculum questions.
   */
  async ensureCurriculumFlashcardsSeeded(
    studentId: string,
    profile: AcademicProfileContext
  ): Promise<number> {
    const resolved = curriculumService.resolveCurriculum(profile);
    const pool = getRequiredPool();

    // Check if student already has curriculum flashcards
    const checkRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM flashcards WHERE student_id = $1 AND source_type = 'curriculum'`,
      [studentId]
    );

    const existingCount = checkRes.rows[0]?.count || 0;
    if (existingCount >= 20) {
      return existingCount;
    }

    // Filter curriculum questions strictly by academic eligibility
    const eligibleQuestions = ALL_CURRICULUM_QUESTIONS.filter((q) => {
      if (!curriculumService.isSubjectEligible(profile, q.subject)) return false;
      if (!curriculumService.isTopicEligible(profile, q.subject, q.topic)) return false;
      return true;
    });

    if (eligibleQuestions.length === 0) {
      return 0;
    }

    // Take up to 10 questions per eligible subject/topic to create clean, diverse starter decks
    const selectedQuestions: typeof eligibleQuestions = [];
    const topicCountMap = new Map<string, number>();

    for (const q of eligibleQuestions) {
      const key = `${q.subject}:::${q.topic}`;
      const count = topicCountMap.get(key) || 0;
      if (count < 8) {
        selectedQuestions.push(q);
        topicCountMap.set(key, count + 1);
      }
    }

    // Format into flashcards
    const cardsToInsert = selectedQuestions.map((q, idx) => {
      // Extract answer text: either option text for MCQ or correct_answer_text
      let answerText = q.correct_answer_text || '';
      if (!answerText && q.options && q.options.length > 0) {
        const correctOpts = q.options.filter((opt) => q.correct_option_ids.includes(opt.id));
        if (correctOpts.length > 0) {
          answerText = correctOpts.map((o) => o.text).join('; ');
        }
      }

      if (!answerText) {
        answerText = q.explanation.split('.')[0] || 'See explanation.';
      }

      return {
        student_id: studentId,
        subject: q.subject,
        topic: q.topic,
        question: q.question_text,
        answer: answerText,
        key_concept: q.topic,
        formula: q.formula_hint || null,
        explanation: q.explanation || null,
        difficulty: q.difficulty,
        source_type: 'curriculum' as const,
        curriculum_question_id: `curr-q-${idx}-${q.subject.toLowerCase()}`,
        tags: [q.subject, q.topic, 'Curriculum'],
      };
    });

    await flashcardRepository.createFlashcardsBatch(cardsToInsert);
    return cardsToInsert.length;
  }

  /**
   * Complete flashcard dashboard aggregation.
   */
  async getDashboard(
    studentId: string,
    profile: AcademicProfileContext
  ): Promise<FlashcardDashboardData> {
    // 1. Ensure curriculum flashcards are seeded for this student's eligible curriculum
    await this.ensureCurriculumFlashcardsSeeded(studentId, profile);

    const resolved = curriculumService.resolveCurriculum(profile);
    const eligibleSubjects = resolved.eligibleSubjects;

    // 2. Fetch overall stats
    const stats = await flashcardRepository.getStats(studentId);

    // 3. Due cards for review
    const dueRes = await flashcardRepository.getFlashcards(studentId, {
      dueOnly: true,
      limit: 20,
    });
    const dueCards = dueRes.cards;

    // 4. Identify weak/decaying topics from Adaptive Student Model
    const topicMastery = await adaptiveModelRepository.getTopicMastery(studentId);
    const weakTopics = topicMastery
      .filter(
        (t) =>
          t.retention_indicator === 'decaying' ||
          t.retention_indicator === 'needs_revision' ||
          t.mastery_score < 50
      )
      .map((t) => t.topic);

    let weakTopicCards: FlashcardRecord[] = [];
    if (weakTopics.length > 0) {
      const pool = getRequiredPool();
      const res = await pool.query(
        `SELECT * FROM flashcards
         WHERE student_id = $1 AND topic = ANY($2::varchar[])
         ORDER BY next_review_due ASC, mastery_state ASC
         LIMIT 15`,
        [studentId, weakTopics]
      );
      weakTopicCards = res.rows.map((r: any) => ({
        id: r.id,
        study_kit_id: r.study_kit_id,
        student_id: r.student_id,
        subject: r.subject,
        topic: r.topic,
        question: r.question,
        answer: r.answer,
        key_concept: r.key_concept,
        formula: r.formula,
        explanation: r.explanation,
        difficulty: r.difficulty,
        mastery_state: r.mastery_state,
        ease_factor: parseFloat(r.ease_factor || '2.50'),
        interval_days: parseInt(r.interval_days || '0', 10),
        repetitions: parseInt(r.repetitions || '0', 10),
        next_review_due: new Date(r.next_review_due),
        source_type: r.source_type || 'curriculum',
        source_material_id: r.source_material_id,
        curriculum_question_id: r.curriculum_question_id,
        tags: Array.isArray(r.tags) ? r.tags : [],
        last_reviewed_at: r.last_reviewed_at ? new Date(r.last_reviewed_at) : null,
        last_rating: r.last_rating ? parseInt(r.last_rating, 10) : null,
        created_at: new Date(r.created_at),
      }));
    }

    // 5. Recommended deck: blend of due cards, weak topic cards, and general active cards
    const recommendedSet = new Set<string>();
    const recommendedDeck: FlashcardRecord[] = [];

    for (const c of dueCards) {
      if (!recommendedSet.has(c.id) && recommendedDeck.length < 15) {
        recommendedSet.add(c.id);
        recommendedDeck.push(c);
      }
    }

    for (const c of weakTopicCards) {
      if (!recommendedSet.has(c.id) && recommendedDeck.length < 15) {
        recommendedSet.add(c.id);
        recommendedDeck.push(c);
      }
    }

    // If still under 10, fill with learning/reviewing cards
    if (recommendedDeck.length < 10) {
      const moreCards = await flashcardRepository.getFlashcards(studentId, {
        limit: 15,
      });
      for (const c of moreCards.cards) {
        if (!recommendedSet.has(c.id) && recommendedDeck.length < 15) {
          recommendedSet.add(c.id);
          recommendedDeck.push(c);
        }
      }
    }

    // 6. Continue review card (last reviewed card or top due card)
    const continueReviewCard = dueCards[0] || recommendedDeck[0] || null;

    // 7. Curriculum Subjects summary (strictly eligible subjects)
    const curriculumSummaries = await flashcardRepository.getCurriculumSubjectsSummary(
      studentId,
      eligibleSubjects
    );

    // Map retention indicator from topic masteries per subject
    const subjectRetentionMap = new Map<string, string>();
    for (const tm of topicMastery) {
      if (tm.retention_indicator === 'decaying' || tm.retention_indicator === 'needs_revision') {
        subjectRetentionMap.set(tm.subject.toLowerCase(), tm.retention_indicator);
      } else if (!subjectRetentionMap.has(tm.subject.toLowerCase())) {
        subjectRetentionMap.set(tm.subject.toLowerCase(), tm.retention_indicator);
      }
    }

    const curriculumSubjects = curriculumSummaries.map((cs) => ({
      ...cs,
      eligible: true,
      retentionIndicator: subjectRetentionMap.get(cs.subject.toLowerCase()) || 'baseline',
    }));

    // 8. Study Material Decks
    const studyMaterialDecks = await flashcardRepository.getStudyMaterialDecks(studentId);

    return {
      stats,
      dueCards,
      weakTopicCards,
      recommendedDeck,
      continueReviewCard,
      curriculumSubjects,
      studyMaterialDecks,
      academicContext: {
        educationLevel: resolved.education_level,
        academicStage: resolved.academic_stage,
        program: resolved.program,
        stream: resolved.stream,
        eligibleSubjectsCount: eligibleSubjects.length,
      },
    };
  }

  /**
   * Record a review rating for a single flashcard and feed back into the Adaptive Student Model.
   */
  async submitReview(
    studentId: string,
    flashcardId: string,
    rating: number,
    timeTakenMs: number = 0
  ): Promise<ReviewSubmissionResult> {
    const card = await flashcardRepository.getFlashcardById(flashcardId, studentId);
    if (!card) {
      throw new Error(`Flashcard not found or unauthorized: ${flashcardId}`);
    }

    // 1. Calculate next interval via SM-2
    const sm2 = this.calculateSM2(
      rating,
      card.repetitions,
      card.ease_factor,
      card.interval_days
    );

    // 2. Update flashcard in database
    const updatedCard = await flashcardRepository.updateFlashcardSM2(flashcardId, studentId, {
      mastery_state: sm2.masteryState,
      ease_factor: sm2.nextEaseFactor,
      interval_days: sm2.nextIntervalDays,
      repetitions: sm2.repetitions,
      next_review_due: sm2.nextReviewDue,
      last_reviewed_at: new Date(),
      last_rating: rating,
    });

    if (!updatedCard) {
      throw new Error('Failed to update flashcard review state.');
    }

    // 3. Record historical review entry
    const reviewRecord = await flashcardRepository.recordReview({
      flashcard_id: flashcardId,
      student_id: studentId,
      rating,
      time_taken_ms: timeTakenMs,
      previous_interval_days: card.interval_days,
      new_interval_days: sm2.nextIntervalDays,
      previous_ease_factor: card.ease_factor,
      new_ease_factor: sm2.nextEaseFactor,
    });

    // 4. Log student activity for real-time analytics
    await analyticsRepository.logActivity(
      studentId,
      'flashcard_reviewed',
      0,
      {
        flashcardId,
        subject: card.subject,
        topic: card.topic,
        rating,
        masteryState: sm2.masteryState,
      }
    );

    // 5. FEEDBACK INTO ADAPTIVE STUDENT MODEL
    // Update topic retention status based on review recall outcome
    let newRetentionIndicator = 'consolidating';
    let actionTaken = 'Maintained retention';

    if (rating >= 3) {
      // Good or Easy recall
      newRetentionIndicator = sm2.masteryState === 'mastered' ? 'fresh' : 'consolidating';
      actionTaken = 'Reinforced recall stability in adaptive model';
    } else {
      // Again or Hard recall
      newRetentionIndicator = 'needs_revision';
      actionTaken = 'Flagged decaying recall for adaptive revision';
    }

    const pool = getRequiredPool();
    // Update or insert student_topic_mastery record for this subject & topic
    await pool.query(
      `INSERT INTO student_topic_mastery (
        student_id, subject, topic, attempts, correct, incorrect, skipped,
        accuracy, mastery_score, confidence_score, recent_accuracy,
        trend, last_attempted, retention_indicator, recommended_difficulty
      ) VALUES (
        $1, $2, $3, 1, $4, $5, 0,
        $6, $7, 20.00, $6,
        'steady', NOW(), $8, 'easy'
      )
      ON CONFLICT (student_id, subject, topic) DO UPDATE
      SET last_attempted = NOW(),
          retention_indicator = CASE 
            WHEN $9 >= 3 AND student_topic_mastery.retention_indicator IN ('decaying', 'needs_revision') THEN 'consolidating'
            WHEN $9 >= 3 THEN student_topic_mastery.retention_indicator
            ELSE 'needs_revision'
          END,
          updated_at = NOW()`,
      [
        studentId,
        card.subject,
        card.topic,
        rating >= 3 ? 1 : 0,
        rating < 3 ? 1 : 0,
        rating >= 3 ? 100.0 : 0.0,
        rating >= 3 ? 65.0 : 40.0,
        newRetentionIndicator,
        rating,
      ]
    );

    // Update student_adaptive_profile last_learning_activity
    await pool.query(
      `UPDATE student_adaptive_profile
       SET last_learning_activity = NOW(),
           updated_at = NOW()
       WHERE student_id = $1`,
      [studentId]
    );

    return {
      card: updatedCard,
      review: {
        id: reviewRecord.id,
        rating: reviewRecord.rating,
        reviewedAt: reviewRecord.reviewed_at,
        previousIntervalDays: reviewRecord.previous_interval_days,
        newIntervalDays: reviewRecord.new_interval_days,
        previousEaseFactor: reviewRecord.previous_ease_factor,
        newEaseFactor: reviewRecord.new_ease_factor,
      },
      adaptiveSignal: {
        subject: card.subject,
        topic: card.topic,
        retentionIndicator: newRetentionIndicator,
        actionTaken,
      },
    };
  }

  /**
   * Generate flashcards from an uploaded study material using Document Intelligence chunks.
   */
  async generateFromMaterial(
    materialId: string,
    studentId: string
  ): Promise<FlashcardRecord[]> {
    const material = await materialRepository.getMaterialById(materialId, studentId);
    if (!material) {
      throw new Error(`Study material not found or unauthorized: ${materialId}`);
    }

    const chunks = await documentRepository.getChunksByMaterial(materialId, studentId);
    if (chunks.length === 0) {
      throw new Error('Document has not been processed into chunks yet. Please process the document first.');
    }

    const title = material.title || material.original_filename || 'Study Material';
    const subject = material.subject || 'General Studies';
    const topic = material.topic || title;

    // Combine up to first 4 chunks to stay within bounded AI token limits
    const excerpt = chunks
      .slice(0, 4)
      .map((c, i) => `[Section ${i + 1}]: ${c.text.slice(0, 1000)}`)
      .join('\n\n');

    let generatedCards: Array<{
      question: string;
      answer: string;
      keyConcept: string;
      formula?: string;
      difficulty: 'easy' | 'medium' | 'hard';
    }> = [];

    try {
      const prompt = `You are AVEN's educational AI engine. Generate 5-8 targeted active-recall flashcards from the following study material text. Focus on core conceptual definitions, formulas, problem-solving rules, and distinctions.

Document Title: ${title}
Subject: ${subject}
Topic: ${topic}

Text excerpt:
${excerpt}`;

      const aiRes = await aiGatewayService.executeStructured(
        {
          studentId,
          prompt,
          purpose: 'tutoring',
          temperature: 0.3,
          maxTokens: 1200,
        },
        FlashcardBatchGenerationSchema
      );

      if (aiRes.data && aiRes.data.flashcards && aiRes.data.flashcards.length > 0) {
        generatedCards = aiRes.data.flashcards;
      }
    } catch {
      // Deterministic fallback if AI Gateway is null or rate-limited
      generatedCards = chunks.slice(0, 5).map((c, idx) => {
        const firstSentence = c.text.split('.')[0]?.trim() || `Key concept in ${title}`;
        return {
          question: `What is the core principle described in part ${idx + 1} of ${title}?`,
          answer: firstSentence.length > 20 ? firstSentence : c.text.slice(0, 180),
          keyConcept: `${topic} - Part ${idx + 1}`,
          difficulty: idx % 2 === 0 ? 'medium' : 'easy',
        };
      });
    }

    // Insert into database linked to this study material
    const cardsToInsert = generatedCards.map((c) => ({
      student_id: studentId,
      subject,
      topic,
      question: c.question,
      answer: c.answer,
      key_concept: c.keyConcept,
      formula: c.formula || null,
      difficulty: c.difficulty,
      source_type: 'study_material' as const,
      source_material_id: materialId,
      tags: [subject, topic, 'Study Material'],
    }));

    return await flashcardRepository.createFlashcardsBatch(cardsToInsert);
  }
}

export const flashcardService = new FlashcardService();
