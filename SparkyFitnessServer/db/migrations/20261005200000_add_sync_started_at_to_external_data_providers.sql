-- Migration: Track a running sync on each external data provider
-- File: SparkyFitnessServer/db/migrations/20261005200000_add_sync_started_at_to_external_data_providers.sql
--
-- A sync claims its provider row by setting sync_started_at and clears it when
-- it finishes, so a second sync for the same account is skipped instead of
-- saving the same data again. NULL means no sync is running.


ALTER TABLE public.external_data_providers
  ADD COLUMN IF NOT EXISTS sync_started_at TIMESTAMPTZ NULL;

