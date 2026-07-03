-- Migration: Consolidated Better Auth MFA Optimization
-- Created: 2026-03-22 13:00:00
-- Description: Drops the over-eager TOTP sync trigger and redundant Email MFA columns.
-- Replaces previous uncommitted migrations: 20260322124500, 20260322124800, 20260322125500.

-- 1. Drop redundant MFA synchronization logic
-- These triggers and functions are now replaced by auth.js hooks or Better Auth native logic.
DROP TRIGGER IF EXISTS trg_sync_user_totp_flag ON "two_factor";
DROP TRIGGER IF EXISTS trg_sync_user_mfa_master_flag ON "user";
DROP FUNCTION IF EXISTS sync_user_totp_flag();
DROP FUNCTION IF EXISTS sync_user_mfa_master_flag();

-- 2. Drop redundant custom columns on the "user" table
-- These are now handled internally by Better Auth in the verification table.
ALTER TABLE "user" 
DROP COLUMN IF EXISTS email_mfa_code,
DROP COLUMN IF EXISTS email_mfa_expires_at;

-- 3. Initialize mfa_totp_enabled flag for any existing users
-- For existing users, we assume they are verified if they had the master flag enabled and a secret exists.
UPDATE "user" u
SET mfa_totp_enabled = (EXISTS (SELECT 1 FROM "two_factor" tf WHERE tf.user_id = u.id AND tf.secret IS NOT NULL) AND u.two_factor_enabled = TRUE);
