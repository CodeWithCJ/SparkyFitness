-- Migration: Add Better Auth API Key Table
-- Description: Creates the 'api_key' table required by Better Auth and migrates data from legacy 'user_api_keys'

-- Step 1: Create the new 'api_key' table
CREATE TABLE IF NOT EXISTS public.api_key (
    id TEXT PRIMARY KEY,
    name TEXT,
    key TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster lookups by key
CREATE INDEX IF NOT EXISTS idx_api_key_key ON public.api_key(key);
-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_api_key_user_id ON public.api_key(user_id);

-- Step 2: Cleanup legacy 'user_api_keys' table
DROP TABLE IF EXISTS public.user_api_keys CASCADE;

-- Step 3: Cleanup legacy functions associated with user_api_keys
DROP FUNCTION IF EXISTS public.generate_user_api_key(uuid, text);
DROP FUNCTION IF EXISTS public.revoke_all_user_api_keys(uuid);
DROP FUNCTION IF EXISTS public.revoke_user_api_key(uuid, text);

-- Note: We keep public.user_api_keys for safety for now, 
-- but mark it as deprecated in our minds.
COMMENT ON TABLE public.api_key IS 'Better Auth API key table - replaces legacy user_api_keys';
