-- Migration: Add feature_choices to user_preferences
-- Description: Optional features (#3487) can be turned on or off per person in
-- Settings -> Features. This column stores only the choices a person made: a
-- missing key means the default from the shared OPTIONAL_FEATURES registry, so
-- a feature can ship on or off without another migration, and no backfill is
-- needed. Cycle tracking keeps its own switch in cycle_settings.enabled, so
-- 'cycle' is never stored here. UI only: no route reads it to block access.
-- Date: 2026-11-09

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS feature_choices JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_feature_choices_is_object;
ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_feature_choices_is_object
    CHECK (jsonb_typeof(feature_choices) = 'object');

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_feature_choices_no_cycle;
ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_feature_choices_no_cycle
    CHECK (NOT (feature_choices ? 'cycle'));

COMMENT ON COLUMN public.user_preferences.feature_choices IS
  'Explicit on/off choices for optional features, keyed by feature id (the shared OPTIONAL_FEATURES registry; well-formed ids a newer app knows are kept too). A missing key uses the registry default; cycle is never stored here. Written only by PATCH /api/user-preferences/features. UI only: no route reads it to block access.';
