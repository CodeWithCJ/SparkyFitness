-- Migration to create admin_activity_logs table

CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action_type VARCHAR(255) NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


ALTER TABLE auth.users
ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- Update the updated_at column for existing users to reflect this change
UPDATE auth.users
SET updated_at = NOW();


-- Migration to add last_login_at column to auth.users table

ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;