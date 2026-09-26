-- ============================================================================
-- AVEN MIGRATION 014 DOWN: INTELLIGENT FLASHCARD SYSTEM 2.0 ROLLBACK
-- ============================================================================

-- Drop newly added indexes
DROP INDEX IF EXISTS idx_flashcard_reviews_student_time;
DROP INDEX IF EXISTS idx_flashcards_source_material;
DROP INDEX IF EXISTS idx_flashcards_student_mastery;
DROP INDEX IF EXISTS idx_flashcards_student_subject_topic;
DROP INDEX IF EXISTS idx_flashcards_student_due;
DROP INDEX IF EXISTS idx_flashcards_student_source;

-- Drop newly added columns on flashcard_reviews
ALTER TABLE flashcard_reviews DROP COLUMN IF EXISTS new_ease_factor;
ALTER TABLE flashcard_reviews DROP COLUMN IF EXISTS previous_ease_factor;
ALTER TABLE flashcard_reviews DROP COLUMN IF EXISTS new_interval_days;
ALTER TABLE flashcard_reviews DROP COLUMN IF EXISTS previous_interval_days;
ALTER TABLE flashcard_reviews DROP COLUMN IF EXISTS time_taken_ms;

-- Clean up any flashcards that do not have study_kit_id before enforcing NOT NULL
DELETE FROM flashcards WHERE study_kit_id IS NULL;

-- Drop constraint and newly added columns on flashcards
ALTER TABLE flashcards DROP CONSTRAINT IF EXISTS chk_flashcards_source_type;
ALTER TABLE flashcards DROP COLUMN IF EXISTS last_rating;
ALTER TABLE flashcards DROP COLUMN IF EXISTS last_reviewed_at;
ALTER TABLE flashcards DROP COLUMN IF EXISTS tags;
ALTER TABLE flashcards DROP COLUMN IF EXISTS explanation;
ALTER TABLE flashcards DROP COLUMN IF EXISTS curriculum_question_id;
ALTER TABLE flashcards DROP COLUMN IF EXISTS source_material_id;
ALTER TABLE flashcards DROP COLUMN IF EXISTS source_type;

-- Restore NOT NULL on study_kit_id
ALTER TABLE flashcards ALTER COLUMN study_kit_id SET NOT NULL;
