-- Add skip_existing column to garmin_sync_jobs table
ALTER TABLE public.garmin_sync_jobs
  ADD COLUMN IF NOT EXISTS skip_existing BOOLEAN DEFAULT true;
