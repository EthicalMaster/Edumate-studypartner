/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { userRepository, type SafeStudentUser } from '../repositories/user.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
} from '../utils/crypto.js';
import {
  normalizeEmail,
  isValidEmail,
  type RegisterInput,
  type LoginInput,
  type UpdateProfileInput,
} from '../utils/validation.js';

export const SESSION_EXPIRY_DAYS = 7;
export const SESSION_COOKIE_NAME = 'edumate_session';

export class AuthenticationError extends Error {
  constructor(message = 'Invalid email or password') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class DuplicateEmailError extends Error {
  constructor(message = 'An account with this email address already exists') {
    super(message);
    this.name = 'DuplicateEmailError';
  }
}

export class InvalidEmailError extends Error {
  constructor(message = 'Please provide a valid practical email address (e.g. student@university.edu)') {
    super(message);
    this.name = 'InvalidEmailError';
  }
}

export interface AuthResult {
  sessionToken: string;
  expiresAt: Date;
  user: SafeStudentUser;
}

export class AuthService {
  /**
   * Registers a new student, hashes password with Argon2id, creates database records within
   * an atomic transaction, and provisions an authenticated session.
   */
  async register(
    input: RegisterInput,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthResult> {
    const normalizedEmail = normalizeEmail(input.email);

    if (!isValidEmail(normalizedEmail)) {
      throw new InvalidEmailError();
    }

    input.email = normalizedEmail;

    // 1. Check if email is already taken
    const existing = await userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new DuplicateEmailError();
    }

    // 2. Hash password with Argon2id
    const passwordHash = await hashPassword(input.password);

    // 3. Atomically create user and student profile
    const safeUser = await userRepository.createUserWithProfile(input, passwordHash);

    // 4. Provision secure session
    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.createSession(
      safeUser.id,
      tokenHash,
      expiresAt,
      meta?.userAgent,
      meta?.ipAddress
    );

    return {
      sessionToken,
      expiresAt,
      user: safeUser,
    };
  }

  /**
   * Authenticates student credentials and issues a new session.
   * Emits generic authentication errors to prevent account enumeration.
   */
  async login(
    input: LoginInput,
    meta?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthResult> {
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Find user by email
    const record = await userRepository.findByEmail(normalizedEmail);
    if (!record) {
      // Intentionally generic error to prevent email enumeration
      throw new AuthenticationError();
    }

    const { user, profile } = record;

    // 2. Verify Argon2id password hash (if account has password set)
    if (!user.password_hash) {
      throw new AuthenticationError('Please sign in using your designated authentication method');
    }

    const isValid = await verifyPassword(user.password_hash, input.password);
    if (!isValid) {
      throw new AuthenticationError();
    }

    // 3. Verify account active status
    if (!user.is_active) {
      throw new AuthenticationError();
    }

    // 4. Generate opaque session token & hash
    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.createSession(
      user.id,
      tokenHash,
      expiresAt,
      meta?.userAgent,
      meta?.ipAddress
    );

    const safeUser: SafeStudentUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      email_verified: user.email_verified,
      auth_provider: user.auth_provider,
      profile: {
        id: profile.id,
        full_name: profile.full_name,
        education_level: profile.education_level,
        academic_stage: profile.academic_stage,
        institution: profile.institution,
        department: profile.department,
        current_year: profile.current_year,
        student_identifier: profile.student_identifier,
      },
    };

    return {
      sessionToken,
      expiresAt,
      user: safeUser,
    };
  }

  /**
   * Resolves currently authenticated student by raw session token.
   */
  async resolveSession(rawToken: string): Promise<SafeStudentUser | null> {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const tokenHash = hashSessionToken(rawToken);
    const sessionContext = await sessionRepository.findActiveSession(tokenHash);
    if (!sessionContext) {
      return null;
    }

    // Non-blocking session liveness touch
    sessionRepository.touchSession(sessionContext.sessionId);

    return sessionContext.user;
  }

  /**
   * Revokes the active session token in the database.
   */
  async logout(rawToken: string): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string') {
      return;
    }
    const tokenHash = hashSessionToken(rawToken);
    await sessionRepository.revokeSessionByTokenHash(tokenHash);
  }

  /**
   * Updates student profile information.
   */
  async updateProfile(userId: string, data: UpdateProfileInput): Promise<SafeStudentUser | null> {
    return userRepository.updateProfile(userId, data);
  }
}

export const authService = new AuthService();
