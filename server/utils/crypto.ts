/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import argon2 from 'argon2';
import crypto from 'crypto';

/**
 * Hashes a plaintext password using Argon2id.
 * Uses standard OWASP-recommended parameters suitable for responsive web applications.
 */
export async function hashPassword(plainText: string): Promise<string> {
  return argon2.hash(plainText, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB
    timeCost: 3,        // 3 iterations
    parallelism: 1,
  });
}

/**
 * Verifies a plaintext password against a stored Argon2id hash.
 * Returns boolean without throwing timing-vulnerable exceptions.
 */
export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}

/**
 * Generates a cryptographically secure 256-bit opaque session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes a deterministic SHA-256 hash of a session token.
 * Raw session tokens are never stored plaintext in the database.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const LEARNER_ID_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates a permanent Learner ID using a cryptographically secure random source (crypto.randomInt).
 * Exactly 10 characters: 'EDU' prefix followed by 7 uppercase alphanumeric characters [A-Z0-9].
 * Zero modulo bias; does NOT use Math.random().
 */
export function generateLearnerId(): string {
  let suffix = '';
  for (let i = 0; i < 7; i++) {
    const idx = crypto.randomInt(0, LEARNER_ID_CHARSET.length);
    suffix += LEARNER_ID_CHARSET[idx];
  }
  return `EDU${suffix}`;
}

/**
 * Validates whether a candidate string matches the exact Learner ID format:
 * ^EDU[A-Z0-9]{7}$ (exactly 10 characters: 'EDU' + 7 uppercase A-Z or digits 0-9).
 */
export function isValidLearnerId(id: string): boolean {
  if (typeof id !== 'string' || id.length !== 10) {
    return false;
  }
  return /^EDU[A-Z0-9]{7}$/.test(id);
}
