-- ============================================================================
-- EDUMATE MIGRATION 011: REAL-TIME LEARNING ANALYTICS & STUDY SESSIONS
-- Phase 8.5: Server-authoritative study time tracking and analytics schemas
-- ============================================================================

-- 1. Update student_activity constraint to support all learning event types
ALTER TABLE student_activity DROP CONSTRAINT IF EXISTS chk_student_activity_type;

ALTER TABLE student_activity ADD CONSTRAINT chk_student_activity_type CHECK (
    activity_type IN (
        'quiz_started',
        'quiz_submitted',
        'quiz_completed',
        'study_material_uploaded',
        'study_material_processed',
        'flashcard_reviewed',
        'study_session_started',
        'study_session_completed',
        'material_uploaded'
    )
);

-- 2. Create study_sessions table
CREATE TABLE IF NOT EXISTS study_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    subject VARCHAR(100),
    topic VARCHAR(150),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_study_sessions_status CHECK (status IN ('active', 'completed', 'abandoned')),
    CONSTRAINT chk_study_sessions_duration CHECK (duration_seconds >= 0)
);

-- 3. Create student_learning_daily pre-aggregated summary table
CREATE TABLE IF NOT EXISTS student_learning_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    study_seconds INTEGER NOT NULL DEFAULT 0,
    quizzes_completed INTEGER NOT NULL DEFAULT 0,
    questions_attempted INTEGER NOT NULL DEFAULT 0,
    questions_correct INTEGER NOT NULL DEFAULT 0,
    flashcard_reviews INTEGER NOT NULL DEFAULT 0,
    materials_studied INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_learning_daily UNIQUE (student_id, activity_date)
);

-- 4. Indexes for rapid tenant analytics queries
CREATE INDEX IF NOT EXISTS idx_study_sessions_student_id ON study_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_started_at ON study_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_study_sessions_status ON study_sessions(status);
CREATE INDEX IF NOT EXISTS idx_student_learning_daily_student_date ON student_learning_daily(student_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_student_activity_student_timestamp ON student_activity(student_id, activity_timestamp DESC);
