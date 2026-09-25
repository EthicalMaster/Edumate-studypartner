/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  adaptiveModelRepository,
  type StudentAdaptiveProfileRecord,
  type StudentSubjectMasteryRecord,
  type StudentTopicMasteryRecord,
  type StudentAnswerEvidence,
} from '../repositories/adaptive-model.repository.js';
import { analyticsRepository } from '../repositories/analytics.repository.js';
import { calculateStudyStreak } from './analytics.service.js';

export interface AdaptiveRecommendation {
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

export interface CompleteStudentModelResponse {
  profile: StudentAdaptiveProfileRecord;
  subjects: StudentSubjectMasteryRecord[];
  topics: StudentTopicMasteryRecord[];
  recommendations: AdaptiveRecommendation[];
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

/**
 * Pure deterministic confidence calculation.
 * Measures statistical sufficiency of evidence.
 *
 * @param attempts Number of question attempts observed
 * @param targetEvidence Number of attempts needed for 100% confidence (default 10)
 */
export function calculateConfidence(attempts: number, targetEvidence: number = 10): number {
  if (!attempts || attempts <= 0) return 0;
  const ratio = Math.min(1.0, attempts / targetEvidence);
  return Math.round(ratio * 10000) / 100;
}

/**
 * Pure deterministic mastery calculation.
 * Incorporates observed accuracy, recent performance weighting, and Bayesian shrinkage
 * governed by evidence confidence.
 *
 * If evidence is sparse (e.g. 1 attempt), observed accuracy (even 100%) will not make the
 * student appear fully mastered, shrinking towards a neutral baseline prior (50%).
 *
 * @param observedAccuracy Overall percentage [0, 100]
 * @param recentAccuracy Recent performance percentage [0, 100]
 * @param confidence Confidence score [0, 100]
 * @param attempts Number of attempts
 */
export function calculateMastery(
  observedAccuracy: number,
  recentAccuracy: number,
  confidence: number,
  attempts: number
): number {
  if (attempts <= 0) return 0;

  // Weight recent learning if >= 4 attempts, else use raw observed
  const weightedPerformance = attempts >= 4
    ? 0.4 * observedAccuracy + 0.6 * recentAccuracy
    : observedAccuracy;

  // Shrinkage towards 50% prior based on confidence
  const cRatio = Math.max(0, Math.min(1, confidence / 100));
  const baselinePrior = 50.0;

  const shrunkMastery = cRatio * weightedPerformance + (1 - cRatio) * baselinePrior;
  return Math.max(0, Math.min(100, Math.round(shrunkMastery * 10) / 10));
}

/**
 * Pure deterministic trend calculation.
 * Compares chronological halves when >= 4 attempts exist.
 */
export function determineTrend(
  chronologicalAnswers: boolean[]
): 'improving' | 'declining' | 'steady' | 'insufficient_data' {
  if (!chronologicalAnswers || chronologicalAnswers.length < 4) {
    return 'insufficient_data';
  }

  const mid = Math.floor(chronologicalAnswers.length / 2);
  const firstHalf = chronologicalAnswers.slice(0, mid);
  const secondHalf = chronologicalAnswers.slice(mid);

  const firstAcc = (firstHalf.filter(Boolean).length / firstHalf.length) * 100;
  const secondAcc = (secondHalf.filter(Boolean).length / secondHalf.length) * 100;
  const delta = secondAcc - firstAcc;

  if (delta >= 5) return 'improving';
  if (delta <= -5) return 'declining';
  return 'steady';
}

/**
 * Pure deterministic retention indicator.
 * Evaluates mastery score and time elapsed since last assessment.
 */
export function determineRetentionIndicator(
  masteryScore: number,
  lastAttempted: Date | null,
  referenceDate: Date = new Date()
): 'fresh' | 'consolidating' | 'decaying' | 'needs_revision' | 'baseline' {
  if (!lastAttempted) return 'baseline';

  const diffMs = referenceDate.getTime() - lastAttempted.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays <= 3) {
    if (masteryScore >= 75) return 'fresh';
    if (masteryScore < 50) return 'needs_revision';
    return 'consolidating';
  }

  if (diffDays <= 14) {
    if (masteryScore < 55) return 'needs_revision';
    return 'consolidating';
  }

  // > 14 days without assessment
  if (masteryScore < 50) return 'needs_revision';
  return 'decaying';
}

/**
 * Pure deterministic difficulty recommendation.
 */
export function determineRecommendedDifficulty(
  masteryScore: number,
  confidenceScore: number
): 'easy' | 'medium' | 'hard' {
  if (masteryScore >= 75 && confidenceScore >= 60) return 'hard';
  if (masteryScore >= 50) return 'medium';
  return 'easy';
}

/**
 * Pure deterministic subject readiness indicator.
 */
export function determineSubjectReadiness(
  masteryScore: number,
  confidenceScore: number
): 'emerging' | 'developing' | 'competent' | 'proficient' | 'mastered' {
  if (masteryScore >= 85 && confidenceScore >= 70) return 'mastered';
  if (masteryScore >= 70 && confidenceScore >= 50) return 'proficient';
  if (masteryScore >= 55) return 'competent';
  if (masteryScore >= 35) return 'developing';
  return 'emerging';
}

export class AdaptiveModelService {
  /**
   * Synchronize / recalculate the complete adaptive student model from all historical evidence.
   */
  async syncStudentModel(
    studentId: string,
    referenceDate: Date = new Date()
  ): Promise<CompleteStudentModelResponse> {
    // 1. Gather all answer evidence
    const answers = await adaptiveModelRepository.getEvidenceAnswersForStudent(studentId);
    const quizStats = await adaptiveModelRepository.getStudentQuizStats(studentId);
    const totalStudySeconds = await analyticsRepository.getStudyTimeSeconds(studentId);
    const activeDates = await analyticsRepository.getDistinctActiveDates(studentId);
    const streak = calculateStudyStreak(activeDates, referenceDate);

    // 2. Group answers by topic (subject + topic)
    const topicEvidenceMap = new Map<
      string,
      {
        subject: string;
        topic: string;
        attempts: number;
        correct: number;
        incorrect: number;
        skipped: number;
        chronological: boolean[];
        lastAttempted: Date | null;
      }
    >();

    const subjectEvidenceMap = new Map<
      string,
      {
        subject: string;
        assessed: number;
        correct: number;
        incorrect: number;
        skipped: number;
        lastAssessed: Date | null;
        topicMasteries: number[];
      }
    >();

    for (const a of answers) {
      const topicKey = `${a.subject}:::${a.topic}`;
      if (!topicEvidenceMap.has(topicKey)) {
        topicEvidenceMap.set(topicKey, {
          subject: a.subject,
          topic: a.topic,
          attempts: 0,
          correct: 0,
          incorrect: 0,
          skipped: 0,
          chronological: [],
          lastAttempted: null,
        });
      }
      const t = topicEvidenceMap.get(topicKey)!;
      t.attempts++;
      if (a.isCorrect) t.correct++;
      else t.incorrect++;
      t.chronological.push(a.isCorrect);
      if (!t.lastAttempted || a.answeredAt > t.lastAttempted) {
        t.lastAttempted = a.answeredAt;
      }

      // Subject grouping
      if (!subjectEvidenceMap.has(a.subject)) {
        subjectEvidenceMap.set(a.subject, {
          subject: a.subject,
          assessed: 0,
          correct: 0,
          incorrect: 0,
          skipped: 0,
          lastAssessed: null,
          topicMasteries: [],
        });
      }
      const s = subjectEvidenceMap.get(a.subject)!;
      s.assessed++;
      if (a.isCorrect) s.correct++;
      else s.incorrect++;
      if (!s.lastAssessed || a.answeredAt > s.lastAssessed) {
        s.lastAssessed = a.answeredAt;
      }
    }

    // 3. Compute and upsert topic mastery records
    const topicRecords: StudentTopicMasteryRecord[] = [];

    for (const item of topicEvidenceMap.values()) {
      const accuracy = item.attempts > 0
        ? Math.round((item.correct / item.attempts) * 10000) / 100
        : 0;

      // Recent accuracy: last 5 attempts or second half
      let recentAccuracy = accuracy;
      if (item.chronological.length >= 4) {
        const recentSlice = item.chronological.slice(-5);
        const recentCorrect = recentSlice.filter(Boolean).length;
        recentAccuracy = Math.round((recentCorrect / recentSlice.length) * 10000) / 100;
      }

      const confidence = calculateConfidence(item.attempts, 10);
      const mastery = calculateMastery(accuracy, recentAccuracy, confidence, item.attempts);
      const trend = determineTrend(item.chronological);
      const retention = determineRetentionIndicator(mastery, item.lastAttempted, referenceDate);
      const recommendedDifficulty = determineRecommendedDifficulty(mastery, confidence);

      const record = await adaptiveModelRepository.upsertTopicMastery({
        student_id: studentId,
        subject: item.subject,
        topic: item.topic,
        attempts: item.attempts,
        correct: item.correct,
        incorrect: item.incorrect,
        skipped: item.skipped,
        accuracy,
        mastery_score: mastery,
        confidence_score: confidence,
        recent_accuracy: recentAccuracy,
        trend,
        last_attempted: item.lastAttempted,
        retention_indicator: retention,
        recommended_difficulty: recommendedDifficulty,
      });

      topicRecords.push(record);

      // Add mastery to subject for weighted subject roll-up
      const subj = subjectEvidenceMap.get(item.subject);
      if (subj) {
        subj.topicMasteries.push(mastery);
      }
    }

    // 4. Compute and upsert subject mastery records
    const subjectRecords: StudentSubjectMasteryRecord[] = [];

    for (const item of subjectEvidenceMap.values()) {
      const accuracy = item.assessed > 0
        ? Math.round((item.correct / item.assessed) * 10000) / 100
        : 0;

      // Subject confidence: target 20 assessed questions
      const confidence = calculateConfidence(item.assessed, 20);

      // Subject mastery: average of topic masteries if available, else shrinkage formula
      let subjectMastery = accuracy;
      if (item.topicMasteries.length > 0) {
        const sumTopicMastery = item.topicMasteries.reduce((a, b) => a + b, 0);
        subjectMastery = Math.round((sumTopicMastery / item.topicMasteries.length) * 10) / 10;
      } else {
        subjectMastery = calculateMastery(accuracy, accuracy, confidence, item.assessed);
      }

      // Recent subject performance from topic averages
      const matchingTopics = topicRecords.filter((t) => t.subject === item.subject);
      const recentPerf = matchingTopics.length > 0
        ? Math.round(
            (matchingTopics.reduce((acc, t) => acc + t.recent_accuracy, 0) / matchingTopics.length) * 10
          ) / 10
        : accuracy;

      // Overall subject trend
      let improvingCount = 0;
      let decliningCount = 0;
      for (const t of matchingTopics) {
        if (t.trend === 'improving') improvingCount++;
        if (t.trend === 'declining') decliningCount++;
      }
      let subjectTrend: 'improving' | 'declining' | 'steady' | 'insufficient_data' = 'insufficient_data';
      if (matchingTopics.length > 0) {
        if (improvingCount > decliningCount && improvingCount > 0) subjectTrend = 'improving';
        else if (decliningCount > improvingCount && decliningCount > 0) subjectTrend = 'declining';
        else subjectTrend = 'steady';
      }

      const readiness = determineSubjectReadiness(subjectMastery, confidence);

      const record = await adaptiveModelRepository.upsertSubjectMastery({
        student_id: studentId,
        subject: item.subject,
        assessed_question_count: item.assessed,
        correct_count: item.correct,
        incorrect_count: item.incorrect,
        skipped_count: item.skipped,
        accuracy,
        mastery_score: subjectMastery,
        confidence_score: confidence,
        recent_performance: recentPerf,
        trend: subjectTrend,
        readiness_indicator: readiness,
        last_assessed: item.lastAssessed,
      });

      subjectRecords.push(record);
    }

    // 5. Compute student-level overall aggregates
    const totalAssessed = quizStats.totalAttempted;
    const totalCorrect = quizStats.totalCorrect;
    const totalIncorrect = quizStats.totalIncorrect;
    const totalSkipped = quizStats.totalSkipped;
    const overallAccuracy = totalAssessed > 0
      ? Math.round((totalCorrect / totalAssessed) * 10000) / 100
      : 0;

    let overallMastery = 0;
    if (subjectRecords.length > 0) {
      overallMastery = Math.round(
        (subjectRecords.reduce((acc, s) => acc + s.mastery_score, 0) / subjectRecords.length) * 10
      ) / 10;
    }

    const overallConfidence = calculateConfidence(totalAssessed, 30);

    // Learning consistency based on study streak and assessment activity
    const consistencyScore = Math.min(
      100,
      Math.round(streak.currentStreak * 15 + Math.min(50, totalAssessed * 2))
    );

    const profileRecord = await adaptiveModelRepository.upsertAdaptiveProfile({
      student_id: studentId,
      overall_mastery: overallMastery,
      overall_accuracy: overallAccuracy,
      overall_confidence: overallConfidence,
      learning_consistency: consistencyScore,
      total_assessed_questions: totalAssessed,
      total_correct_answers: totalCorrect,
      total_incorrect_answers: totalIncorrect,
      total_skipped_answers: totalSkipped,
      total_quizzes_completed: quizStats.completedQuizzes,
      total_study_seconds: totalStudySeconds,
      last_learning_activity: new Date(),
      last_assessment_activity: quizStats.lastAssessmentDate,
      metadata: {
        activeStreakDays: streak.currentStreak,
        isActiveToday: streak.isActiveToday,
        distinctActiveDaysCount: activeDates.length,
      },
    });

    // 6. Generate explainable deterministic recommendations
    const recommendations = this.generateDeterministicRecommendations(
      subjectRecords,
      topicRecords
    );

    const masteredTopicsCount = topicRecords.filter((t) => t.mastery_score >= 80).length;
    const topicsNeedingRevisionCount = topicRecords.filter((t) => t.retention_indicator === 'needs_revision').length;
    const decayingTopicsCount = topicRecords.filter((t) => t.retention_indicator === 'decaying').length;

    return {
      profile: profileRecord,
      subjects: subjectRecords,
      topics: topicRecords,
      recommendations,
      summary: {
        totalAssessedQuestions: totalAssessed,
        overallAccuracy,
        overallMastery,
        overallConfidence,
        learningConsistency: consistencyScore,
        masteredTopicsCount,
        topicsNeedingRevisionCount,
        decayingTopicsCount,
      },
    };
  }

  /**
   * Incrementally record a quiz submission in the adaptive student model.
   */
  async recordQuizSubmission(
    studentId: string,
    _sessionId: string
  ): Promise<CompleteStudentModelResponse> {
    // Run full deterministic aggregation to guarantee model integrity
    return this.syncStudentModel(studentId);
  }

  /**
   * Get the current adaptive student model.
   * If no model has been computed yet, automatically synchronizes and returns it.
   */
  async getStudentModel(studentId: string): Promise<CompleteStudentModelResponse> {
    const existing = await adaptiveModelRepository.getAdaptiveProfile(studentId);
    if (!existing) {
      return this.syncStudentModel(studentId);
    }

    const [subjects, topics] = await Promise.all([
      adaptiveModelRepository.getSubjectMastery(studentId),
      adaptiveModelRepository.getTopicMastery(studentId),
    ]);

    const recommendations = this.generateDeterministicRecommendations(subjects, topics);

    const masteredTopicsCount = topics.filter((t) => t.mastery_score >= 80).length;
    const topicsNeedingRevisionCount = topics.filter((t) => t.retention_indicator === 'needs_revision').length;
    const decayingTopicsCount = topics.filter((t) => t.retention_indicator === 'decaying').length;

    return {
      profile: existing,
      subjects,
      topics,
      recommendations,
      summary: {
        totalAssessedQuestions: existing.total_assessed_questions,
        overallAccuracy: existing.overall_accuracy,
        overallMastery: existing.overall_mastery,
        overallConfidence: existing.overall_confidence,
        learningConsistency: existing.learning_consistency,
        masteredTopicsCount,
        topicsNeedingRevisionCount,
        decayingTopicsCount,
      },
    };
  }

  /**
   * Generate rule-based, deterministic, explainable recommendations.
   * STRICTLY NO LLM / NO AI.
   */
  generateDeterministicRecommendations(
    subjects: StudentSubjectMasteryRecord[],
    topics: StudentTopicMasteryRecord[]
  ): AdaptiveRecommendation[] {
    const recs: AdaptiveRecommendation[] = [];

    // Rule 1: High priority revision for topics flagged as 'needs_revision'
    for (const t of topics) {
      if (t.retention_indicator === 'needs_revision' || (t.attempts >= 3 && t.accuracy < 55)) {
        recs.push({
          id: `rec-rev-${Buffer.from(`${t.subject}-${t.topic}`).toString('base64').replace(/=/g, '').slice(0, 12)}`,
          type: 'revision',
          priority: 'high',
          subject: t.subject,
          topic: t.topic,
          title: `Reinforce Foundations: ${t.topic}`,
          description: `Targeted revision drill recommended to correct recurring conceptual gaps in ${t.topic}.`,
          recommendedDifficulty: 'easy',
          suggestedQuestionCount: 5,
          reason: `Observed accuracy is ${t.accuracy}% across ${t.attempts} attempts (${t.incorrect} incorrect). Foundational practice is proven to rebuild recall stability.`,
        });
      }
    }

    // Rule 2: Spaced review for decaying topics (> 14 days without practice)
    for (const t of topics) {
      if (t.retention_indicator === 'decaying') {
        recs.push({
          id: `rec-ret-${Buffer.from(`${t.subject}-${t.topic}`).toString('base64').replace(/=/g, '').slice(0, 12)}`,
          type: 'retention',
          priority: 'medium',
          subject: t.subject,
          topic: t.topic,
          title: `Spaced Retention Check: ${t.topic}`,
          description: `Quick active recall check to prevent forgetting curve decay for ${t.topic}.`,
          recommendedDifficulty: t.recommended_difficulty,
          suggestedQuestionCount: 5,
          reason: `No assessment activity in over 14 days. Spaced repetition solidifies long-term memory traces.`,
        });
      }
    }

    // Rule 3: Evidence building for high-accuracy low-confidence topics
    for (const t of topics) {
      if (t.accuracy >= 80 && t.confidence_score < 50 && t.attempts < 5) {
        recs.push({
          id: `rec-evi-${Buffer.from(`${t.subject}-${t.topic}`).toString('base64').replace(/=/g, '').slice(0, 12)}`,
          type: 'evidence',
          priority: 'medium',
          subject: t.subject,
          topic: t.topic,
          title: `Validate Proficiency: ${t.topic}`,
          description: `Complete additional questions in ${t.topic} to elevate your evidence confidence score.`,
          recommendedDifficulty: 'medium',
          suggestedQuestionCount: 5,
          reason: `High observed accuracy (${t.accuracy}%) with sparse evidence (${t.attempts} attempts). Additional practice confirms genuine mastery.`,
        });
      }
    }

    // Rule 4: Challenge mastered topics
    for (const t of topics) {
      if (t.mastery_score >= 80 && t.confidence_score >= 60) {
        recs.push({
          id: `rec-chl-${Buffer.from(`${t.subject}-${t.topic}`).toString('base64').replace(/=/g, '').slice(0, 12)}`,
          type: 'challenge',
          priority: 'low',
          subject: t.subject,
          topic: t.topic,
          title: `Advanced Challenge: ${t.topic}`,
          description: `Push your conceptual boundaries with hard exam-level questions in ${t.topic}.`,
          recommendedDifficulty: 'hard',
          suggestedQuestionCount: 10,
          reason: `High proven mastery score of ${t.mastery_score}% across ${t.attempts} attempts. You are ready for high-difficulty assessment.`,
        });
      }
    }

    // If no topics yet, add an exploratory recommendation
    if (recs.length === 0 && subjects.length === 0) {
      recs.push({
        id: 'rec-start-diagnostic',
        type: 'evidence',
        priority: 'high',
        subject: 'General Curriculum',
        topic: 'Baseline Diagnostic',
        title: 'Complete Your First Diagnostic Assessment',
        description: 'Take a practice quiz to establish your baseline adaptive student model and mastery profile.',
        recommendedDifficulty: 'medium',
        suggestedQuestionCount: 5,
        reason: 'Zero quiz attempts logged. An initial diagnostic provides empirical evidence to map your strengths and focus areas.',
      });
    }

    // Sort by priority (high first, then medium, then low)
    const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
    recs.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

    return recs.slice(0, 6);
  }
}

export const adaptiveModelService = new AdaptiveModelService();
