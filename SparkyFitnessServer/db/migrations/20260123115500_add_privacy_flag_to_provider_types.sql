-- Migration: Add is_strictly_private flag to external_provider_types
-- Created at: 2026-01-23 11:55:00

-- 1. Add the privacy flag column
ALTER TABLE public.external_provider_types ADD COLUMN is_strictly_private BOOLEAN DEFAULT FALSE;

-- 2. Set the rules for the sensitive providers
UPDATE public.external_provider_types 
SET is_strictly_private = TRUE 
WHERE id IN ('fitbit', 'garmin', 'withings', 'health');
