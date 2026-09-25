-- ============================================================================
-- Migration: 012_academic_curriculum_and_onboarding.sql
-- Description: Phase 10B Academic Curriculum Personalization & First-Time Onboarding
-- ============================================================================

-- 1. Extend student_profiles with program, stream, and onboarding tracking
ALTER TABLE student_profiles 
    ADD COLUMN IF NOT EXISTS program VARCHAR(100),
    ADD COLUMN IF NOT EXISTS stream VARCHAR(100),
    ADD COLUMN IF NOT EXISTS target_exam VARCHAR(100),
    ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- 2. Indexes for curriculum filtering and onboarding checks
CREATE INDEX IF NOT EXISTS idx_student_profiles_program 
    ON student_profiles(program);

CREATE INDEX IF NOT EXISTS idx_student_profiles_stream 
    ON student_profiles(stream);

CREATE INDEX IF NOT EXISTS idx_student_profiles_onboarding 
    ON student_profiles(has_completed_onboarding);

-- 3. Extend question_bank with optional target_level for fine-grained curriculum mapping
-- Default is 'ALL' so all existing 554 questions remain fully compatible and available
ALTER TABLE question_bank
    ADD COLUMN IF NOT EXISTS target_level VARCHAR(60) NOT NULL DEFAULT 'ALL';

CREATE INDEX IF NOT EXISTS idx_question_bank_target_level
    ON question_bank(target_level);
