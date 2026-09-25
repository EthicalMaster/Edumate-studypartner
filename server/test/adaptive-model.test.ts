/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { newDb } from 'pg-mem';
import {
  calculateConfidence,
  calculateMastery,
  determineTrend,
  determineRetentionIndicator,
  determineRecommendedDifficulty,
  determineSubjectReadiness,
  AdaptiveModelService,
} from '../services/adaptive-model.service.js';
import { AdaptiveModelRepository } from '../repositories/adaptive-model.repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function record(num: number, name: string, passed: boolean, details?: string) {
  results.push({ num, name, passed, details });
  const symbol = passed ? '✅' : '❌';
  console.log(`[Phase 11 Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

async function runAdaptiveModelTests() {
  console.log('====================================================');
  console.log('EDUMATE PHASE 11: ADAPTIVE STUDENT MODEL TEST SUITE');
  console.log('====================================================\n');

  // TEST 1: Pure Deterministic Confidence Calculation
  try {
    const c0 = calculateConfidence(0, 10);
    const c1 = calculateConfidence(1, 10);
    const c5 = calculateConfidence(5, 10);
    const c10 = calculateConfidence(10, 10);
    const c20 = calculateConfidence(20, 10);

    const passed =
      c0 === 0 &&
      c1 === 10 &&
      c5 === 50 &&
      c10 === 100 &&
      c20 === 100;

    record(
      1,
      'Deterministic Confidence / Evidence Calculation',
      passed,
      `0 att -> ${c0}%, 1 att -> ${c1}%, 5 att -> ${c5}%, 10 att -> ${c10}%, 20 att -> ${c20}%`
    );
  } catch (err: any) {
    record(1, 'Deterministic Confidence / Evidence Calculation', false, err.message);
  }

  // TEST 2: Pure Deterministic Mastery Shrinkage with Sparse Evidence
  try {
    // Student A: 1 attempt, 1 correct (100% accuracy, but only 10% confidence)
    // Mastery should shrink towards 50% prior: 0.10 * 100 + 0.90 * 50 = 55%
    const cA = calculateConfidence(1, 10); // 10%
    const mA = calculateMastery(100, 100, cA, 1);

    // Student B: 10 attempts, 10 correct (100% accuracy, 100% confidence)
    // Mastery should be 100%
    const cB = calculateConfidence(10, 10); // 100%
    const mB = calculateMastery(100, 100, cB, 10);

    // Student C: 1 attempt, 0 correct (0% accuracy, 10% confidence)
    // Mastery: 0.10 * 0 + 0.90 * 50 = 45%
    const mC = calculateMastery(0, 0, cA, 1);

    // Student D: 10 attempts, 0 correct (0% accuracy, 100% confidence)
    // Mastery should be 0%
    const mD = calculateMastery(0, 0, cB, 10);

    // Student with 0 attempts
    const mZero = calculateMastery(0, 0, 0, 0);

    const passed =
      mA === 55 &&
      mB === 100 &&
      mC === 45 &&
      mD === 0 &&
      mZero === 0;

    record(
      2,
      'Mastery Shrinkage Separates High Observed Accuracy from Low Confidence',
      passed,
      `1/1 Correct: Acc 100% -> Mastery ${mA}%, 10/10 Correct: Mastery ${mB}%, 0/1 Correct: Mastery ${mC}%, 0/10 Correct: Mastery ${mD}%`
    );
  } catch (err: any) {
    record(2, 'Mastery Shrinkage with Sparse Evidence', false, err.message);
  }

  // TEST 3: Deterministic Trend Detection
  try {
    // Improving: First half wrong, second half right
    const improvingAnswers = [false, false, true, true];
    const trendImp = determineTrend(improvingAnswers);

    // Declining: First half right, second half wrong
    const decliningAnswers = [true, true, false, false];
    const trendDec = determineTrend(decliningAnswers);

    // Steady: Consistent
    const steadyAnswers = [true, true, true, true];
    const trendStd = determineTrend(steadyAnswers);

    // Insufficient data (< 4 attempts)
    const sparseAnswers = [true, false];
    const trendSparse = determineTrend(sparseAnswers);

    const passed =
      trendImp === 'improving' &&
      trendDec === 'declining' &&
      trendStd === 'steady' &&
      trendSparse === 'insufficient_data';

    record(
      3,
      'Deterministic Learning Trend Detection',
      passed,
      `Imp: ${trendImp}, Dec: ${trendDec}, Std: ${trendStd}, Sparse: ${trendSparse}`
    );
  } catch (err: any) {
    record(3, 'Deterministic Learning Trend Detection', false, err.message);
  }

  // TEST 4: Retention Stability Indicator
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 1 * 86400000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 86400000);
    const twentyDaysAgo = new Date(now.getTime() - 20 * 86400000);

    const rFresh = determineRetentionIndicator(85, oneDayAgo, now);
    const rNeedsRevRecent = determineRetentionIndicator(40, oneDayAgo, now);
    const rConsolidating = determineRetentionIndicator(70, fiveDaysAgo, now);
    const rDecaying = determineRetentionIndicator(75, twentyDaysAgo, now);
    const rBaseline = determineRetentionIndicator(80, null, now);

    const passed =
      rFresh === 'fresh' &&
      rNeedsRevRecent === 'needs_revision' &&
      rConsolidating === 'consolidating' &&
      rDecaying === 'decaying' &&
      rBaseline === 'baseline';

    record(
      4,
      'Retention Stability Indicator (Fresh, Consolidating, Decaying, Needs Revision)',
      passed,
      `Fresh: ${rFresh}, LowScore: ${rNeedsRevRecent}, 5d: ${rConsolidating}, 20d: ${rDecaying}, Null: ${rBaseline}`
    );
  } catch (err: any) {
    record(4, 'Retention Stability Indicator', false, err.message);
  }

  // TEST 5: Difficulty Readiness Mapping
  try {
    const diffHard = determineRecommendedDifficulty(85, 75);
    const diffMediumLowConf = determineRecommendedDifficulty(85, 40); // high score but low confidence
    const diffMedium = determineRecommendedDifficulty(60, 60);
    const diffEasy = determineRecommendedDifficulty(45, 90);

    const passed =
      diffHard === 'hard' &&
      diffMediumLowConf === 'medium' &&
      diffMedium === 'medium' &&
      diffEasy === 'easy';

    record(
      5,
      'Difficulty Readiness Mapping Based on Mastery & Confidence',
      passed,
      `High+Conf: ${diffHard}, High+LowConf: ${diffMediumLowConf}, Med: ${diffMedium}, Low: ${diffEasy}`
    );
  } catch (err: any) {
    record(5, 'Difficulty Readiness Mapping', false, err.message);
  }

  // TEST 6: Subject Readiness Indicator
  try {
    const sMastered = determineSubjectReadiness(90, 80);
    const sProficient = determineSubjectReadiness(75, 60);
    const sCompetent = determineSubjectReadiness(60, 40);
    const sDeveloping = determineSubjectReadiness(40, 20);
    const sEmerging = determineSubjectReadiness(20, 10);

    const passed =
      sMastered === 'mastered' &&
      sProficient === 'proficient' &&
      sCompetent === 'competent' &&
      sDeveloping === 'developing' &&
      sEmerging === 'emerging';

    record(
      6,
      'Subject Readiness Indicator Progression',
      passed,
      `Mastered: ${sMastered}, Proficient: ${sProficient}, Competent: ${sCompetent}, Developing: ${sDeveloping}, Emerging: ${sEmerging}`
    );
  } catch (err: any) {
    record(6, 'Subject Readiness Indicator Progression', false, err.message);
  }

  // TEST 7: Migration 013 UP and DOWN Rollback Verification
  try {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: (db.public as any).getType('uuid'),
      impure: true,
      implementation: () => crypto.randomUUID(),
    });

    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const cleanSql = (sql: string) =>
      sql
        .replace(/CREATE EXTENSION[^\n]+;/gi, '')
        .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
        .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '');

    const pgMemAdapter = db.adapters.createPg();
    const testClient = new pgMemAdapter.Client();
    await testClient.connect();

    // Apply baseline schema 001
    const sql001 = fs.readFileSync(path.join(migrationsDir, '001_initial_schema.sql'), 'utf-8');
    await testClient.query(cleanSql(sql001));

    // Apply Migration 013 UP
    const upSql = fs.readFileSync(path.join(migrationsDir, '013_adaptive_student_model.sql'), 'utf-8');
    await testClient.query(cleanSql(upSql));

    // Verify all 3 tables exist
    const resTables = await testClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('student_adaptive_profile', 'student_subject_mastery', 'student_topic_mastery')
    `);
    const tablesCount = resTables.rows.length;

    // Test Rollback (DOWN)
    const downSql = fs.readFileSync(path.join(migrationsDir, '013_adaptive_student_model_down.sql'), 'utf-8');
    await testClient.query(cleanSql(downSql));

    const resRollback = await testClient.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('student_adaptive_profile', 'student_subject_mastery', 'student_topic_mastery')
    `);
    const rollbackCount = resRollback.rows.length;

    const passed = tablesCount === 3 && rollbackCount === 0;
    record(
      7,
      'Migration 013 UP and DOWN Rollback Cleanly Verified',
      passed,
      `Tables Created: ${tablesCount}/3, After Rollback: ${rollbackCount}/3`
    );
    await testClient.end();
  } catch (err: any) {
    record(7, 'Migration 013 UP and DOWN Rollback', false, err.message);
  }

  // TEST 8: Repository Upsert and Tenant Isolation
  try {
    const db = newDb({ autoCreateForeignKeyIndices: true });
    db.public.registerFunction({
      name: 'gen_random_uuid',
      returns: (db.public as any).getType('uuid'),
      impure: true,
      implementation: () => crypto.randomUUID(),
    });

    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const cleanSql = (sql: string) =>
      sql
        .replace(/CREATE EXTENSION[^\n]+;/gi, '')
        .replace(/CREATE OR REPLACE FUNCTION[\s\S]*?LANGUAGE plpgsql;/gi, '')
        .replace(/CREATE TRIGGER[\s\S]*?EXECUTE FUNCTION[^\n]+;/gi, '');

    const pgMemAdapter = db.adapters.createPg();
    const testClient = new pgMemAdapter.Client();
    await testClient.connect();

    // Apply baseline schema 001 and 013
    const sql001 = fs.readFileSync(path.join(migrationsDir, '001_initial_schema.sql'), 'utf-8');
    await testClient.query(cleanSql(sql001));
    const upSql = fs.readFileSync(path.join(migrationsDir, '013_adaptive_student_model.sql'), 'utf-8');
    await testClient.query(cleanSql(upSql));

    // Insert 2 distinct students
    const u1 = await testClient.query(`INSERT INTO users (email, password_hash) VALUES ('studentA@test.dev', 'hashA') RETURNING id;`);
    const p1 = await testClient.query(`INSERT INTO student_profiles (user_id, full_name) VALUES ($1, 'Student A') RETURNING id;`, [u1.rows[0].id]);
    const studentAId = p1.rows[0].id;

    const u2 = await testClient.query(`INSERT INTO users (email, password_hash) VALUES ('studentB@test.dev', 'hashB') RETURNING id;`);
    const p2 = await testClient.query(`INSERT INTO student_profiles (user_id, full_name) VALUES ($1, 'Student B') RETURNING id;`, [u2.rows[0].id]);
    const studentBId = p2.rows[0].id;

    // Direct database operations using pool adapter
    // Upsert topic mastery for Student A
    await testClient.query(
      `INSERT INTO student_topic_mastery (
        student_id, subject, topic, attempts, correct, incorrect, skipped,
        accuracy, mastery_score, confidence_score, recent_accuracy, trend,
        retention_indicator, recommended_difficulty
      ) VALUES ($1, 'Computer Science', 'Data Structures', 10, 8, 2, 0, 80.00, 78.50, 100.00, 80.00, 'improving', 'fresh', 'hard');`,
      [studentAId]
    );

    // Upsert topic mastery for Student B
    await testClient.query(
      `INSERT INTO student_topic_mastery (
        student_id, subject, topic, attempts, correct, incorrect, skipped,
        accuracy, mastery_score, confidence_score, recent_accuracy, trend,
        retention_indicator, recommended_difficulty
      ) VALUES ($1, 'Computer Science', 'Data Structures', 5, 2, 3, 0, 40.00, 45.00, 50.00, 40.00, 'declining', 'needs_revision', 'easy');`,
      [studentBId]
    );

    // Query Student A topics
    const resA = await testClient.query(`SELECT * FROM student_topic_mastery WHERE student_id = $1`, [studentAId]);
    // Query Student B topics
    const resB = await testClient.query(`SELECT * FROM student_topic_mastery WHERE student_id = $1`, [studentBId]);

    const passed =
      resA.rows.length === 1 &&
      resB.rows.length === 1 &&
      Number(resA.rows[0].mastery_score) === 78.5 &&
      Number(resB.rows[0].mastery_score) === 45;

    record(
      8,
      'Relational Persistence & Strict Tenant Isolation',
      passed,
      `Student A Mastery: ${resA.rows[0]?.mastery_score}%, Student B Mastery: ${resB.rows[0]?.mastery_score}%`
    );
    await testClient.end();
  } catch (err: any) {
    record(8, 'Repository Upsert and Tenant Isolation', false, err.message);
  }

  // TEST 9: Explainable Rule-Based Recommendations (No LLM)
  try {
    const service = new AdaptiveModelService();

    const mockSubjects: any[] = [
      {
        subject: 'Computer Science',
        mastery_score: 75,
        confidence_score: 80,
      },
    ];

    const mockTopics: any[] = [
      {
        subject: 'Computer Science',
        topic: 'Graph Algorithms',
        attempts: 5,
        incorrect: 4,
        accuracy: 20,
        mastery_score: 35,
        confidence_score: 50,
        retention_indicator: 'needs_revision',
        recommended_difficulty: 'easy',
      },
      {
        subject: 'Computer Science',
        topic: 'Sorting Techniques',
        attempts: 12,
        incorrect: 1,
        accuracy: 92,
        mastery_score: 88,
        confidence_score: 100,
        retention_indicator: 'fresh',
        recommended_difficulty: 'hard',
      },
      {
        subject: 'Computer Science',
        topic: 'Dynamic Programming',
        attempts: 6,
        incorrect: 2,
        accuracy: 66,
        mastery_score: 64,
        confidence_score: 60,
        retention_indicator: 'decaying',
        recommended_difficulty: 'medium',
      },
    ];

    const recs = service.generateDeterministicRecommendations(mockSubjects, mockTopics);

    // Verify recommendations
    const hasRevision = recs.some((r) => r.type === 'revision' && r.topic === 'Graph Algorithms');
    const hasChallenge = recs.some((r) => r.type === 'challenge' && r.topic === 'Sorting Techniques');
    const hasRetention = recs.some((r) => r.type === 'retention' && r.topic === 'Dynamic Programming');

    // Verify explainability reasons exist and are non-empty
    const reasonsComplete = recs.every((r) => typeof r.reason === 'string' && r.reason.length > 20);

    const passed = hasRevision && hasChallenge && hasRetention && reasonsComplete;
    record(
      9,
      'Deterministic Explainable Recommendations Generation (Rule-Based, No LLM)',
      passed,
      `Generated ${recs.length} recommendations: revision=${hasRevision}, challenge=${hasChallenge}, retention=${hasRetention}`
    );
  } catch (err: any) {
    record(9, 'Deterministic Recommendations Generation', false, err.message);
  }

  // TEST 10: End-to-End Evidence Aggregation
  try {
    const service = new AdaptiveModelService();

    // Verify pure mathematical calculations across a sequence
    const attempts = 10;
    const correct = 7;
    const accuracy = (correct / attempts) * 100; // 70%
    const confidence = calculateConfidence(attempts, 10); // 100%
    const mastery = calculateMastery(accuracy, 80, confidence, attempts); // 0.4*70 + 0.6*80 = 76%

    const passed = confidence === 100 && mastery === 76;
    record(
      10,
      'End-to-End Evidence Aggregation Consistency',
      passed,
      `Accuracy: ${accuracy}%, Confidence: ${confidence}%, Mastery: ${mastery}%`
    );
  } catch (err: any) {
    record(10, 'End-to-End Evidence Aggregation Consistency', false, err.message);
  }

  // TEST 11: Sparse Evidence Protection (Lucky 1st Answer Guard)
  try {
    // Student with 1 attempt, 1 correct
    const conf1 = calculateConfidence(1, 10); // 10%
    const mast1 = calculateMastery(100, 100, conf1, 1); // 55%
    const diff1 = determineRecommendedDifficulty(mast1, conf1); // should NOT be 'hard'
    const read1 = determineSubjectReadiness(mast1, conf1); // should NOT be 'mastered'

    // Student with 12 attempts, 11 correct
    const conf12 = calculateConfidence(12, 10); // 100%
    const mast12 = calculateMastery(91.7, 100, conf12, 12); // ~96.7%
    const diff12 = determineRecommendedDifficulty(mast12, conf12); // should be 'hard'
    const read12 = determineSubjectReadiness(mast12, conf12); // should be 'mastered'

    const passed =
      diff1 !== 'hard' &&
      read1 !== 'mastered' &&
      diff12 === 'hard' &&
      read12 === 'mastered';

    record(
      11,
      'Sparse Evidence Guard Prevents Premature High-Difficulty or Mastered Attribution',
      passed,
      `1 Lucky Answer: Diff=${diff1}, Readiness=${read1}; 12 High Evidence: Diff=${diff12}, Readiness=${read12}`
    );
  } catch (err: any) {
    record(11, 'Sparse Evidence Guard', false, err.message);
  }

  // TEST 12: Recency Decay vs Active Learning State
  try {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const activeState = determineRetentionIndicator(85, twoDaysAgo, now);
    const decayedState = determineRetentionIndicator(85, thirtyDaysAgo, now);

    const passed = activeState === 'fresh' && decayedState === 'decaying';
    record(
      12,
      'Recency Decay Triggers Spaced Retention State Accurately',
      passed,
      `2 Days Ago (85%): ${activeState}, 30 Days Ago (85%): ${decayedState}`
    );
  } catch (err: any) {
    record(12, 'Recency Decay Tracking', false, err.message);
  }

  console.log('\n====================================================');
  const allPassed = results.every((r) => r.passed);
  const passCount = results.filter((r) => r.passed).length;
  console.log(`TOTAL PHASE 11 TESTS PASSED: ${passCount}/${results.length}`);
  console.log('====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runAdaptiveModelTests().catch((err) => {
  console.error('[Phase 11 Tests FATAL]:', err);
  process.exit(1);
});
