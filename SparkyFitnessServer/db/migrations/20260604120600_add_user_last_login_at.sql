-- Migration to add last_login_at column to user table
-- Created at: 2026-06-04 12:06:00

-- 1. Add the last_login_at column to the "user" table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- 2. Populate existing users' last_login_at with their most recent session's creation time
UPDATE "user" u
SET last_login_at = (
    SELECT MAX(created_at)
    FROM "session"
    WHERE user_id = u.id
)
WHERE last_login_at IS NULL;
