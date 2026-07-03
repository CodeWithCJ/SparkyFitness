-- Add missing image column to user table for Better Auth OIDC integration
-- This column is required for syncing profile pictures from SSO providers

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "image" TEXT;

COMMENT ON COLUMN "user"."image" IS 'Profile image URL synced from Better Auth / OIDC providers';
