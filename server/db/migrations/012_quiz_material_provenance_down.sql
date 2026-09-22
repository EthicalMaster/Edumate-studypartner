-- ============================================================================
-- EDUMATE MIGRATION 012 ROLLBACK: QUIZ MATERIAL PROVENANCE
-- ============================================================================

DROP INDEX IF EXISTS idx_quiz_questions_chunk_id;
DROP INDEX IF EXISTS idx_quiz_questions_material_id;

ALTER TABLE quiz_questions 
    DROP COLUMN IF EXISTS chunk_id,
    DROP COLUMN IF EXISTS material_id;
