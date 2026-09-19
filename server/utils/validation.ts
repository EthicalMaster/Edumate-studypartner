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

export const LEARNER_ID_REGEX = /^EDU[A-Z0-9]{7}$/;

export const EDUCATION_LEVELS = [
  'School',
  'Undergraduate / College',
  'Postgraduate',
  'Diploma / Vocational',
  'Other',
] as const;

export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const VALID_STAGES_BY_LEVEL: Record<string, string[]> = {
  'School': [
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
    'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
    'Other'
  ],
  'Undergraduate / College': [
    '1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Other'
  ],
  'Postgraduate': [
    '1st Year', '2nd Year', '3rd Year', 'Other'
  ],
  'Diploma / Vocational': [
    'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Other'
  ],
  'Other': [
    'Self-Paced Learner', 'Professional / Upskilling', 'Certification Candidate', 'Lifelong Learner', 'Other'
  ],
};

export function isValidStageForLevel(level: string, stage: string): boolean {
  if (!level || !stage) return false;
  const allowed = VALID_STAGES_BY_LEVEL[level];
  if (allowed && allowed.includes(stage)) {
    return true;
  }
  // If custom stage, check incompatible patterns
  if (level === 'School') {
    if (/^[1-5](st|nd|rd|th)\s+Year$/i.test(stage)) {
      return false;
    }
    return true;
  }
  if (level === 'Undergraduate / College') {
    if (/^Grade\s+\d+$/i.test(stage)) {
      return false;
    }
    return true;
  }
  return true;
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
    education_level: z
      .string()
      .trim()
      .max(60)
      .optional(),
    academic_stage: z
      .string()
      .trim()
      .max(60)
      .optional(),
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
      .regex(LEARNER_ID_REGEX, {
        message: 'Learner ID must be exactly 10 characters starting with EDU followed by 7 uppercase alphanumeric characters (e.g. EDU7K4P92X)',
      })
      .optional()
      .nullable(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })
  .refine(
    (data) => Boolean((data.education_level && data.education_level.length > 0) || data.current_year),
    {
      message: 'Education level is required',
      path: ['education_level'],
    }
  )
  .refine(
    (data) => {
      if (data.education_level && data.education_level.length > 0) {
        return Boolean(data.academic_stage && data.academic_stage.length > 0);
      }
      return true;
    },
    {
      message: 'Academic stage / grade is required',
      path: ['academic_stage'],
    }
  )
  .refine(
    (data) => {
      if (data.education_level && data.academic_stage) {
        return isValidStageForLevel(data.education_level, data.academic_stage);
      }
      return true;
    },
    {
      message: 'The selected academic stage is not valid for the chosen education level',
      path: ['academic_stage'],
    }
  );

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
  education_level: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable(),
  academic_stage: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable(),
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
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
