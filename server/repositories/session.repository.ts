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

    const queryText = `
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
          institution: row.institution,
          department: row.department,
          current_year: row.current_year,
          student_identifier: row.student_identifier,
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
