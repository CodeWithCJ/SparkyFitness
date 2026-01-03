-- Add current_stage column for granular progress tracking
ALTER TABLE public.garmin_sync_jobs
  ADD COLUMN IF NOT EXISTS current_stage VARCHAR(100);

COMMENT ON COLUMN public.garmin_sync_jobs.current_stage IS 'Current processing stage within a chunk (e.g., "Fetching health data", "Processing activities")';
