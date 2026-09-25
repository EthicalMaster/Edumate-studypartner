/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPool } from '../db/connection.js';
import type { SafeStudentUser } from './user.repository.js';

export interface ActiveSessionContext {
  sessionId: string;
  user: SafeStudentUser;
  expiresAt: Date;
}

export class SessionRepository {
  private hasExtendedProfileCols: boolean | null = null;

  public resetColumnCacheForTesting(): void {
    this.hasExtendedProfileCols = null;
  }

  private async checkExtendedCols(runner: any): Promise<boolean> {
    if (this.hasExtendedProfileCols !== null) {
      return this.hasExtendedProfileCols;
    }
    try {
      const res = await runner.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'student_profiles' AND column_name = 'program' LIMIT 1;
      `);
      this.hasExtendedProfileCols = Boolean(res.rows && res.rows.length > 0);
    } catch {
      this.hasExtendedProfileCols = false;
    }
    return Boolean(this.hasExtendedProfileCols);
  }

  /**
   * Persists a newly generated session into PostgreSQL.
   */
  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string
  ): Promise<string> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    const queryText = `
      INSERT INTO user_sessions (user_id, session_token_hash, expires_at, user_agent, ip_address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id;
    `;

    const res = await pool.query<{ id: string }>(queryText, [
      userId,
      tokenHash,
      expiresAt,
      userAgent ?? null,
      ipAddress ?? null,
    ]);

    return res.rows[0].id;
  }

  /**
   * Resolves an active, unrevoked, unexpired session along with authenticated user identity.
   */
  async findActiveSession(tokenHash: string): Promise<ActiveSessionContext | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    const hasExt = await this.checkExtendedCols(pool);

    const queryText = hasExt
      ? `
        SELECT 
          s.id as session_id,
          s.expires_at,
          u.id as user_id,
          u.email,
          u.role,
          u.is_active,
          u.email_verified,
          u.auth_provider,
          p.id as profile_id,
          p.full_name,
          p.education_level,
          p.academic_stage,
          p.program,
          p.stream,
          p.target_exam,
          p.institution,
          p.department,
          p.current_year,
          p.student_identifier,
          COALESCE(p.has_completed_onboarding, false) as has_completed_onboarding,
          p.onboarding_completed_at
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE s.session_token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.is_active = true
        LIMIT 1;
      `
      : `
        SELECT 
          s.id as session_id,
          s.expires_at,
          u.id as user_id,
          u.email,
          u.role,
          u.is_active,
          u.email_verified,
          u.auth_provider,
          p.id as profile_id,
          p.full_name,
          p.education_level,
          p.academic_stage,
          p.institution,
          p.department,
          p.current_year,
          p.student_identifier
        FROM user_sessions s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN student_profiles p ON p.user_id = u.id
        WHERE s.session_token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.is_active = true
        LIMIT 1;
      `;

    const res = await pool.query(queryText, [tokenHash]);
    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      sessionId: row.session_id,
      expiresAt: row.expires_at,
      user: {
        id: row.user_id,
        email: row.email,
        role: row.role,
        is_active: row.is_active,
        email_verified: Boolean(row.email_verified),
        auth_provider: row.auth_provider || 'local',
        profile: {
          id: row.profile_id,
          full_name: row.full_name,
          education_level: row.education_level || null,
          academic_stage: row.academic_stage || null,
          program: row.program || null,
          stream: row.stream || null,
          target_exam: row.target_exam || null,
          institution: row.institution,
          department: row.department,
          current_year: row.current_year,
          student_identifier: row.student_identifier,
          has_completed_onboarding: Boolean(row.has_completed_onboarding),
          onboarding_completed_at: row.onboarding_completed_at ? new Date(row.onboarding_completed_at) : null,
        },
      },
    };
  }

  /**
   * Updates last_seen_at timestamp to track active session liveness.
   */
  async touchSession(sessionId: string): Promise<void> {
    const pool = getPool();
    if (!pool) return;
    try {
      await pool.query('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1;', [sessionId]);
    } catch {
      // Non-critical background telemetry update
    }
  }

  /**
   * Revokes a session immediately by setting revoked_at timestamp.
   */
  async revokeSessionByTokenHash(tokenHash: string): Promise<void> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    await pool.query(
      'UPDATE user_sessions SET revoked_at = NOW() WHERE session_token_hash = $1 AND revoked_at IS NULL;',
      [tokenHash]
    );
  }

  /**
   * Revokes all active sessions for a given user.
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    await pool.query(
      'UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL;',
      [userId]
    );
  }
}

export const sessionRepository = new SessionRepository();
