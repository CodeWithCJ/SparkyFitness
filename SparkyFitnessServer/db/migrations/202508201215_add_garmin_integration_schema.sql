-- Migration for Garmin Connect Integration (POC - Minimal Schema Changes)

-- Add columns for Garmin OAuth tokens and external user ID to external_data_providers table
-- These are specific to OAuth tokens and cannot be reused from app_id/app_key fields.
ALTER TABLE external_data_providers
ADD COLUMN encrypted_access_token TEXT,
ADD COLUMN access_token_iv TEXT,
ADD COLUMN access_token_tag TEXT,
ADD COLUMN encrypted_refresh_token TEXT,
ADD COLUMN refresh_token_iv TEXT,
ADD COLUMN refresh_token_tag TEXT,
ADD COLUMN token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN external_user_id TEXT;