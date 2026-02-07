-- Migration: Implement MFA synchronization triggers
-- Created: 2026-02-07 11:00:00

-- 1. Trigger function for User Table: Calculate master flag from sub-flags
CREATE OR REPLACE FUNCTION sync_user_mfa_master_flag()
RETURNS TRIGGER AS $$
BEGIN
    NEW.two_factor_enabled := (NEW.mfa_totp_enabled OR NEW.mfa_email_enabled);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger function for Two Factor Table: Sync TOTP flag to User table
CREATE OR REPLACE FUNCTION sync_user_totp_flag()
RETURNS TRIGGER AS $$
DECLARE
    target_user_id UUID;
    has_secret BOOLEAN;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_user_id := OLD.user_id;
    ELSE
        target_user_id := NEW.user_id;
    END IF;

    -- Check if a secret currently exists for this user
    SELECT EXISTS (SELECT 1 FROM "two_factor" WHERE user_id = target_user_id AND secret IS NOT NULL) INTO has_secret;

    -- Update the mfa_totp_enabled flag in the user table
    -- This will in turn trigger sync_user_mfa_master_flag via the BEFORE UPDATE trigger on user
    UPDATE "user" SET mfa_totp_enabled = has_secret WHERE id = target_user_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Apply Trigger 1: Before update on User table
DROP TRIGGER IF EXISTS trg_sync_user_mfa_master_flag ON "user";
CREATE TRIGGER trg_sync_user_mfa_master_flag
BEFORE UPDATE OF mfa_totp_enabled, mfa_email_enabled ON "user"
FOR EACH ROW
EXECUTE FUNCTION sync_user_mfa_master_flag();

-- 4. Apply Trigger 2: After insert/update/delete on Two Factor table
DROP TRIGGER IF EXISTS trg_sync_user_totp_flag ON "two_factor";
CREATE TRIGGER trg_sync_user_totp_flag
AFTER INSERT OR UPDATE OR DELETE ON "two_factor"
FOR EACH ROW
EXECUTE FUNCTION sync_user_totp_flag();

-- 5. Perform initial sync for all users
UPDATE "user" u
SET mfa_totp_enabled = EXISTS (SELECT 1 FROM "two_factor" tf WHERE tf.user_id = u.id AND tf.secret IS NOT NULL),
    two_factor_enabled = (EXISTS (SELECT 1 FROM "two_factor" tf WHERE tf.user_id = u.id AND tf.secret IS NOT NULL) OR u.mfa_email_enabled);
