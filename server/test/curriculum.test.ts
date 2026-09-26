/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ALL_CURRICULUM_QUESTIONS,
  CURRICULUM_BY_SUBJECT,
  validateCurriculumDataset,
} from '../db/seeds/curriculum/index.js';
import { seedQuestionBank } from '../db/seeds/question_bank.seed.js';

interface TestRecord {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
}

const records: TestRecord[] = [];

function record(num: number, name: string, passed: boolean, details?: string) {
  records.push({ num, name, passed, details });
  const symbol = passed ? '✅' : '❌';
  console.log(`[Curriculum Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

async function runCurriculumTests() {
  console.log('====================================================');
  console.log('AVEN EXPANDED CURRICULUM QUESTION BANK VALIDATION');
  console.log('====================================================');

  // Test 1: Full In-Memory Schema Validation
  try {
    const valResult = validateCurriculumDataset(ALL_CURRICULUM_QUESTIONS);
    if (!valResult.valid) {
      console.error('Validation issues encountered:');
      valResult.issues.slice(0, 10).forEach((issue) => {
        console.error(`- [${issue.subject} / ${issue.topic}] (${issue.field}): ${issue.error}`);
      });
    }

    record(
      1,
      'Curriculum Schema & Constraint Validation',
      valResult.valid && valResult.issues.length === 0,
      `Checked ${valResult.totalChecked} questions. 0 issues detected.`
    );
  } catch (err: any) {
    record(1, 'Curriculum Schema Validation', false, err.message);
  }

  // Test 2: Minimum Question Volume Requirement (Target 500-800 questions)
  try {
    const count = ALL_CURRICULUM_QUESTIONS.length;
    const meetsTarget = count >= 500 && count <= 800;
    record(
      2,
      'Dataset Question Volume',
      meetsTarget,
      `Total questions: ${count} (Required target: 500 - 800)`
    );
  } catch (err: any) {
    record(2, 'Dataset Question Volume', false, err.message);
  }

  // Test 3: Subject Breadth (All 8 mandatory subjects)
  try {
    const requiredSubjects = [
      'Physics',
      'Chemistry',
      'Mathematics',
      'Biology',
      'Computer Science',
      'Data Science',
      'General Aptitude',
      'English',
    ];

    const presentSubjects = Object.keys(CURRICULUM_BY_SUBJECT);
    const missing = requiredSubjects.filter((s) => !presentSubjects.includes(s));
    const allPresent = missing.length === 0;

    const breakdown = requiredSubjects
      .map((s) => `${s}: ${CURRICULUM_BY_SUBJECT[s]?.length || 0}`)
      .join(', ');

    record(
      3,
      'Subject Breadth (All 8 Mandatory Subjects Present)',
      allPresent,
      allPresent ? breakdown : `Missing subjects: ${missing.join(', ')}`
    );
  } catch (err: any) {
    record(3, 'Subject Breadth', false, err.message);
  }

  // Test 4: Question Type Breadth (All 7 mandatory question types)
  try {
    const requiredTypes = [
      'MCQ',
      'MULTIPLE_SELECT',
      'TRUE_FALSE',
      'FILL_BLANK',
      'VERY_SHORT',
      'SHORT',
      'LONG',
    ];

    const typeCounts: Record<string, number> = {};
    for (const q of ALL_CURRICULUM_QUESTIONS) {
      typeCounts[q.question_type] = (typeCounts[q.question_type] || 0) + 1;
    }

    const missingTypes = requiredTypes.filter((t) => (typeCounts[t] || 0) === 0);
    const allTypesPresent = missingTypes.length === 0;

    const typeBreakdown = requiredTypes
      .map(
        (t) =>
          `${t}: ${typeCounts[t] || 0} (${((typeCounts[t] / ALL_CURRICULUM_QUESTIONS.length) * 100).toFixed(1)}%)`
      )
      .join(', ');

    record(
      4,
      'Question Type Distribution (All 7 Question Types Present)',
      allTypesPresent,
      allTypesPresent ? typeBreakdown : `Missing types: ${missingTypes.join(', ')}`
    );
  } catch (err: any) {
    record(4, 'Question Type Distribution', false, err.message);
  }

  // Test 5: Difficulty Distribution (Easy / Medium / Hard)
  try {
    const diffCounts: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    for (const q of ALL_CURRICULUM_QUESTIONS) {
      diffCounts[q.difficulty] = (diffCounts[q.difficulty] || 0) + 1;
    }

    const total = ALL_CURRICULUM_QUESTIONS.length;
    const easyPct = (diffCounts.easy / total) * 100;
    const medPct = (diffCounts.medium / total) * 100;
    const hardPct = (diffCounts.hard / total) * 100;

    const diffSummary = `Easy: ${diffCounts.easy} (${easyPct.toFixed(1)}%), Medium: ${diffCounts.medium} (${medPct.toFixed(1)}%), Hard: ${diffCounts.hard} (${hardPct.toFixed(1)}%)`;

    const balanced = diffCounts.easy > 0 && diffCounts.medium > 0 && diffCounts.hard > 0;
    record(
      5,
      'Difficulty Level Balance',
      balanced,
      diffSummary
    );
  } catch (err: any) {
    record(5, 'Difficulty Level Balance', false, err.message);
  }

  // Test 6: Uniqueness & Zero Duplication
  try {
    const textSet = new Set<string>();
    const duplicates: string[] = [];

    for (const q of ALL_CURRICULUM_QUESTIONS) {
      const key = `${q.subject}:::${q.topic}:::${q.question_text.trim().toLowerCase()}`;
      if (textSet.has(key)) {
        duplicates.push(key);
      }
      textSet.add(key);
    }

    record(
      6,
      'Deterministic Uniqueness (Zero Duplicate Questions)',
      duplicates.length === 0,
      duplicates.length === 0
        ? `All ${textSet.size} questions are uniquely keyed by subject/topic/text`
        : `Found ${duplicates.length} duplicate questions: ${duplicates.slice(0, 3).join('; ')}`
    );
  } catch (err: any) {
    record(6, 'Deterministic Uniqueness', false, err.message);
  }

  // Test 7: Idempotent Seeding Simulation
  try {
    // In-memory mock database table for question_bank
    const mockDb: any[] = [];

    const mockClient: any = {
      query: async (queryText: string, params?: any[]) => {
        const q = queryText.trim().toUpperCase();
        if (q.startsWith('TRUNCATE TABLE QUESTION_BANK')) {
          mockDb.length = 0;
          return { rows: [] };
        }
        if (q.startsWith('SELECT SUBJECT, TOPIC, QUESTION_TEXT FROM QUESTION_BANK')) {
          return {
            rows: mockDb.map((row) => ({
              subject: row.subject,
              topic: row.topic,
              question_text: row.question_text,
            })),
          };
        }
        if (q.startsWith('SELECT COUNT(*)::TEXT AS COUNT FROM QUESTION_BANK')) {
          return { rows: [{ count: String(mockDb.length) }] };
        }
        if (q.startsWith('INSERT INTO QUESTION_BANK')) {
          mockDb.push({
            subject: params![0],
            topic: params![1],
            difficulty: params![2],
            question_type: params![3],
            question_text: params![4],
          });
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
    };

    // First seeding pass: on empty table
    const pass1 = await seedQuestionBank(mockClient);

    // Second seeding pass: immediate re-run (should insert 0, skip all)
    const pass2 = await seedQuestionBank(mockClient);

    // Third seeding pass: with reset flag
    const pass3 = await seedQuestionBank(mockClient, { reset: true });

    const isIdempotent =
      pass1.inserted === ALL_CURRICULUM_QUESTIONS.length &&
      pass1.existing === 0 &&
      pass2.inserted === 0 &&
      pass2.existing === ALL_CURRICULUM_QUESTIONS.length &&
      pass2.total === ALL_CURRICULUM_QUESTIONS.length &&
      pass3.inserted === ALL_CURRICULUM_QUESTIONS.length &&
      pass3.total === ALL_CURRICULUM_QUESTIONS.length;

    record(
      7,
      'Seeding Idempotency Verification',
      isIdempotent,
      `Pass 1 inserted: ${pass1.inserted}, Pass 2 inserted: ${pass2.inserted} (skipped: ${pass2.existing}), Pass 3 (reset) inserted: ${pass3.inserted}`
    );
  } catch (err: any) {
    record(7, 'Seeding Idempotency Verification', false, err.message);
  }

  console.log('====================================================');
  const allPassed = records.every((r) => r.passed);
  if (allPassed) {
    console.log(`ALL ${records.length} CURRICULUM INTEGRITY TESTS PASSED SUCCESSFULLY!`);
  } else {
    console.error('SOME CURRICULUM INTEGRITY TESTS FAILED!');
    process.exit(1);
  }
}

runCurriculumTests().catch((err) => {
  console.error('Unhandled curriculum test error:', err);
  process.exit(1);
});
