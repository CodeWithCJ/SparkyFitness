-- Migration: 20251120011100_add_mfa_magic_link_columns.sql

-- Add MFA related columns to auth.users
ALTER TABLE auth.users
ADD COLUMN mfa_secret TEXT,
ADD COLUMN mfa_totp_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN mfa_email_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN mfa_recovery_codes JSONB,
ADD COLUMN mfa_enforced BOOLEAN DEFAULT FALSE;

-- Add magic link related columns to auth.users
ALTER TABLE auth.users
ADD COLUMN magic_link_token TEXT,
ADD COLUMN magic_link_expires TIMESTAMP WITH TIME ZONE;

-- Add mfa_mandatory column to global_settings
ALTER TABLE public.global_settings
ADD COLUMN mfa_mandatory BOOLEAN DEFAULT FALSE;

-- Optionally, add indexes for performance if needed for magic_link_token
CREATE INDEX idx_magic_link_token ON auth.users (magic_link_token);

-- Update the updated_at timestamp for auth.users and global_settings.
-- Assuming a trigger for updated_at exists, no explicit update needed here.
-- If not, a trigger should be added for auth.users.