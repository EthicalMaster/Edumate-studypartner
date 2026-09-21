-- ============================================================================
-- EDUMATE MIGRATION 011 ROLLBACK: REAL-TIME LEARNING ANALYTICS & STUDY SESSIONS
-- ============================================================================

DROP TABLE IF EXISTS student_learning_daily CASCADE;
DROP TABLE IF EXISTS study_sessions CASCADE;

ALTER TABLE student_activity DROP CONSTRAINT IF EXISTS chk_student_activity_type;
ALTER TABLE student_activity ADD CONSTRAINT chk_student_activity_type CHECK (
    activity_type IN ('quiz_completed', 'flashcard_reviewed', 'material_uploaded')
);
