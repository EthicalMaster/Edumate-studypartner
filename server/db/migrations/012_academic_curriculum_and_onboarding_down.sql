-- ============================================================================
-- Migration: 012_academic_curriculum_and_onboarding_down.sql
-- Description: Revert Phase 10B Academic Curriculum Personalization & Onboarding
-- ============================================================================

DROP INDEX IF EXISTS idx_question_bank_target_level;
ALTER TABLE question_bank DROP COLUMN IF EXISTS target_level;

DROP INDEX IF EXISTS idx_student_profiles_onboarding;
DROP INDEX IF EXISTS idx_student_profiles_stream;
DROP INDEX IF EXISTS idx_student_profiles_program;

ALTER TABLE student_profiles 
    DROP COLUMN IF EXISTS onboarding_completed_at,
    DROP COLUMN IF EXISTS has_completed_onboarding,
    DROP COLUMN IF EXISTS target_exam,
    DROP COLUMN IF EXISTS stream,
    DROP COLUMN IF EXISTS program;
