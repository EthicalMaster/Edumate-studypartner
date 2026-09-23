/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CurriculumQuestion,
  CurriculumQuestionType,
  CurriculumDifficulty,
  CurriculumOption,
} from './types.js';
import { PHYSICS_QUESTIONS } from './physics.js';
import { CHEMISTRY_QUESTIONS } from './chemistry.js';
import { MATHEMATICS_QUESTIONS } from './mathematics.js';
import { BIOLOGY_QUESTIONS } from './biology.js';
import { COMPUTER_SCIENCE_QUESTIONS } from './computer-science.js';
import { DATA_SCIENCE_QUESTIONS } from './data-science.js';
import { GENERAL_APTITUDE_QUESTIONS } from './aptitude.js';
import { ENGLISH_QUESTIONS } from './english.js';

export type {
  CurriculumQuestion,
  CurriculumQuestionType,
  CurriculumDifficulty,
  CurriculumOption,
};
export { validateCurriculumDataset, type ValidationResult, type ValidationIssue } from './validator.js';

export const ALL_CURRICULUM_QUESTIONS: CurriculumQuestion[] = [
  ...PHYSICS_QUESTIONS,
  ...CHEMISTRY_QUESTIONS,
  ...MATHEMATICS_QUESTIONS,
  ...BIOLOGY_QUESTIONS,
  ...COMPUTER_SCIENCE_QUESTIONS,
  ...DATA_SCIENCE_QUESTIONS,
  ...GENERAL_APTITUDE_QUESTIONS,
  ...ENGLISH_QUESTIONS,
];

export const CURRICULUM_BY_SUBJECT: Record<string, CurriculumQuestion[]> = {
  Physics: PHYSICS_QUESTIONS,
  Chemistry: CHEMISTRY_QUESTIONS,
  Mathematics: MATHEMATICS_QUESTIONS,
  Biology: BIOLOGY_QUESTIONS,
  'Computer Science': COMPUTER_SCIENCE_QUESTIONS,
  'Data Science': DATA_SCIENCE_QUESTIONS,
  'General Aptitude': GENERAL_APTITUDE_QUESTIONS,
  English: ENGLISH_QUESTIONS,
};
