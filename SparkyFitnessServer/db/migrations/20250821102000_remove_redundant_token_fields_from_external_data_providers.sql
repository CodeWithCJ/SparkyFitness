-- Remove redundant token-related fields from external_data_providers
ALTER TABLE external_data_providers
DROP COLUMN encrypted_access_token,
DROP COLUMN access_token_iv,
DROP COLUMN access_token_tag,
DROP COLUMN encrypted_refresh_token,
DROP COLUMN refresh_token_iv,
DROP COLUMN refresh_token_tag;