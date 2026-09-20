-- ============================================================================
-- Migration: 006_quiz_engine_down.sql
-- Description: Rollback Phase 4 Quiz Engine schema enhancements
-- ============================================================================

DROP TABLE IF EXISTS question_bank;

ALTER TABLE quiz_results
    DROP COLUMN IF EXISTS negative_marks_deducted,
    DROP COLUMN IF EXISTS section_breakdown;

ALTER TABLE quiz_answers
    DROP COLUMN IF EXISTS answer_text;

ALTER TABLE quiz_sessions
    DROP COLUMN IF EXISTS scoring_config,
    DROP COLUMN IF EXISTS question_order,
    DROP COLUMN IF EXISTS mode;

ALTER TABLE quiz_questions
    DROP COLUMN IF EXISTS metadata,
    DROP COLUMN IF EXISTS correct_answer_text,
    DROP COLUMN IF EXISTS topic,
    DROP COLUMN IF EXISTS section,
    DROP COLUMN IF EXISTS marks;

ALTER TABLE quizzes
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS randomization,
    DROP COLUMN IF EXISTS negative_mark_value,
    DROP COLUMN IF EXISTS negative_marking,
    DROP COLUMN IF EXISTS total_marks,
    DROP COLUMN IF EXISTS source,
    DROP COLUMN IF EXISTS mode,
    DROP COLUMN IF EXISTS description;
