/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CurriculumQuestionType =
  | 'MCQ'
  | 'MULTIPLE_SELECT'
  | 'TRUE_FALSE'
  | 'FILL_BLANK'
  | 'VERY_SHORT'
  | 'SHORT'
  | 'LONG';

export type CurriculumDifficulty = 'easy' | 'medium' | 'hard';

export interface CurriculumOption {
  id: string;
  text: string;
}

export interface CurriculumQuestion {
  subject: string;
  topic: string;
  difficulty: CurriculumDifficulty;
  question_type: CurriculumQuestionType;
  question_text: string;
  options: CurriculumOption[];
  correct_option_ids: string[];
  correct_answer_text?: string;
  explanation: string;
  formula_hint?: string;
  default_marks: number;
  section: string;
}
