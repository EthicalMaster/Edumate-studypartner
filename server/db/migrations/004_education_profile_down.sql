-- ============================================================================
-- Migration 004 Rollback: General Education Profile
-- ============================================================================

DROP INDEX IF EXISTS idx_student_profiles_education_level;

ALTER TABLE student_profiles 
    DROP COLUMN IF EXISTS academic_stage,
    DROP COLUMN IF EXISTS education_level;
