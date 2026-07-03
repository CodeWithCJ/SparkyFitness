-- Add column to store the full encrypted Garth token dump
ALTER TABLE external_data_providers
ADD COLUMN encrypted_garth_dump TEXT,
ADD COLUMN garth_dump_iv TEXT,
ADD COLUMN garth_dump_tag TEXT;

-- Optionally, remove old token columns if they are no longer needed
-- This is commented out for now to avoid data loss during transition
-- ALTER TABLE external_data_providers
-- DROP COLUMN encrypted_access_token,
-- DROP COLUMN access_token_iv,
-- DROP COLUMN access_token_tag,
-- DROP COLUMN encrypted_refresh_token,
-- DROP COLUMN refresh_token_iv,
-- DROP COLUMN refresh_token_tag,
-- DROP COLUMN token_expires_at,
-- DROP COLUMN external_user_id;