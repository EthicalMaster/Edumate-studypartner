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
