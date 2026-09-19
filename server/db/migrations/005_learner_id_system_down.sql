-- ============================================================================
-- EDUMATE DATABASE MIGRATION 005 ROLLBACK
-- Purpose: Revert permanent Learner ID constraints
-- ============================================================================

ALTER TABLE student_profiles
  DROP CONSTRAINT IF EXISTS chk_student_profiles_learner_id_format;

ALTER TABLE student_profiles
  DROP CONSTRAINT IF EXISTS uq_student_profiles_student_identifier;

ALTER TABLE student_profiles
  ALTER COLUMN student_identifier DROP NOT NULL;
