-- Migration to create a dedicated table for global authentication settings

-- 1. Create the new `global_settings` table
CREATE TABLE global_settings (
    id INT PRIMARY KEY DEFAULT 1,
    enable_email_password_login BOOLEAN NOT NULL DEFAULT TRUE,
    is_oidc_active BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row_check CHECK (id = 1)
);

-- 2. Add a trigger for the new table
CREATE TRIGGER update_global_settings_updated_at
BEFORE UPDATE ON global_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 3. Insert the default settings row
INSERT INTO global_settings (id) VALUES (1);
