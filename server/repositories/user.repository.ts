/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPool } from '../db/connection.js';
import { generateLearnerId, hashPassword } from '../utils/crypto.js';
import type { RegisterInput, UpdateProfileInput } from '../utils/validation.js';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string | null;
  role: 'STUDENT';
  is_active: boolean;
  email_verified: boolean;
  auth_provider: string;
  created_at: Date;
  updated_at: Date;
}

export interface StudentProfileRecord {
  id: string;
  user_id: string;
  full_name: string;
  education_level: string | null;
  academic_stage: string | null;
  institution: string | null;
  department: string | null;
  current_year: number | null;
  student_identifier: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SafeStudentUser {
  id: string;
  email: string;
  role: 'STUDENT';
  is_active: boolean;
  email_verified: boolean;
  auth_provider: string;
  profile: {
    id: string;
    full_name: string;
    education_level: string | null;
    academic_stage: string | null;
    institution: string | null;
    department: string | null;
    current_year: number | null;
    student_identifier: string | null;
  };
}

export class UserRepository {
  /**
   * Finds a user record along with student profile by normalized email address.
   */
  async findByEmail(email: string): Promise<{ user: UserRecord; profile: StudentProfileRecord } | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    const queryText = `
      SELECT 
        u.id as user_id,
        u.email,
        u.password_hash,
        u.role,
        u.is_active,
        u.email_verified,
        u.auth_provider,
        u.created_at as user_created_at,
        u.updated_at as user_updated_at,
        p.id as profile_id,
        p.full_name,
        p.education_level,
        p.academic_stage,
        p.institution,
        p.department,
        p.current_year,
        p.student_identifier,
        p.created_at as profile_created_at,
        p.updated_at as profile_updated_at
      FROM users u
      LEFT JOIN student_profiles p ON p.user_id = u.id
      WHERE LOWER(u.email) = LOWER($1)
      LIMIT 1;
    `;

    const res = await pool.query(queryText, [email.trim().toLowerCase()]);
    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    const user: UserRecord = {
      id: row.user_id,
      email: row.email,
      password_hash: row.password_hash,
      role: row.role,
      is_active: row.is_active,
      email_verified: Boolean(row.email_verified),
      auth_provider: row.auth_provider || 'local',
      created_at: row.user_created_at,
      updated_at: row.user_updated_at,
    };

    const profile: StudentProfileRecord = {
      id: row.profile_id,
      user_id: row.user_id,
      full_name: row.full_name,
      education_level: row.education_level || null,
      academic_stage: row.academic_stage || null,
      institution: row.institution,
      department: row.department,
      current_year: row.current_year,
      student_identifier: row.student_identifier,
      created_at: row.profile_created_at,
      updated_at: row.profile_updated_at,
    };

    return { user, profile };
  }

  /**
   * Finds a user record along with student profile by user ID.
   */
  async findById(userId: string): Promise<SafeStudentUser | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    const queryText = `
      SELECT 
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
      FROM users u
      LEFT JOIN student_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      LIMIT 1;
    `;

    const res = await pool.query(queryText, [userId]);
    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
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
    };
  }

  /**
   * Checks whether a candidate Learner ID is already taken in student_profiles.
   */
  async isLearnerIdTaken(learnerId: string, client?: any): Promise<boolean> {
    const runner = client || getPool();
    if (!runner) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }
    const res = await runner.query(
      'SELECT 1 FROM student_profiles WHERE student_identifier = $1 LIMIT 1;',
      [learnerId]
    );
    return res.rows.length > 0;
  }

  /**
   * Generates a cryptographically secure candidate Learner ID and verifies uniqueness.
   */
  async generateUniqueLearnerId(client?: any, maxAttempts = 10): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = generateLearnerId();
      const taken = await this.isLearnerIdTaken(candidate, client);
      if (!taken) {
        return candidate;
      }
    }
    throw new Error('Failed to generate a unique Learner ID after multiple attempts');
  }

  /**
   * Atomically creates both user and student profile within a single PostgreSQL transaction.
   * Generates a permanent 10-character unique Learner ID (EDU + 7 uppercase alphanumeric chars).
   * Safely handles concurrent unique-constraint collisions by retrying with fresh candidates.
   */
  async createUserWithProfile(
    input: RegisterInput,
    passwordHash?: string
  ): Promise<SafeStudentUser> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    let finalPasswordHash = passwordHash;
    if (!finalPasswordHash && input.password) {
      finalPasswordHash = await hashPassword(input.password);
    }

    const MAX_RETRIES = 5;
    let lastError: any = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const normalizedEmail = input.email.trim().toLowerCase();

        // 1. Insert user
        const userRes = await client.query<{
          id: string;
          email: string;
          role: 'STUDENT';
          is_active: boolean;
          email_verified: boolean;
          auth_provider: string;
        }>(
          `INSERT INTO users (email, password_hash, role, is_active, email_verified, auth_provider)
           VALUES ($1, $2, 'STUDENT', true, false, 'local')
           RETURNING id, email, role, is_active, email_verified, auth_provider;`,
          [normalizedEmail, finalPasswordHash]
        );
        const newUser = userRes.rows[0];

        // Resolve education level and stage, with backward compatibility for current_year
        const educationLevel = input.education_level?.trim() || (input.current_year ? 'Undergraduate / College' : null);
        let academicStage = input.academic_stage?.trim() || null;
        if (!academicStage && input.current_year) {
          const yr = input.current_year;
          academicStage = `${yr}${yr === 1 ? 'st' : yr === 2 ? 'nd' : yr === 3 ? 'rd' : 'th'} Year`;
        }

        // Compute backward-compatible current_year (1..5) if applicable
        let currentYear: number | null = input.current_year ?? null;
        if (currentYear === null && academicStage) {
          const match = academicStage.match(/^([1-5])(st|nd|rd|th)\s+Year$/i);
          if (match && (!educationLevel || educationLevel === 'Undergraduate / College')) {
            currentYear = parseInt(match[1], 10);
          }
        }

        // Generate unique candidate Learner ID
        const candidateLearnerId = await this.generateUniqueLearnerId(client);

        // 2. Insert corresponding student profile with permanent system-generated Learner ID
        const profileRes = await client.query<{
          id: string;
          full_name: string;
          education_level: string | null;
          academic_stage: string | null;
          institution: string | null;
          department: string | null;
          current_year: number | null;
          student_identifier: string;
        }>(
          `INSERT INTO student_profiles (user_id, full_name, education_level, academic_stage, institution, department, current_year, student_identifier)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, full_name, education_level, academic_stage, institution, department, current_year, student_identifier;`,
          [
            newUser.id,
            input.full_name.trim(),
            educationLevel,
            academicStage,
            input.institution ? input.institution.trim() : null,
            input.department ? input.department.trim() : null,
            currentYear,
            candidateLearnerId,
          ]
        );
        const newProfile = profileRes.rows[0];

        await client.query('COMMIT');

        return {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
          is_active: newUser.is_active,
          email_verified: Boolean(newUser.email_verified),
          auth_provider: newUser.auth_provider || 'local',
          profile: {
            id: newProfile.id,
            full_name: newProfile.full_name,
            education_level: newProfile.education_level,
            academic_stage: newProfile.academic_stage,
            institution: newProfile.institution,
            department: newProfile.department,
            current_year: newProfile.current_year,
            student_identifier: newProfile.student_identifier,
          },
        };
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});

        // If duplicate email, fail immediately
        const isEmailCollision =
          err.code === '23505' &&
          (err.constraint?.includes('email') ||
           err.detail?.includes('email') ||
           err.message?.includes('users_email_key'));

        if (isEmailCollision) {
          const error = new Error('An account with this email address already exists.');
          (error as any).code = 'DUPLICATE_EMAIL';
          throw error;
        }

        // If unique constraint collision on student_identifier, retry with a fresh candidate ID
        const isLearnerIdCollision =
          err.code === '23505' &&
          (err.constraint?.includes('student_identifier') ||
           err.constraint?.includes('learner_id') ||
           err.detail?.includes('student_identifier') ||
           err.message?.includes('student_identifier') ||
           err.message?.includes('uq_student_profiles'));

        if (isLearnerIdCollision) {
          lastError = err;
          continue;
        }

        // General 23505 fallback
        if (err.code === '23505') {
          const existingUser = await this.findByEmail(input.email);
          if (existingUser) {
            const error = new Error('An account with this email address already exists.');
            (error as any).code = 'DUPLICATE_EMAIL';
            throw error;
          }
          lastError = err;
          continue;
        }

        throw err;
      } finally {
        client.release();
      }
    }

    throw lastError || new Error('Failed to register user due to repeated identifier collisions.');
  }

  /**
   * Updates student profile fields for the authenticated student.
   * Note: The permanent Learner ID is immutable and cannot be updated.
   */
  async updateProfile(userId: string, data: UpdateProfileInput): Promise<SafeStudentUser | null> {
    const pool = getPool();
    if (!pool) {
      throw new Error('DATABASE_NOT_CONFIGURED');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.full_name !== undefined) {
      updates.push(`full_name = $${idx++}`);
      values.push(data.full_name.trim());
    }
    if (data.education_level !== undefined) {
      updates.push(`education_level = $${idx++}`);
      values.push(data.education_level ? data.education_level.trim() : null);
    }
    if (data.academic_stage !== undefined) {
      updates.push(`academic_stage = $${idx++}`);
      values.push(data.academic_stage ? data.academic_stage.trim() : null);
    }
    if (data.institution !== undefined) {
      updates.push(`institution = $${idx++}`);
      values.push(data.institution ? data.institution.trim() : null);
    }
    if (data.department !== undefined) {
      updates.push(`department = $${idx++}`);
      values.push(data.department ? data.department.trim() : null);
    }
    if (data.current_year !== undefined) {
      updates.push(`current_year = $${idx++}`);
      values.push(data.current_year);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(userId);
      const sql = `UPDATE student_profiles SET ${updates.join(', ')} WHERE user_id = $${idx};`;
      await pool.query(sql, values);
    }

    return this.findById(userId);
  }
}

export const userRepository = new UserRepository();
