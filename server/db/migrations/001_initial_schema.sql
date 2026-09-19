-- ============================================================================
-- Migration: 001_initial_schema.sql
-- Description: Initial PostgreSQL schema for EDUMATE (12 normalized tables)
-- ============================================================================

-- Ensure pgcrypto extension is available for standard UUID generation if not native
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Reusable trigger function for automatic updated_at timestamp maintenance
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1. users
-- Dedicated purely to authentication and credentials.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'STUDENT',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_users_role CHECK (role IN ('STUDENT'))
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. student_profiles
-- Academic and personal identity linked 1:1 with users.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(120) NOT NULL,
    institution VARCHAR(150),
    department VARCHAR(100),
    current_year INTEGER,
    student_identifier VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_student_profiles_year CHECK (current_year IS NULL OR (current_year >= 1 AND current_year <= 5))
);

CREATE TRIGGER trg_student_profiles_updated_at
    BEFORE UPDATE ON student_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 3. study_materials
-- Metadata records for uploaded educational notes and documents.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_location TEXT NOT NULL,
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(150) NOT NULL,
    processing_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_study_materials_file_size CHECK (file_size_bytes >= 0),
    CONSTRAINT chk_study_materials_status CHECK (processing_status IN ('pending', 'completed', 'failed'))
);

CREATE TRIGGER trg_study_materials_updated_at
    BEFORE UPDATE ON study_materials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 4. study_kits
-- Modular student study units linking summaries, formulas, and flashcards.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS study_kits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    source_material_id UUID REFERENCES study_materials(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    unit VARCHAR(150),
    description TEXT,
    summary_content TEXT,
    formula_sheet JSONB,
    key_concepts JSONB,
    trap_alerts JSONB,
    is_remedial BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_study_kits_updated_at
    BEFORE UPDATE ON study_kits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. flashcards
-- Active recall cards adhering to spaced repetition intervals.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flashcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_kit_id UUID NOT NULL REFERENCES study_kits(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(150) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    key_concept VARCHAR(150),
    formula TEXT,
    difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
    mastery_state VARCHAR(30) NOT NULL DEFAULT 'learning',
    ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    next_review_due TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_flashcards_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard')),
    CONSTRAINT chk_flashcards_mastery CHECK (mastery_state IN ('learning', 'reviewing', 'mastered')),
    CONSTRAINT chk_flashcards_ease_factor CHECK (ease_factor >= 1.30),
    CONSTRAINT chk_flashcards_interval CHECK (interval_days >= 0),
    CONSTRAINT chk_flashcards_repetitions CHECK (repetitions >= 0)
);

-- ----------------------------------------------------------------------------
-- 6. flashcard_reviews
-- Immutable historical review ratings for spaced-repetition audits.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_flashcard_reviews_rating CHECK (rating >= 1 AND rating <= 4)
);

-- ----------------------------------------------------------------------------
-- 7. quizzes
-- Configurable exam papers and question bank templates.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    study_kit_id UUID REFERENCES study_kits(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    topic VARCHAR(150) NOT NULL,
    question_count INTEGER NOT NULL,
    time_limit_minutes INTEGER NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    is_diagnostic BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_quizzes_question_count CHECK (question_count IN (5, 10, 15, 20, 30, 50)),
    CONSTRAINT chk_quizzes_time_limit CHECK (time_limit_minutes IN (5, 10, 15, 30, 45, 60)),
    CONSTRAINT chk_quizzes_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard', 'mixed'))
);

-- ----------------------------------------------------------------------------
-- 8. quiz_questions
-- Questions composing a quiz paper with server-side authoritative answers.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    question_order INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(30) NOT NULL,
    options JSONB NOT NULL,
    correct_option_ids JSONB NOT NULL,
    explanation TEXT NOT NULL,
    formula_hint TEXT,
    cognitive_level VARCHAR(30) NOT NULL DEFAULT 'conceptual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_quiz_questions_order CHECK (question_order >= 1),
    CONSTRAINT chk_quiz_questions_type CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false')),
    CONSTRAINT uq_quiz_questions_order UNIQUE (quiz_id, question_order)
);

-- ----------------------------------------------------------------------------
-- 9. quiz_sessions
-- Live examination sessions with server-authoritative timestamps.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    server_deadline TIMESTAMPTZ NOT NULL,
    time_limit_seconds INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    submission_reason VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_quiz_sessions_time_limit CHECK (time_limit_seconds > 0),
    CONSTRAINT chk_quiz_sessions_status CHECK (status IN ('created', 'active', 'submitted', 'expired', 'auto_submitted')),
    CONSTRAINT chk_quiz_sessions_reason CHECK (
        submission_reason IS NULL OR 
        submission_reason IN ('manual', 'timeout', 'tab_switch', 'navigation', 'system')
    )
);

-- ----------------------------------------------------------------------------
-- 10. quiz_answers
-- Individual student choices recorded during an active session.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    selected_option_ids JSONB NOT NULL,
    time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_quiz_answers_session_question UNIQUE (session_id, question_id),
    CONSTRAINT chk_quiz_answers_time_spent CHECK (time_spent_seconds >= 0)
);

-- ----------------------------------------------------------------------------
-- 11. quiz_results
-- Immutable historical record of completed/graded quiz sessions.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quiz_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL UNIQUE REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
    total_questions INTEGER NOT NULL,
    attempted_questions INTEGER NOT NULL,
    correct_answers INTEGER NOT NULL,
    incorrect_answers INTEGER NOT NULL,
    skipped_questions INTEGER NOT NULL,
    score_obtained NUMERIC(6,2) NOT NULL,
    total_possible_score NUMERIC(6,2) NOT NULL,
    percentage NUMERIC(5,2) NOT NULL,
    time_taken_seconds INTEGER NOT NULL,
    submission_reason VARCHAR(30) NOT NULL,
    subject_breakdown JSONB NOT NULL,
    topic_breakdown JSONB NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_quiz_results_total_questions CHECK (total_questions > 0),
    CONSTRAINT chk_quiz_results_attempted CHECK (attempted_questions >= 0 AND attempted_questions <= total_questions),
    CONSTRAINT chk_quiz_results_correct CHECK (correct_answers >= 0 AND correct_answers <= total_questions),
    CONSTRAINT chk_quiz_results_incorrect CHECK (incorrect_answers >= 0 AND incorrect_answers <= total_questions),
    CONSTRAINT chk_quiz_results_skipped CHECK (skipped_questions >= 0 AND skipped_questions <= total_questions),
    CONSTRAINT chk_quiz_results_percentage CHECK (percentage >= 0.00 AND percentage <= 100.00),
    CONSTRAINT chk_quiz_results_time_taken CHECK (time_taken_seconds >= 0)
);

-- ----------------------------------------------------------------------------
-- 12. student_activity
-- Audit trail of learning sessions for streaks and activity hours.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,
    activity_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_student_activity_type CHECK (activity_type IN ('quiz_completed', 'flashcard_reviewed', 'material_uploaded')),
    CONSTRAINT chk_student_activity_duration CHECK (duration_seconds >= 0)
);

-- ============================================================================
-- INDEXES
-- Structured for high-frequency tenant-scoped queries and analytics.
-- ============================================================================

-- Student data isolation indexes (ensuring high performance for studentId filtering)
CREATE INDEX IF NOT EXISTS idx_study_materials_student_id ON study_materials(student_id);
CREATE INDEX IF NOT EXISTS idx_study_kits_student_id ON study_kits(student_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_student_id ON flashcards(student_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_study_kit_id ON flashcards(study_kit_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_student_id ON flashcard_reviews(student_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_flashcard_id ON flashcard_reviews(flashcard_id);

-- Quiz and active paper lookup indexes
CREATE INDEX IF NOT EXISTS idx_quizzes_student_id ON quizzes(student_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject_topic ON quizzes(subject, topic);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);

-- Session lifecycle and answer recording indexes
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_student_id ON quiz_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz_id ON quiz_sessions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_status ON quiz_sessions(status);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_session_id ON quiz_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_student_id ON quiz_answers(student_id);

-- Quiz history and performance analytics indexes
CREATE INDEX IF NOT EXISTS idx_quiz_results_student_id ON quiz_results(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_quiz_id ON quiz_results(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_submitted_at ON quiz_results(submitted_at);

-- Student activity & streak tracking indexes
CREATE INDEX IF NOT EXISTS idx_student_activity_student_id ON student_activity(student_id);
CREATE INDEX IF NOT EXISTS idx_student_activity_timestamp ON student_activity(activity_timestamp);
