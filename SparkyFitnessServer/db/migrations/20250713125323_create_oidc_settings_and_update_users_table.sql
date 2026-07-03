-- Migration for OIDC Settings Table and Users Table Update

-- Create oidc_settings table
CREATE TABLE oidc_settings (
    id SERIAL PRIMARY KEY,
    issuer_url TEXT NOT NULL,
    client_id TEXT NOT NULL,
    encrypted_client_secret TEXT,
    client_secret_iv TEXT,
    client_secret_tag TEXT,
    redirect_uris TEXT[] NOT NULL,
    scope TEXT NOT NULL,
    token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_post',
    response_types TEXT[] NOT NULL DEFAULT ARRAY['code'],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add oidc_sub column to users table
ALTER TABLE auth.users
ADD COLUMN oidc_sub TEXT UNIQUE;

-- Add a function to update updated_at column automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for oidc_settings table
CREATE TRIGGER update_oidc_settings_updated_at
BEFORE UPDATE ON oidc_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for users table (if not already exists)
-- Assuming a trigger for users.updated_at might already exist.
-- If not, you would add:
-- CREATE TRIGGER update_users_updated_at
-- BEFORE UPDATE ON auth.users
-- FOR EACH ROW
-- EXECUTE FUNCTION update_updated_at_column();