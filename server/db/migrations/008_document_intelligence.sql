-- ============================================================================
-- Migration: 008_document_intelligence.sql
-- Description: Phase 6 Document Intelligence Foundation
-- Tables: document_pages, document_sections, document_chunks
-- ============================================================================

-- 1. document_pages: Preserves deterministic page boundaries & raw extracted text
CREATE TABLE IF NOT EXISTS document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    character_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_document_pages_material_page UNIQUE(material_id, page_number),
    CONSTRAINT chk_document_pages_page_num CHECK (page_number > 0),
    CONSTRAINT chk_document_pages_char_count CHECK (character_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_document_pages_material_id ON document_pages(material_id);
CREATE INDEX IF NOT EXISTS idx_document_pages_material_page ON document_pages(material_id, page_number);

-- 2. document_sections: Detected hierarchical outline (chapters, sections, topics)
CREATE TABLE IF NOT EXISTS document_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
    parent_section_id UUID REFERENCES document_sections(id) ON DELETE CASCADE,
    section_type VARCHAR(50) NOT NULL DEFAULT 'section',
    title VARCHAR(255) NOT NULL,
    section_order INTEGER NOT NULL DEFAULT 0,
    page_start INTEGER NOT NULL DEFAULT 1,
    page_end INTEGER NOT NULL DEFAULT 1,
    heading_level INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_document_sections_order CHECK (section_order >= 0),
    CONSTRAINT chk_document_sections_page_range CHECK (page_start > 0 AND page_end >= page_start),
    CONSTRAINT chk_document_sections_heading_level CHECK (heading_level >= 1 AND heading_level <= 6),
    CONSTRAINT chk_document_sections_type CHECK (
        section_type IN ('document', 'chapter', 'section', 'topic', 'subsection')
    )
);

CREATE INDEX IF NOT EXISTS idx_document_sections_material_id ON document_sections(material_id);
CREATE INDEX IF NOT EXISTS idx_document_sections_parent_id ON document_sections(parent_section_id);
CREATE INDEX IF NOT EXISTS idx_document_sections_material_order ON document_sections(material_id, section_order);

-- 3. document_chunks: Discrete knowledge units for future RAG with exact source traceability
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
    section_id UUID REFERENCES document_sections(id) ON DELETE SET NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    page_start INTEGER NOT NULL DEFAULT 1,
    page_end INTEGER NOT NULL DEFAULT 1,
    character_count INTEGER NOT NULL,
    token_estimate INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_document_chunks_material_index UNIQUE(material_id, chunk_index),
    CONSTRAINT chk_document_chunks_index CHECK (chunk_index >= 0),
    CONSTRAINT chk_document_chunks_page_range CHECK (page_start > 0 AND page_end >= page_start),
    CONSTRAINT chk_document_chunks_char_count CHECK (character_count > 0),
    CONSTRAINT chk_document_chunks_token_estimate CHECK (token_estimate >= 0)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_material_id ON document_chunks(material_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_section_id ON document_chunks(section_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_material_chunk ON document_chunks(material_id, chunk_index);
