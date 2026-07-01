-- Migration: add onboarding_skipped column to onboarding_status
-- This persists the "skip" action so the wizard does not reappear after a page reload.

ALTER TABLE public.onboarding_status
  ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN NOT NULL DEFAULT FALSE;
