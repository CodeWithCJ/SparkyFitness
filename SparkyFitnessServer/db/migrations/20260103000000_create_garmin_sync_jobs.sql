-- Create garmin_sync_jobs table for tracking background sync jobs
CREATE TABLE IF NOT EXISTS public.garmin_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job configuration
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  sync_type VARCHAR(20) NOT NULL,
  metric_types TEXT[],

  -- Progress tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  current_chunk_start DATE,
  current_chunk_end DATE,
  chunks_completed INTEGER DEFAULT 0,
  chunks_total INTEGER,
  last_successful_date DATE,

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Error handling
  error_message TEXT,
  failed_chunks JSONB DEFAULT '[]',

  CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  CONSTRAINT valid_sync_type CHECK (sync_type IN ('incremental', 'historical'))
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_garmin_sync_jobs_user_status ON public.garmin_sync_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_garmin_sync_jobs_user_created ON public.garmin_sync_jobs(user_id, created_at DESC);

-- RLS policies
ALTER TABLE public.garmin_sync_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS garmin_sync_jobs_select_policy ON public.garmin_sync_jobs;
CREATE POLICY garmin_sync_jobs_select_policy
  ON public.garmin_sync_jobs FOR SELECT
  USING (user_id = current_setting('app.user_id', true)::uuid);

DROP POLICY IF EXISTS garmin_sync_jobs_insert_policy ON public.garmin_sync_jobs;
CREATE POLICY garmin_sync_jobs_insert_policy
  ON public.garmin_sync_jobs FOR INSERT
  WITH CHECK (user_id = current_setting('app.user_id', true)::uuid);

DROP POLICY IF EXISTS garmin_sync_jobs_update_policy ON public.garmin_sync_jobs;
CREATE POLICY garmin_sync_jobs_update_policy
  ON public.garmin_sync_jobs FOR UPDATE
  USING (user_id = current_setting('app.user_id', true)::uuid);

DROP POLICY IF EXISTS garmin_sync_jobs_delete_policy ON public.garmin_sync_jobs;
CREATE POLICY garmin_sync_jobs_delete_policy
  ON public.garmin_sync_jobs FOR DELETE
  USING (user_id = current_setting('app.user_id', true)::uuid);

-- Add last_successful_sync_date to external_data_providers
ALTER TABLE external_data_providers
  ADD COLUMN IF NOT EXISTS last_successful_sync_date DATE;
