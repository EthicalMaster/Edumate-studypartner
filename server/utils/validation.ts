/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Practical email validation regex ensuring:
 * 1. An address with local part (letters, digits, valid special chars)
 * 2. Exactly one '@' symbol
 * 3. A domain part with at least one dot separating domain label and TLD
 * 4. TLD of at least 2 alphabetic characters (e.g. .com, .edu, .org, .co.uk)
 * 5. Rejects malformed addresses such as:
 *    - test (no @)
 *    - test@ (no domain)
 *    - @gmail.com (no local part)
 *    - test@gmail (no dot / TLD)
 *    - test@@gmail.com (multiple @)
 */
export const PRACTICAL_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount !== 1) return false;
  if (trimmed.startsWith('@') || trimmed.endsWith('@')) return false;
  return PRACTICAL_EMAIL_REGEX.test(trimmed);
}

export const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, { message: 'Email address is required' })
      .max(255, { message: 'Email must not exceed 255 characters' })
      .refine(isValidEmail, {
        message: 'Please provide a valid practical email address (e.g. student@university.edu)',
      }),
    password: z
      .string()
      .min(8, { message: 'Password must be at least 8 characters long' })
      .max(128, { message: 'Password must not exceed 128 characters' }),
    confirm_password: z
      .string()
      .min(1, { message: 'Please confirm your password' }),
    full_name: z
      .string()
      .trim()
      .min(2, { message: 'Full name must be at least 2 characters long' })
      .max(150, { message: 'Full name must not exceed 150 characters' }),
    institution: z
      .string()
      .trim()
      .max(200, { message: 'Institution must not exceed 200 characters' })
      .optional()
      .nullable(),
    department: z
      .string()
      .trim()
      .max(150, { message: 'Department must not exceed 150 characters' })
      .optional()
      .nullable(),
    current_year: z
      .coerce
      .number()
      .int({ message: 'Current year must be an integer' })
      .min(1, { message: 'Current year must be between 1 and 5' })
      .max(5, { message: 'Current year must be between 1 and 5' })
      .optional()
      .nullable(),
    student_identifier: z
      .string()
      .trim()
      .max(100, { message: 'Student ID must not exceed 100 characters' })
      .optional()
      .nullable(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, { message: 'Email address is required' })
    .refine(isValidEmail, {
      message: 'Please provide a valid email address (e.g. student@university.edu)',
    }),
  password: z
    .string()
    .min(1, { message: 'Password is required' }),
});

export const updateProfileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, { message: 'Full name must be at least 2 characters long' })
    .max(150, { message: 'Full name must not exceed 150 characters' })
    .optional(),
  institution: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable(),
  department: z
    .string()
    .trim()
    .max(150)
    .optional()
    .nullable(),
  current_year: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .nullable(),
  student_identifier: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
