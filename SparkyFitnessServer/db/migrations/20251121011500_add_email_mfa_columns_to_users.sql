-- Migration: 20251121011500_add_email_mfa_columns_to_users.sql

-- Add email MFA related columns to auth.users
ALTER TABLE auth.users
ADD COLUMN email_mfa_code TEXT,
ADD COLUMN email_mfa_expires_at TIMESTAMP WITH TIME ZONE;