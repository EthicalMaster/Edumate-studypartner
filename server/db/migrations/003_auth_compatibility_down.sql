-- ============================================================================
-- Migration: 003_auth_compatibility_down.sql
-- Description: Reverts auth compatibility additions
-- ============================================================================

DROP INDEX IF EXISTS idx_users_auth_provider;
DROP INDEX IF EXISTS idx_users_email_verified;

ALTER TABLE users
    DROP COLUMN IF EXISTS auth_provider,
    DROP COLUMN IF EXISTS email_verified;

ALTER TABLE users
    ALTER COLUMN password_hash SET NOT NULL;
