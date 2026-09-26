-- ============================================================================
-- AVEN MIGRATION 014: INTELLIGENT FLASHCARD SYSTEM 2.0
-- Dynamic Curriculum Flashcards, Spaced Repetition (SM-2), and Study Material Decks
-- ============================================================================

-- 1. Make study_kit_id nullable in flashcards to support standalone Curriculum flashcards
ALTER TABLE flashcards ALTER COLUMN study_kit_id DROP NOT NULL;

-- 2. Add source tracking, metadata, and review outcome columns to flashcards
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) NOT NULL DEFAULT 'study_material';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS source_material_id UUID REFERENCES study_materials(id) ON DELETE SET NULL;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS curriculum_question_id VARCHAR(100);
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS last_rating INTEGER;

-- 3. Add constraint for source_type
ALTER TABLE flashcards DROP CONSTRAINT IF EXISTS chk_flashcards_source_type;
ALTER TABLE flashcards ADD CONSTRAINT chk_flashcards_source_type
    CHECK (source_type IN ('curriculum', 'study_material', 'custom'));

-- 4. Extend flashcard_reviews with detailed interval tracking
ALTER TABLE flashcard_reviews ADD COLUMN IF NOT EXISTS time_taken_ms INTEGER DEFAULT 0;
ALTER TABLE flashcard_reviews ADD COLUMN IF NOT EXISTS previous_interval_days INTEGER DEFAULT 0;
ALTER TABLE flashcard_reviews ADD COLUMN IF NOT EXISTS new_interval_days INTEGER DEFAULT 0;
ALTER TABLE flashcard_reviews ADD COLUMN IF NOT EXISTS previous_ease_factor NUMERIC(4,2) DEFAULT 2.50;
ALTER TABLE flashcard_reviews ADD COLUMN IF NOT EXISTS new_ease_factor NUMERIC(4,2) DEFAULT 2.50;

-- 5. Performance Indexes for high-throughput spaced repetition lookups
CREATE INDEX IF NOT EXISTS idx_flashcards_student_source ON flashcards(student_id, source_type);
CREATE INDEX IF NOT EXISTS idx_flashcards_student_due ON flashcards(student_id, next_review_due);
CREATE INDEX IF NOT EXISTS idx_flashcards_student_subject_topic ON flashcards(student_id, subject, topic);
CREATE INDEX IF NOT EXISTS idx_flashcards_student_mastery ON flashcards(student_id, mastery_state);
CREATE INDEX IF NOT EXISTS idx_flashcards_source_material ON flashcards(source_material_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_student_time ON flashcard_reviews(student_id, reviewed_at DESC);
