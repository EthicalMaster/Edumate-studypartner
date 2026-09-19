-- ============================================================================
-- Migration: 002_authentication_sessions_down.sql
-- Description: Rollback of user_sessions table
-- ============================================================================

DROP TABLE IF EXISTS user_sessions CASCADE;
