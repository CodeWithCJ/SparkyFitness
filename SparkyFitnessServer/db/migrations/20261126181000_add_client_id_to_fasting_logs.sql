-- Migration: Add client_id to fasting_logs for idempotent fast starts
--
-- Replayable watch/mobile clients mint a UUID per fast start (`client_id`) so
-- a retried POST /api/fasting/start after a lost response returns the already-
-- created fasting_logs row (active or completed) instead of failing with 400
-- "There is already an active fast" or creating a duplicate fast.
--
-- Partial unique index: rows written by clients that do not pass client_id
-- stay NULL and unconstrained.
ALTER TABLE public.fasting_logs
  ADD COLUMN IF NOT EXISTS client_id uuid;

COMMENT ON COLUMN public.fasting_logs.client_id IS 'Client-minted idempotency key from replayable clients. NULL for fasts not created with a client key.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fasting_logs_user_client_id
  ON public.fasting_logs USING btree (user_id, client_id)
  WHERE client_id IS NOT NULL;
