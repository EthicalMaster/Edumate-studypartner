-- ============================================================================
-- AVEN MIGRATION 015: REAL NOTIFICATION SYSTEM
-- Strict student-isolated, database-backed notifications for learning events
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_student_created ON notifications(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_student_unread ON notifications(student_id, is_read) WHERE is_read = FALSE;
