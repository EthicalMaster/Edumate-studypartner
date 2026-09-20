-- Migration 009 Down: Revert Vector Embeddings Metadata and Resource Governance
DROP TABLE IF EXISTS student_retrieval_quotas CASCADE;
DROP TABLE IF EXISTS chunk_embeddings CASCADE;
ALTER TABLE study_materials DROP COLUMN IF EXISTS embedding_status;
ALTER TABLE study_materials DROP COLUMN IF EXISTS embedding_error;
