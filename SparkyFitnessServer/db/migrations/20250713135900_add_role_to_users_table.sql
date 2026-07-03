-- Migration to add 'role' column to auth.users table

ALTER TABLE auth.users
ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user';

-- Optionally, update existing users to have the 'user' role
UPDATE auth.users
SET role = 'user'
WHERE role IS NULL;