-- Function to set the first user as admin
CREATE OR REPLACE FUNCTION set_first_user_as_admin()
RETURNS TRIGGER AS $$
BEGIN
    -- If there are no users in the table yet, this is the first user
    IF NOT EXISTS (SELECT 1 FROM "user") THEN
        NEW.role := 'admin';
        RAISE NOTICE 'First user detected: %, assigning admin role.', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute before insert on the user table
DROP TRIGGER IF EXISTS ensure_first_user_is_admin ON "user";
CREATE TRIGGER ensure_first_user_is_admin
BEFORE INSERT ON "user"
FOR EACH ROW
EXECUTE FUNCTION set_first_user_as_admin();
