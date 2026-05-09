-- Add logged_at column to track when the drink was actually consumed
-- (as opposed to created_at which tracks when it was logged in the app)
ALTER TABLE public.water_intake_log
    ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: set logged_at to created_at for existing rows
UPDATE public.water_intake_log SET logged_at = created_at WHERE logged_at = created_at;
