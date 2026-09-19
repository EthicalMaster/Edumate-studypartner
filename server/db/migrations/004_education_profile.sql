-- ============================================================================
-- Migration 004: General Education Profile
-- Description: Replaces university-only assumptions with generalized education_level
--              and adaptive academic_stage, while preserving backward compatibility.
-- ============================================================================

-- 1. Add education_level and academic_stage columns to student_profiles
ALTER TABLE student_profiles 
    ADD COLUMN IF NOT EXISTS education_level VARCHAR(60),
    ADD COLUMN IF NOT EXISTS academic_stage VARCHAR(60);

-- 2. Index for filtering and analytics
CREATE INDEX IF NOT EXISTS idx_student_profiles_education_level 
    ON student_profiles(education_level);

-- 3. Backfill existing records that have current_year populated
UPDATE student_profiles
SET 
    education_level = COALESCE(education_level, 'Undergraduate / College'),
    academic_stage = COALESCE(academic_stage, 
        CASE current_year
            WHEN 1 THEN '1st Year'
            WHEN 2 THEN '2nd Year'
            WHEN 3 THEN '3rd Year'
            WHEN 4 THEN '4th Year'
            WHEN 5 THEN '5th Year'
            ELSE 'Undergraduate'
        END
    )
WHERE education_level IS NULL AND current_year IS NOT NULL;
