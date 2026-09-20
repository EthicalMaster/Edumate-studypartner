/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getRequiredPool } from '../db/connection.js';

export interface LeaderboardEntryDTO {
  rank: number;
  displayName: string;
  totalScore: number;
  averagePercentage: number;
  quizzesCompleted: number;
  totalCorrect: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponseDTO {
  top10: LeaderboardEntryDTO[];
  currentUser: LeaderboardEntryDTO | null;
  totalParticipants: number;
}

export class LeaderboardRepository {
  /**
   * Retrieves the top 10 students and current authenticated student ranking
   * derived strictly from finalized quiz results.
   *
   * Ranking Methodology:
   * 1. Primary: Total Score Obtained (SUM of marks earned across finalized quizzes) DESC
   * 2. Tie-breaker 1: Average Accuracy Percentage (AVG percentage) DESC
   * 3. Tie-breaker 2: Total Correct Answers (SUM correct_answers) DESC
   * 4. Tie-breaker 3: Earliest Finalized Assessment Submission (MIN submitted_at) ASC
   * 5. Deterministic Tie-breaker: Stable Student Profile ID (sp.id) ASC
   */
  async getLeaderboard(authenticatedStudentId: string): Promise<LeaderboardResponseDTO> {
    const pool = getRequiredPool();

    const sql = `
      WITH ranked_cohort AS (
        SELECT
          qr.student_id,
          sp.full_name,
          COUNT(qr.id)::int AS quizzes_completed,
          COALESCE(SUM(qr.score_obtained), 0)::float AS total_score,
          COALESCE(ROUND(AVG(qr.percentage), 2), 0)::float AS average_percentage,
          COALESCE(SUM(qr.correct_answers), 0)::int AS total_correct,
          MIN(qr.submitted_at) AS first_submitted_at,
          ROW_NUMBER() OVER (
            ORDER BY
              SUM(qr.score_obtained) DESC,
              AVG(qr.percentage) DESC,
              SUM(qr.correct_answers) DESC,
              MIN(qr.submitted_at) ASC,
              sp.id ASC
          )::int AS rank
        FROM quiz_results qr
        JOIN student_profiles sp ON qr.student_id = sp.id
        GROUP BY qr.student_id, sp.full_name, sp.id
      )
      SELECT
        rank,
        student_id,
        full_name,
        total_score,
        average_percentage,
        quizzes_completed,
        total_correct
      FROM ranked_cohort
      ORDER BY rank ASC;
    `;

    const res = await pool.query(sql);
    const allRows = res.rows;
    const totalParticipants = allRows.length;

    let currentUserEntry: LeaderboardEntryDTO | null = null;
    const top10: LeaderboardEntryDTO[] = [];

    for (const row of allRows) {
      const isCurrentUser = row.student_id === authenticatedStudentId;
      const entry: LeaderboardEntryDTO = {
        rank: Number(row.rank),
        displayName: String(row.full_name || 'Anonymous Student'),
        totalScore: Math.round(Number(row.total_score) * 100) / 100,
        averagePercentage: Math.round(Number(row.average_percentage) * 100) / 100,
        quizzesCompleted: Number(row.quizzes_completed),
        totalCorrect: Number(row.total_correct),
        isCurrentUser,
      };

      if (isCurrentUser) {
        currentUserEntry = entry;
      }

      if (entry.rank <= 10) {
        top10.push(entry);
      }
    }

    return {
      top10,
      currentUser: currentUserEntry,
      totalParticipants,
    };
  }
}

export const leaderboardRepository = new LeaderboardRepository();
