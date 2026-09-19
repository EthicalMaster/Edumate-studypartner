-- ============================================================================
-- EDUMATE DATABASE MIGRATION 005
-- Purpose: Permanent, unique 10-character system-generated Learner ID
-- Format: EDU + 7 uppercase alphanumeric characters (e.g. EDU7K4P92X)
-- ============================================================================

-- 1. Safely backfill existing profiles that have NULL or non-standard identifiers.
-- Existing valid identifiers (10 characters starting with EDU) are preserved.
UPDATE student_profiles
SET student_identifier = 'EDU' || UPPER(SUBSTRING(MD5(id::text), 1, 7))
WHERE student_identifier IS NULL 
   OR LENGTH(student_identifier) != 10 
   OR SUBSTRING(student_identifier, 1, 3) != 'EDU';

-- 2. Set default generator and enforce NOT NULL on student_identifier
ALTER TABLE student_profiles
  ALTER COLUMN student_identifier SET DEFAULT ('EDU' || UPPER(SUBSTRING(MD5(gen_random_uuid()::text), 1, 7)));

ALTER TABLE student_profiles
  ALTER COLUMN student_identifier SET NOT NULL;

-- 3. Add UNIQUE constraint to prevent collision at database level
ALTER TABLE student_profiles
  ADD CONSTRAINT uq_student_profiles_student_identifier UNIQUE (student_identifier);

-- 4. Add CHECK constraint to enforce format: ^EDU[A-Z0-9]{7}$
ALTER TABLE student_profiles
  ADD CONSTRAINT chk_student_profiles_learner_id_format
  CHECK (student_identifier ~ '^EDU[A-Z0-9]{7}$');
