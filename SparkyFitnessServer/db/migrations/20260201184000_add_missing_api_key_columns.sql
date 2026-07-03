-- Migration: Add Missing Better Auth API Key Columns
-- Description: Adds columns required by the latest Better Auth apiKey plugin

ALTER TABLE public.api_key 
ADD COLUMN IF NOT EXISTS start TEXT,
ADD COLUMN IF NOT EXISTS prefix TEXT,
ADD COLUMN IF NOT EXISTS refill_interval INTEGER,
ADD COLUMN IF NOT EXISTS refill_amount INTEGER,
ADD COLUMN IF NOT EXISTS last_refill_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS rate_limit_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS rate_limit_time_window INTEGER,
ADD COLUMN IF NOT EXISTS rate_limit_max INTEGER,
ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining INTEGER,
ADD COLUMN IF NOT EXISTS last_request TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS permissions TEXT;

-- Index for faster lookups by prefix if used
CREATE INDEX IF NOT EXISTS idx_api_key_prefix ON public.api_key(prefix);
