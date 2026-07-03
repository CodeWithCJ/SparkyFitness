-- Migration: Robust MFA Synchronization Triggers
-- Description: Ensures mfa_totp_enabled and mfa_email_enabled stay in sync even if hooks fail.

-- 1. Function to sync flags when two_factor table changes
CREATE OR REPLACE FUNCTION fn_sync_mfa_totp_flag()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE "user" SET mfa_totp_enabled = TRUE WHERE id = NEW.user_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE "user" SET mfa_totp_enabled = FALSE WHERE id = OLD.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger for the two_factor table
DROP TRIGGER IF EXISTS trg_sync_mfa_totp ON "two_factor";
CREATE TRIGGER trg_sync_mfa_totp
AFTER INSERT OR DELETE ON "two_factor"
FOR EACH ROW EXECUTE FUNCTION fn_sync_mfa_totp_flag();

-- 3. Function to sync flags when user table's two_factor_enabled is updated
CREATE OR REPLACE FUNCTION fn_sync_user_mfa_global()
RETURNS TRIGGER AS $$
BEGIN
    -- If global 2FA is turned off, force our custom flags to false
    IF (NEW.two_factor_enabled = FALSE AND OLD.two_factor_enabled = TRUE) THEN
        NEW.mfa_totp_enabled := FALSE;
        NEW.mfa_email_enabled := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger for the user table
DROP TRIGGER IF EXISTS trg_sync_user_mfa_global ON "user";
CREATE TRIGGER trg_sync_user_mfa_global
BEFORE UPDATE OF two_factor_enabled ON "user"
FOR EACH ROW EXECUTE FUNCTION fn_sync_user_mfa_global();

-- 5. Final cleanup of any potential out-of-sync state
UPDATE "user" u
SET mfa_totp_enabled = (EXISTS (SELECT 1 FROM "two_factor" tf WHERE tf.user_id = u.id))
WHERE u.two_factor_enabled = TRUE;

UPDATE "user"
SET mfa_totp_enabled = FALSE, mfa_email_enabled = FALSE
WHERE two_factor_enabled = FALSE;
