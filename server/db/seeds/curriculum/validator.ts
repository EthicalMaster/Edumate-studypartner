/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CurriculumQuestion } from './types.js';

export interface ValidationIssue {
  index: number;
  subject: string;
  topic: string;
  question_text: string;
  field: string;
  error: string;
}

export interface ValidationResult {
  valid: boolean;
  totalChecked: number;
  issues: ValidationIssue[];
}

const ALLOWED_TYPES = new Set([
  'MCQ',
  'MULTIPLE_SELECT',
  'TRUE_FALSE',
  'FILL_BLANK',
  'VERY_SHORT',
  'SHORT',
  'LONG',
]);

const ALLOWED_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

export function validateCurriculumDataset(questions: CurriculumQuestion[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const textSet = new Set<string>();

  questions.forEach((q, idx) => {
    const report = (field: string, error: string) => {
      issues.push({
        index: idx,
        subject: q.subject || 'Unknown',
        topic: q.topic || 'Unknown',
        question_text: (q.question_text || '').slice(0, 60),
        field,
        error,
      });
    };

    // 1. Required string fields
    if (!q.subject || typeof q.subject !== 'string' || q.subject.trim().length === 0) {
      report('subject', 'Subject is required and must be a non-empty string.');
    }
    if (!q.topic || typeof q.topic !== 'string' || q.topic.trim().length === 0) {
      report('topic', 'Topic is required and must be a non-empty string.');
    }
    if (!q.section || typeof q.section !== 'string' || q.section.trim().length === 0) {
      report('section', 'Section is required and must be a non-empty string.');
    }
    if (!q.question_text || typeof q.question_text !== 'string' || q.question_text.trim().length < 5) {
      report('question_text', 'Question text must be at least 5 characters long.');
    }
    if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim().length < 10) {
      report('explanation', 'Explanation must be at least 10 characters long.');
    }

    // 2. Enum validations
    if (!ALLOWED_TYPES.has(q.question_type)) {
      report('question_type', `Invalid question type: "${q.question_type}". Allowed: ${Array.from(ALLOWED_TYPES).join(', ')}`);
    }
    if (!ALLOWED_DIFFICULTIES.has(q.difficulty)) {
      report('difficulty', `Invalid difficulty: "${q.difficulty}". Allowed: easy, medium, hard`);
    }

    // 3. Marks validation
    if (typeof q.default_marks !== 'number' || isNaN(q.default_marks) || q.default_marks <= 0) {
      report('default_marks', `Marks must be a positive number, got: ${q.default_marks}`);
    }

    // 4. Duplicate question text detection within batch
    if (q.question_text) {
      const normalizedKey = `${(q.subject || '').trim().toLowerCase()}:::${q.question_text.trim().toLowerCase()}`;
      if (textSet.has(normalizedKey)) {
        report('question_text', 'Duplicate question text detected within dataset.');
      } else {
        textSet.add(normalizedKey);
      }
    }

    // 5. Question type specific option & answer validation
    if (q.question_type === 'MCQ') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        report('options', `MCQ must have at least 2 options, found: ${q.options?.length || 0}`);
      } else {
        const optionIds = new Set(q.options.map((o) => o.id));
        if (!Array.isArray(q.correct_option_ids) || q.correct_option_ids.length !== 1) {
          report('correct_option_ids', `MCQ must have exactly 1 correct option, found: ${q.correct_option_ids?.length || 0}`);
        } else {
          const correctId = q.correct_option_ids[0];
          if (!optionIds.has(correctId)) {
            report('correct_option_ids', `Correct option id "${correctId}" does not exist in options.`);
          }
        }
      }
    } else if (q.question_type === 'MULTIPLE_SELECT') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        report('options', `MULTIPLE_SELECT must have at least 2 options.`);
      } else {
        const optionIds = new Set(q.options.map((o) => o.id));
        if (!Array.isArray(q.correct_option_ids) || q.correct_option_ids.length < 1) {
          report('correct_option_ids', `MULTIPLE_SELECT must have at least 1 correct option.`);
        } else {
          for (const cId of q.correct_option_ids) {
            if (!optionIds.has(cId)) {
              report('correct_option_ids', `Option ID "${cId}" not in options.`);
            }
          }
        }
      }
    } else if (q.question_type === 'TRUE_FALSE') {
      if (!Array.isArray(q.options) || q.options.length !== 2) {
        report('options', `TRUE_FALSE must have exactly 2 options ('true' and 'false').`);
      } else {
        const ids = q.options.map((o) => o.id);
        if (!ids.includes('true') || !ids.includes('false')) {
          report('options', `TRUE_FALSE options must have IDs 'true' and 'false'.`);
        }
        if (!Array.isArray(q.correct_option_ids) || q.correct_option_ids.length !== 1) {
          report('correct_option_ids', `TRUE_FALSE must have exactly 1 correct option ID.`);
        } else if (q.correct_option_ids[0] !== 'true' && q.correct_option_ids[0] !== 'false') {
          report('correct_option_ids', `TRUE_FALSE correct option ID must be 'true' or 'false'.`);
        }
      }
    } else {
      // FILL_BLANK, VERY_SHORT, SHORT, LONG
      if (
        !q.correct_answer_text ||
        typeof q.correct_answer_text !== 'string' ||
        q.correct_answer_text.trim().length === 0
      ) {
        report('correct_answer_text', `${q.question_type} must have non-empty correct_answer_text.`);
      }
    }
  });

  return {
    valid: issues.length === 0,
    totalChecked: questions.length,
    issues,
  };
}
