-- Migration 010: Phase 8 AI Gateway Resource Governance
-- Adds student_ai_quotas table to track daily AI usage per student

CREATE TABLE IF NOT EXISTS student_ai_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    request_date DATE NOT NULL DEFAULT CURRENT_DATE,
    request_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_ai_quotas UNIQUE (student_id, request_date)
);

CREATE INDEX IF NOT EXISTS idx_student_ai_quotas_student_date ON student_ai_quotas(student_id, request_date);
