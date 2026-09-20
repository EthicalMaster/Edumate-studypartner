-- ============================================================================
-- Migration Rollback: 007_study_materials_phase5_down.sql
-- ============================================================================

DROP INDEX IF EXISTS idx_study_materials_created_at;
DROP INDEX IF EXISTS idx_study_materials_status;
DROP INDEX IF EXISTS idx_study_materials_subject;
DROP INDEX IF EXISTS idx_study_materials_student_id;

ALTER TABLE study_materials DROP CONSTRAINT IF EXISTS chk_study_materials_status;
ALTER TABLE study_materials ADD CONSTRAINT chk_study_materials_status
    CHECK (processing_status IN ('pending', 'completed', 'failed'));

ALTER TABLE study_materials ALTER COLUMN processing_status SET DEFAULT 'pending';

ALTER TABLE study_materials DROP COLUMN IF EXISTS processing_error;
ALTER TABLE study_materials DROP COLUMN IF EXISTS storage_key;
ALTER TABLE study_materials DROP COLUMN IF EXISTS mime_type;
ALTER TABLE study_materials DROP COLUMN IF EXISTS original_filename;
ALTER TABLE study_materials DROP COLUMN IF EXISTS title;
