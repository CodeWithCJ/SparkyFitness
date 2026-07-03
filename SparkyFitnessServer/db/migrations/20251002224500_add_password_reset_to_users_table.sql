ALTER TABLE auth.users
ADD COLUMN password_reset_token VARCHAR(255),
ADD COLUMN password_reset_expires BIGINT;