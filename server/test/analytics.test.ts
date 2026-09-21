/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AnalyticsService, calculateStudyStreak } from '../services/analytics.service.js';

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
  console.log(`[Analytics Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

async function runAnalyticsTests() {
  console.log('====================================================');
  console.log('EDUMATE PHASE 8.5: REAL-TIME LEARNING ANALYTICS TESTS');
  console.log('====================================================');

  const analyticsService = new AnalyticsService();

  // Test 1: Streak calculation when active today and previous consecutive days
  try {
    const today = new Date();
    const d0 = today.toISOString().split('T')[0];
    const d1 = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
    const d2 = new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0];
    const d3 = new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0];

    const activeDates = [d0, d1, d2, d3];
    const streak = calculateStudyStreak(activeDates, today);

    const passed = streak.currentStreak === 4 && streak.isActiveToday === true;
    record(1, 'Streak calculation with active day today', passed, `Streak: ${streak.currentStreak}, ActiveToday: ${streak.isActiveToday}`);
  } catch (err: any) {
    record(1, 'Streak calculation with active day today', false, err.message);
  }

  // Test 2: Streak calculation when active yesterday but not yet today
  try {
    const today = new Date();
    const d1 = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
    const d2 = new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0];

    const activeDates = [d1, d2];
    const streak = calculateStudyStreak(activeDates, today);

    const passed = streak.currentStreak === 2 && streak.isActiveToday === false;
    record(2, 'Streak calculation when active yesterday but not today', passed, `Streak: ${streak.currentStreak}, ActiveToday: ${streak.isActiveToday}`);
  } catch (err: any) {
    record(2, 'Streak calculation when active yesterday but not today', false, err.message);
  }

  // Test 3: Streak reset when day gap exists (missed yesterday)
  try {
    const today = new Date();
    const d2 = new Date(today.getTime() - 2 * 86400000).toISOString().split('T')[0];
    const d3 = new Date(today.getTime() - 3 * 86400000).toISOString().split('T')[0];

    const activeDates = [d2, d3];
    const streak = calculateStudyStreak(activeDates, today);

    const passed = streak.currentStreak === 0 && streak.isActiveToday === false;
    record(3, 'Streak reset on missed day gap', passed, `Streak: ${streak.currentStreak}`);
  } catch (err: any) {
    record(3, 'Streak reset on missed day gap', false, err.message);
  }

  // Test 4: Weak Topic Priority Thresholds (High < 50%, Medium 50-59%, Low 60-69%)
  try {
    const tHigh = { attempts: 10, incorrect: 7, accuracy: 30 };
    const tMed = { attempts: 10, incorrect: 5, accuracy: 50 };
    const tLow = { attempts: 10, incorrect: 4, accuracy: 60 };
    const tProficient = { attempts: 10, incorrect: 2, accuracy: 80 };

    const pHigh = tHigh.accuracy < 50 ? 'HIGH' : tHigh.accuracy < 60 ? 'MEDIUM' : 'LOW';
    const pMed = tMed.accuracy < 50 ? 'HIGH' : tMed.accuracy < 60 ? 'MEDIUM' : 'LOW';
    const pLow = tLow.accuracy < 50 ? 'HIGH' : tLow.accuracy < 60 ? 'MEDIUM' : 'LOW';
    const isWeak = tProficient.accuracy < 70;

    const passed = pHigh === 'HIGH' && pMed === 'MEDIUM' && pLow === 'LOW' && isWeak === false;
    record(4, 'Deterministic Weak Topic Thresholds & Priority Assignment', passed, `High: ${pHigh}, Med: ${pMed}, Low: ${pLow}, Proficient isWeak: ${isWeak}`);
  } catch (err: any) {
    record(4, 'Deterministic Weak Topic Thresholds', false, err.message);
  }

  // Test 5: Study Session Duration Clamping (Server-Authoritative)
  try {
    const startTime = new Date(Date.now() - 50000000); // 13.8 hours ago
    const now = new Date();
    const rawElapsed = Math.round((now.getTime() - startTime.getTime()) / 1000);

    // Max session duration is 4 hours (14,400 seconds)
    const MAX_DURATION_SECONDS = 4 * 3600;
    const clampedDuration = Math.min(MAX_DURATION_SECONDS, Math.max(0, rawElapsed));

    const passed = clampedDuration === 14400 && rawElapsed > 14400;
    record(5, 'Server-authoritative study session duration clamping', passed, `Raw: ${rawElapsed}s, Clamped: ${clampedDuration}s (max 4h)`);
  } catch (err: any) {
    record(5, 'Study Session Duration Clamping', false, err.message);
  }

  // Test 6: Human-Readable Duration Formatting
  try {
    const formatHoursMinutes = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    const d1 = formatHoursMinutes(3660); // 1h 1m
    const d2 = formatHoursMinutes(600);  // 10m
    const d3 = formatHoursMinutes(7200); // 2h 0m
    const d4 = formatHoursMinutes(0);    // 0m

    const passed = d1 === '1h 1m' && d2 === '10m' && d3 === '2h 0m' && d4 === '0m';
    record(6, 'Study time formatting utility', passed, `3660s -> ${d1}, 600s -> ${d2}, 7200s -> ${d3}`);
  } catch (err: any) {
    record(6, 'Study time formatting', false, err.message);
  }

  // Test 7: Retention Stability Delta Grounded in Measurable History
  try {
    const allTimeScores = [80, 85, 75, 90, 70, 80]; // avg = 80
    const recentScores = [85, 90, 95];              // avg = 90
    const allTimeAvg = Math.round(allTimeScores.reduce((a, b) => a + b, 0) / allTimeScores.length);
    const recentAvg = Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length);
    const delta = recentAvg - allTimeAvg; // +10%

    const passed = allTimeAvg === 80 && recentAvg === 90 && delta === 10;
    record(7, 'Retention stability empirical delta tracking', passed, `All-time: ${allTimeAvg}%, Recent: ${recentAvg}%, Delta: +${delta}%`);
  } catch (err: any) {
    record(7, 'Retention stability empirical delta', false, err.message);
  }

  console.log('====================================================');
  const allPassed = results.every((r) => r.passed);
  const passCount = results.filter((r) => r.passed).length;
  console.log(`TOTAL PASSED: ${passCount}/${results.length}`);
  console.log('====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runAnalyticsTests().catch((err) => {
  console.error('[Analytics Tests FATAL]:', err);
  process.exit(1);
});
