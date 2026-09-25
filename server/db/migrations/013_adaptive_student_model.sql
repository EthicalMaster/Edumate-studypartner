-- ============================================================================
-- EDUMATE MIGRATION 013: ADAPTIVE STUDENT MODEL
-- Phase 11: Persistent, deterministic representation of student learning state
-- ============================================================================

-- 1. Student Adaptive Profile (Student-Level Aggregates)
CREATE TABLE IF NOT EXISTS student_adaptive_profile (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL UNIQUE REFERENCES student_profiles(id) ON DELETE CASCADE,
    overall_mastery NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    overall_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    overall_confidence NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    learning_consistency NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    total_assessed_questions INTEGER NOT NULL DEFAULT 0,
    total_correct_answers INTEGER NOT NULL DEFAULT 0,
    total_incorrect_answers INTEGER NOT NULL DEFAULT 0,
    total_skipped_answers INTEGER NOT NULL DEFAULT 0,
    total_quizzes_completed INTEGER NOT NULL DEFAULT 0,
    total_study_seconds INTEGER NOT NULL DEFAULT 0,
    last_learning_activity TIMESTAMPTZ,
    last_assessment_activity TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_adaptive_profile_mastery CHECK (overall_mastery >= 0.00 AND overall_mastery <= 100.00),
    CONSTRAINT chk_adaptive_profile_accuracy CHECK (overall_accuracy >= 0.00 AND overall_accuracy <= 100.00),
    CONSTRAINT chk_adaptive_profile_confidence CHECK (overall_confidence >= 0.00 AND overall_confidence <= 100.00),
    CONSTRAINT chk_adaptive_profile_consistency CHECK (learning_consistency >= 0.00 AND learning_consistency <= 100.00)
);

-- 2. Student Subject Mastery (Subject-Level Relational Records)
CREATE TABLE IF NOT EXISTS student_subject_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    assessed_question_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    incorrect_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    mastery_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    recent_performance NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    trend VARCHAR(30) NOT NULL DEFAULT 'insufficient_data',
    readiness_indicator VARCHAR(30) NOT NULL DEFAULT 'emerging',
    last_assessed TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_subject_mastery UNIQUE (student_id, subject),
    CONSTRAINT chk_subject_mastery_accuracy CHECK (accuracy >= 0.00 AND accuracy <= 100.00),
    CONSTRAINT chk_subject_mastery_score CHECK (mastery_score >= 0.00 AND mastery_score <= 100.00),
    CONSTRAINT chk_subject_confidence_score CHECK (confidence_score >= 0.00 AND confidence_score <= 100.00),
    CONSTRAINT chk_subject_recent_perf CHECK (recent_performance >= 0.00 AND recent_performance <= 100.00),
    CONSTRAINT chk_subject_trend CHECK (trend IN ('improving', 'declining', 'steady', 'insufficient_data')),
    CONSTRAINT chk_subject_readiness CHECK (readiness_indicator IN ('emerging', 'developing', 'competent', 'proficient', 'mastered'))
);

-- 3. Student Topic Mastery (Topic-Level Relational Records)
CREATE TABLE IF NOT EXISTS student_topic_mastery (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(150) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    incorrect INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    mastery_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    recent_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    trend VARCHAR(30) NOT NULL DEFAULT 'insufficient_data',
    last_attempted TIMESTAMPTZ,
    retention_indicator VARCHAR(30) NOT NULL DEFAULT 'baseline',
    recommended_difficulty VARCHAR(30) NOT NULL DEFAULT 'easy',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_topic_mastery UNIQUE (student_id, subject, topic),
    CONSTRAINT chk_topic_mastery_accuracy CHECK (accuracy >= 0.00 AND accuracy <= 100.00),
    CONSTRAINT chk_topic_mastery_score CHECK (mastery_score >= 0.00 AND mastery_score <= 100.00),
    CONSTRAINT chk_topic_confidence_score CHECK (confidence_score >= 0.00 AND confidence_score <= 100.00),
    CONSTRAINT chk_topic_recent_acc CHECK (recent_accuracy >= 0.00 AND recent_accuracy <= 100.00),
    CONSTRAINT chk_topic_trend CHECK (trend IN ('improving', 'declining', 'steady', 'insufficient_data')),
    CONSTRAINT chk_topic_retention CHECK (retention_indicator IN ('fresh', 'consolidating', 'decaying', 'needs_revision', 'baseline')),
    CONSTRAINT chk_topic_difficulty CHECK (recommended_difficulty IN ('easy', 'medium', 'hard'))
);

-- 4. Indexes for tenant-isolated lookups
CREATE INDEX IF NOT EXISTS idx_student_adaptive_profile_student ON student_adaptive_profile(student_id);
CREATE INDEX IF NOT EXISTS idx_student_subject_mastery_student ON student_subject_mastery(student_id);
CREATE INDEX IF NOT EXISTS idx_student_topic_mastery_student_subject ON student_topic_mastery(student_id, subject);
CREATE INDEX IF NOT EXISTS idx_student_topic_mastery_retention ON student_topic_mastery(student_id, retention_indicator);
CREATE INDEX IF NOT EXISTS idx_student_topic_mastery_difficulty ON student_topic_mastery(student_id, recommended_difficulty);
