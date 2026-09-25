-- ============================================================================
-- EDUMATE MIGRATION 013 DOWN: ROLLBACK ADAPTIVE STUDENT MODEL
-- ============================================================================

DROP INDEX IF EXISTS idx_student_topic_mastery_difficulty;
DROP INDEX IF EXISTS idx_student_topic_mastery_retention;
DROP INDEX IF EXISTS idx_student_topic_mastery_student_subject;
DROP INDEX IF EXISTS idx_student_subject_mastery_student;
DROP INDEX IF EXISTS idx_student_adaptive_profile_student;

DROP TABLE IF EXISTS student_topic_mastery CASCADE;
DROP TABLE IF EXISTS student_subject_mastery CASCADE;
DROP TABLE IF EXISTS student_adaptive_profile CASCADE;
