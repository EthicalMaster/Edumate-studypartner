-- ============================================================================
-- EDUMATE MIGRATION 012: QUIZ MATERIAL PROVENANCE
-- Phase 10A: Grounded Question Generation from Uploaded Study Materials
-- Adds provenance tracking from study_materials and document_chunks to quiz_questions
-- ============================================================================

-- 1. Add material_id and chunk_id to quiz_questions for auditability & provenance
ALTER TABLE quiz_questions 
    ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES study_materials(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL;

-- 2. Indexes for rapid lookups and provenance queries
CREATE INDEX IF NOT EXISTS idx_quiz_questions_material_id ON quiz_questions(material_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_chunk_id ON quiz_questions(chunk_id);
