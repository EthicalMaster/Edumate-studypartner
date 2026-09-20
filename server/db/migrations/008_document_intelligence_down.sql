-- ============================================================================
-- Migration: 008_document_intelligence_down.sql
-- Description: Rollback Phase 6 Document Intelligence Foundation
-- ============================================================================

DROP TABLE IF EXISTS document_chunks CASCADE;
DROP TABLE IF EXISTS document_sections CASCADE;
DROP TABLE IF EXISTS document_pages CASCADE;
