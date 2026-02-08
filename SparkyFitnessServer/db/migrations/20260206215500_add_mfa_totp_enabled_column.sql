-- Migration to add mfa_totp_enabled column and RESET all MFA states
-- Created at: 2026-02-06 22:52:00

-- 1. Add the new column
ALTER TABLE "user" ADD COLUMN mfa_totp_enabled BOOLEAN DEFAULT false;

-- 2. RESET all MFA-related flags to false for a clean start
UPDATE "user" 
SET 
    two_factor_enabled = false,
    mfa_totp_enabled = false,
    mfa_email_enabled = false,
    mfa_enforced = false,
    email_mfa_code = NULL,
    email_mfa_expires_at = NULL;

-- 3. Delete all configured TOTP secrets and backup codes
TRUNCATE TABLE "two_factor";

-- 4. Disable global mandatory MFA policy for a truly fresh start
UPDATE "global_settings" SET mfa_mandatory = false WHERE id = 1;
