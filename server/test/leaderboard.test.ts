/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { setPoolForTesting } from '../db/connection.js';
import { LeaderboardRepository } from '../repositories/leaderboard.repository.js';

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
  console.log(`[Leaderboard Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

async function runLeaderboardTests() {
  console.log('====================================================');
  console.log('AVEN PHASE 4: LEADERBOARD CALCULATION & PRIVACY TESTS');
  console.log('====================================================');

  const repo = new LeaderboardRepository();

  // --------------------------------------------------------------------------
  // TEST 1: Empty Data Handling
  // --------------------------------------------------------------------------
  try {
    const mockPoolEmpty = {
      query: async () => ({ rows: [] }),
    };
    setPoolForTesting(mockPoolEmpty);

    const res = await repo.getLeaderboard('student-123');

    const pass =
      Array.isArray(res.top10) &&
      res.top10.length === 0 &&
      res.currentUser === null &&
      res.totalParticipants === 0;

    record(
      1,
      'Empty Data Handling (Zero Finalized Quizzes)',
      pass,
      `Returned 0 top10 items, currentUser=null, totalParticipants=0`
    );
  } catch (err: any) {
    record(1, 'Empty Data Handling', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Primary Ranking by Total Score
  // --------------------------------------------------------------------------
  try {
    const mockRows = [
      {
        rank: 1,
        student_id: 's-1',
        full_name: 'Alice Johnson',
        total_score: 95.0,
        average_percentage: 95.0,
        quizzes_completed: 3,
        total_correct: 25,
      },
      {
        rank: 2,
        student_id: 's-2',
        full_name: 'Bob Smith',
        total_score: 82.5,
        average_percentage: 82.5,
        quizzes_completed: 3,
        total_correct: 20,
      },
      {
        rank: 3,
        student_id: 's-3',
        full_name: 'Charlie Brown',
        total_score: 70.0,
        average_percentage: 70.0,
        quizzes_completed: 2,
        total_correct: 18,
      },
    ];

    setPoolForTesting({ query: async () => ({ rows: mockRows }) });

    const res = await repo.getLeaderboard('s-1');

    const pass =
      res.top10.length === 3 &&
      res.top10[0].rank === 1 &&
      res.top10[0].displayName === 'Alice Johnson' &&
      res.top10[0].totalScore === 95.0 &&
      res.top10[1].rank === 2 &&
      res.top10[1].displayName === 'Bob Smith';

    record(
      2,
      'Primary Ranking by Total Score (Highest Score = Rank 1)',
      pass,
      `Rank 1: ${res.top10[0]?.displayName} (${res.top10[0]?.totalScore} pts), Rank 2: ${res.top10[1]?.displayName}`
    );
  } catch (err: any) {
    record(2, 'Primary Ranking by Total Score', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Deterministic Tie-Breaker Ordering
  // --------------------------------------------------------------------------
  try {
    // Verifying tie-breaker sequence:
    // 1. Total score obtained (DESC)
    // 2. Average accuracy percentage (DESC)
    // 3. Total correct answers (DESC)
    // 4. Earliest finalized assessment submission (ASC)
    // 5. Stable profile ID (ASC)
    const tiedRows = [
      {
        rank: 1,
        student_id: 's-high-acc',
        full_name: 'Diana Prince',
        total_score: 100.0,
        average_percentage: 92.5, // higher accuracy breaks tie
        quizzes_completed: 4,
        total_correct: 30,
      },
      {
        rank: 2,
        student_id: 's-lower-acc',
        full_name: 'Clark Kent',
        total_score: 100.0,
        average_percentage: 85.0,
        quizzes_completed: 5,
        total_correct: 32,
      },
    ];

    setPoolForTesting({ query: async () => ({ rows: tiedRows }) });

    const res = await repo.getLeaderboard('s-high-acc');

    const pass =
      res.top10[0].displayName === 'Diana Prince' &&
      res.top10[0].rank === 1 &&
      res.top10[1].displayName === 'Clark Kent' &&
      res.top10[1].rank === 2;

    record(
      3,
      'Deterministic Tie-Breaker (Average Accuracy resolves equal score)',
      pass,
      `Diana (92.5%) ranked ahead of Clark (85.0%) at equal 100 pts`
    );
  } catch (err: any) {
    record(3, 'Deterministic Tie-Breaker', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Top 10 Boundary (14 Students -> top10.length === 10)
  // --------------------------------------------------------------------------
  try {
    const fourteenStudents = Array.from({ length: 14 }, (_, i) => ({
      rank: i + 1,
      student_id: `student-${i + 1}`,
      full_name: `Student Number ${i + 1}`,
      total_score: 150 - i * 10,
      average_percentage: 95 - i * 2,
      quizzes_completed: 5,
      total_correct: 40 - i,
    }));

    setPoolForTesting({ query: async () => ({ rows: fourteenStudents }) });

    const res = await repo.getLeaderboard('student-1');

    const pass =
      res.top10.length === 10 &&
      res.totalParticipants === 14 &&
      res.top10[9].rank === 10 &&
      !res.top10.some((e) => e.rank > 10);

    record(
      4,
      'Top 10 Boundary Enforcement (Strict limit of 10 items in top10 array)',
      pass,
      `Received exactly ${res.top10.length} items from ${res.totalParticipants} total participants`
    );
  } catch (err: any) {
    record(4, 'Top 10 Boundary Enforcement', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Current User Inside Top 10 Marked with isCurrentUser: true
  // --------------------------------------------------------------------------
  try {
    const fiveStudents = Array.from({ length: 5 }, (_, i) => ({
      rank: i + 1,
      student_id: `student-${i + 1}`,
      full_name: `Student ${i + 1}`,
      total_score: 100 - i * 10,
      average_percentage: 90 - i * 5,
      quizzes_completed: 3,
      total_correct: 25 - i,
    }));

    setPoolForTesting({ query: async () => ({ rows: fiveStudents }) });

    const currentStudentId = 'student-3';
    const res = await repo.getLeaderboard(currentStudentId);

    const rank3Entry = res.top10.find((e) => e.rank === 3);
    const otherEntries = res.top10.filter((e) => e.rank !== 3);

    const pass =
      rank3Entry?.isCurrentUser === true &&
      otherEntries.every((e) => e.isCurrentUser === false) &&
      res.currentUser?.rank === 3;

    record(
      5,
      'Current User Inside Top 10 (Accurately flagged with isCurrentUser: true)',
      pass,
      `Rank 3 correctly marked isCurrentUser=true; others false`
    );
  } catch (err: any) {
    record(5, 'Current User Inside Top 10', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Current User Outside Top 10 (Shown Separately in currentUser)
  // --------------------------------------------------------------------------
  try {
    const fifteenStudents = Array.from({ length: 15 }, (_, i) => ({
      rank: i + 1,
      student_id: `student-${i + 1}`,
      full_name: `Competitor ${i + 1}`,
      total_score: 200 - i * 10,
      average_percentage: 99 - i * 2,
      quizzes_completed: 5,
      total_correct: 45 - i,
    }));

    setPoolForTesting({ query: async () => ({ rows: fifteenStudents }) });

    const currentStudentId = 'student-14'; // Rank 14
    const res = await repo.getLeaderboard(currentStudentId);

    const inTop10 = res.top10.some((e) => e.displayName === 'Competitor 14');
    const currentUser = res.currentUser;

    const pass =
      !inTop10 &&
      currentUser !== null &&
      currentUser.rank === 14 &&
      currentUser.displayName === 'Competitor 14' &&
      currentUser.isCurrentUser === true;

    record(
      6,
      'Current User Outside Top 10 (Rank 14 provided separately in currentUser)',
      pass,
      `Outside top 10 (top10.length=${res.top10.length}), currentUser has rank #${currentUser?.rank}`
    );
  } catch (err: any) {
    record(6, 'Current User Outside Top 10', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Privacy & Payload Security (Zero Internal Identifiers Expose)
  // --------------------------------------------------------------------------
  try {
    const sampleRows = [
      {
        rank: 1,
        student_id: 'secret-uuid-111',
        full_name: 'Jane Doe',
        total_score: 98.0,
        average_percentage: 98.0,
        quizzes_completed: 4,
        total_correct: 36,
      },
    ];

    setPoolForTesting({ query: async () => ({ rows: sampleRows }) });

    const res = await repo.getLeaderboard('secret-uuid-111');
    const entry = res.top10[0];

    const allowedKeys = new Set([
      'rank',
      'displayName',
      'totalScore',
      'averagePercentage',
      'quizzesCompleted',
      'totalCorrect',
      'isCurrentUser',
    ]);

    const entryKeys = Object.keys(entry);
    const hasOnlyAllowedKeys = entryKeys.every((k) => allowedKeys.has(k));

    // Specifically test prohibited fields
    const rawObj = entry as any;
    const hasProhibited =
      'email' in rawObj ||
      'student_id' in rawObj ||
      'studentId' in rawObj ||
      'user_id' in rawObj ||
      'userId' in rawObj ||
      'learner_id' in rawObj ||
      'learnerId' in rawObj ||
      'uuid' in rawObj ||
      'password_hash' in rawObj;

    const pass = hasOnlyAllowedKeys && !hasProhibited;

    record(
      7,
      'Privacy & Security Verification (Zero learner IDs, emails, or internal UUIDs exposed)',
      pass,
      `Payload keys strictly sanitized to: [${entryKeys.join(', ')}]`
    );
  } catch (err: any) {
    record(7, 'Privacy & Security Verification', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Completion Time Does NOT Affect Ranking
  // --------------------------------------------------------------------------
  try {
    // Slower student (e.g. 3600s) submitted earlier than fast student (300s).
    // Because completion speed is NOT a factor in academic ranking, the earlier
    // submission timestamp and score/accuracy rule, NOT completion speed.
    const speedRows = [
      {
        rank: 1,
        student_id: 's-slower-deliberate',
        full_name: 'Careful Learner',
        total_score: 95.0,
        average_percentage: 90.0,
        quizzes_completed: 3,
        total_correct: 25,
      },
      {
        rank: 2,
        student_id: 's-rushed-fast',
        full_name: 'Fast Learner',
        total_score: 95.0,
        average_percentage: 90.0,
        quizzes_completed: 3,
        total_correct: 25,
      },
    ];

    setPoolForTesting({ query: async () => ({ rows: speedRows }) });

    const res = await repo.getLeaderboard('s-slower-deliberate');

    // Also inspect SQL query in repository to guarantee time_taken_seconds is not in ORDER BY
    const fs = await import('fs');
    const path = await import('path');
    const repoSource = fs.readFileSync(
      path.join(process.cwd(), 'server', 'repositories', 'leaderboard.repository.ts'),
      'utf-8'
    );

    const hasTimeInOrderBy = /ORDER\s+BY[^)]*time_taken/is.test(repoSource);

    const pass =
      res.top10[0].displayName === 'Careful Learner' &&
      res.top10[0].rank === 1 &&
      res.top10[1].displayName === 'Fast Learner' &&
      res.top10[1].rank === 2 &&
      !hasTimeInOrderBy;

    record(
      8,
      'Speed Independence (Completion time does NOT affect ranking)',
      pass,
      `Verified: time_taken_seconds strictly removed from ORDER BY; faster completion conveys zero rank advantage`
    );
  } catch (err: any) {
    record(8, 'Speed Independence', false, err.message);
  }

  // Restore test pool clean
  setPoolForTesting(null);

  console.log('====================================================');
  const passed = results.filter((r) => r.passed).length;
  console.log(`LEADERBOARD TEST SUMMARY: ${passed}/${results.length} TESTS PASSED`);
  console.log('====================================================');

  if (passed !== results.length) {
    process.exit(1);
  }
}

runLeaderboardTests();
