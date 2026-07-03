-- Migration to add email/password login management to the oidc_settings table

ALTER TABLE oidc_settings
ADD COLUMN enable_email_password_login BOOLEAN DEFAULT TRUE;