-- ============================================================================
-- Migration: 007_study_materials_phase5.sql
-- Description: Phase 5 Study Materials Upload & Storage Foundation
-- ============================================================================

-- 1. Add title, original_filename, mime_type, storage_key, and processing_error to study_materials
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100);
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS storage_key VARCHAR(255);
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- 2. Backfill existing legacy rows (if any)
UPDATE study_materials
SET
    title = COALESCE(title, topic, filename),
    original_filename = COALESCE(original_filename, filename),
    mime_type = COALESCE(mime_type, file_type),
    storage_key = COALESCE(storage_key, storage_location)
WHERE title IS NULL OR original_filename IS NULL;

-- 3. Expand processing_status check constraint to support Phase 5 lifecycle
-- Lifecycle: 'uploaded', 'processing', 'ready', 'failed' (plus legacy 'pending', 'completed')
ALTER TABLE study_materials DROP CONSTRAINT IF EXISTS chk_study_materials_status;
ALTER TABLE study_materials ADD CONSTRAINT chk_study_materials_status
    CHECK (processing_status IN ('uploaded', 'processing', 'ready', 'failed', 'pending', 'completed'));

-- 4. Default processing_status to 'uploaded'
ALTER TABLE study_materials ALTER COLUMN processing_status SET DEFAULT 'uploaded';

-- 5. Performance Indexes for student isolation, subject filtering, and ordering
CREATE INDEX IF NOT EXISTS idx_study_materials_student_id ON study_materials(student_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_subject ON study_materials(subject);
CREATE INDEX IF NOT EXISTS idx_study_materials_status ON study_materials(processing_status);
CREATE INDEX IF NOT EXISTS idx_study_materials_created_at ON study_materials(created_at DESC);
