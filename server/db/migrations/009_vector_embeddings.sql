-- Migration 009: Phase 7 Vector Embeddings Metadata and Resource Governance
-- Adds chunk_embeddings metadata tracking and student_retrieval_quotas

CREATE TABLE IF NOT EXISTS chunk_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'BAAI/bge-small-en-v1.5',
    embedding_dimension INTEGER NOT NULL DEFAULT 384,
    embedding_version VARCHAR(50) NOT NULL DEFAULT '1.5',
    embedding_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_chunk_embeddings_status CHECK (embedding_status IN ('pending', 'processing', 'completed', 'failed')),
    CONSTRAINT chk_chunk_embeddings_dim CHECK (embedding_dimension = 384),
    CONSTRAINT uq_chunk_embeddings_chunk UNIQUE (chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_chunk_id ON chunk_embeddings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_material_id ON chunk_embeddings(material_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_student_id ON chunk_embeddings(student_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_status ON chunk_embeddings(embedding_status);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_mat_status ON chunk_embeddings(material_id, embedding_status);

-- Material-level embedding status tracking
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(30) NOT NULL DEFAULT 'pending';
ALTER TABLE study_materials ADD COLUMN IF NOT EXISTS embedding_error TEXT;
CREATE INDEX IF NOT EXISTS idx_study_materials_embedding_status ON study_materials(embedding_status);

-- Retrieval Rate-Limiting Quota Table (100 searches / student / day)
CREATE TABLE IF NOT EXISTS student_retrieval_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    search_date DATE NOT NULL DEFAULT CURRENT_DATE,
    search_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_retrieval_quotas UNIQUE (student_id, search_date)
);

CREATE INDEX IF NOT EXISTS idx_student_retrieval_quotas_student_date ON student_retrieval_quotas(student_id, search_date);
