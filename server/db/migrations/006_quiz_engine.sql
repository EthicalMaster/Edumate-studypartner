-- ============================================================================
-- Migration: 006_quiz_engine.sql
-- Description: Phase 4 Quiz Engine, Paper Builder, and Real Results Schema
-- ============================================================================

-- 1. Enhance quizzes table with mode, source, total_marks, negative marking & randomization
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'PRACTICE';
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'question_bank';
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS total_marks NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS negative_marking BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS negative_mark_value NUMERIC(4,2) NOT NULL DEFAULT 0.00;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS randomization BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS chk_quizzes_mode;
ALTER TABLE quizzes ADD CONSTRAINT chk_quizzes_mode CHECK (mode IN ('PRACTICE', 'EXAM', 'practice', 'exam'));

ALTER TABLE quizzes DROP CONSTRAINT IF EXISTS chk_quizzes_source;
ALTER TABLE quizzes ADD CONSTRAINT chk_quizzes_source CHECK (source IN ('question_bank', 'topic', 'subject', 'uploaded_material'));

-- 2. Enhance quiz_questions with expanded question types, marks, sections & text answers
ALTER TABLE quiz_questions DROP CONSTRAINT IF EXISTS chk_quiz_questions_type;
ALTER TABLE quiz_questions ADD CONSTRAINT chk_quiz_questions_type CHECK (
    question_type IN (
        'MCQ', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'FILL_BLANK', 'VERY_SHORT', 'SHORT', 'LONG',
        'single_choice', 'multiple_choice', 'true_false'
    )
);

ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS marks NUMERIC(5,2) NOT NULL DEFAULT 1.00;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS section VARCHAR(100) DEFAULT 'Section A';
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS topic VARCHAR(150);
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS correct_answer_text TEXT;
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. Enhance quiz_sessions with mode, ordered question snapshot, and scoring config
ALTER TABLE quiz_sessions DROP CONSTRAINT IF EXISTS chk_quiz_sessions_reason;
ALTER TABLE quiz_sessions ADD CONSTRAINT chk_quiz_sessions_reason CHECK (
    submission_reason IS NULL OR 
    submission_reason IN (
        'manual', 'manual_submit', 'timeout', 'time_expired', 
        'tab_switch', 'navigation', 'system', 'auto_submit'
    )
);

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'PRACTICE';
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS question_order JSONB;
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS scoring_config JSONB;

-- 4. Enhance quiz_answers to support text answers for fill_blank and subjective formats
ALTER TABLE quiz_answers ALTER COLUMN selected_option_ids DROP NOT NULL;
ALTER TABLE quiz_answers ADD COLUMN IF NOT EXISTS answer_text TEXT;

-- 5. Enhance quiz_results with negative marks deducted and section breakdown
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS negative_marks_deducted NUMERIC(6,2) NOT NULL DEFAULT 0.00;
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS section_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 6. Question Bank Table for real curriculum-based Paper Building
CREATE TABLE IF NOT EXISTS question_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(150) NOT NULL,
    difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
    question_type VARCHAR(30) NOT NULL,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    correct_answer_text TEXT,
    explanation TEXT NOT NULL,
    formula_hint TEXT,
    default_marks NUMERIC(5,2) NOT NULL DEFAULT 1.00,
    section VARCHAR(100) DEFAULT 'Section A',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_qb_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard', 'mixed')),
    CONSTRAINT chk_qb_type CHECK (
        question_type IN (
            'MCQ', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'FILL_BLANK', 'VERY_SHORT', 'SHORT', 'LONG'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_question_bank_subject_topic ON question_bank(subject, topic);
CREATE INDEX IF NOT EXISTS idx_question_bank_difficulty ON question_bank(difficulty);
CREATE INDEX IF NOT EXISTS idx_question_bank_type ON question_bank(question_type);
