-- ============================================================================
-- Migration: 003_auth_compatibility.sql
-- Description: Adds email_verified and auth_provider columns to users table.
--              Prepares users schema for future Google Sign-In compatibility.
-- ============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) NOT NULL DEFAULT 'local';

-- Allow NULL password_hash for future federated/Google Sign-In accounts
-- (Local email/password registrations remain strictly validated in application layer)
ALTER TABLE users
    ALTER COLUMN password_hash DROP NOT NULL;

-- Indexes for rapid lookup by verification state and auth provider
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
