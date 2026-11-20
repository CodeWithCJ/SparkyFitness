-- Migration: Alter verification.id from UUID to TEXT
-- Better Auth 1.7+ requires string/text IDs for verification records because it
-- reserves internal cleanup and mutex records with deterministic base64url
-- SHA-256 strings (such as `revoke-unproven-account-access:<userId>`), which
-- fail with error 22P02 string_to_uuid when id is UUID.

ALTER TABLE "verification"
  ALTER COLUMN id DROP DEFAULT,
  ALTER COLUMN id TYPE text USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
