/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ALL_CURRICULUM_QUESTIONS, type CurriculumQuestion } from './curriculum/index.js';

export type SeedQuestion = CurriculumQuestion;

/**
 * Deterministic expanded curriculum dataset for EDUMATE development and testing.
 * Contains 558 questions across 8 subjects and all 7 supported question types.
 */
export const SEED_QUESTION_BANK: SeedQuestion[] = ALL_CURRICULUM_QUESTIONS;
