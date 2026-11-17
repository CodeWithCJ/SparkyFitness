-- Migration: Add feature_choices to user_preferences
-- Description: Optional features (#3487) can be turned on or off per person in
-- Settings -> Features, separately for the website and the mobile app. This
-- column stores only the choices a person made, one map per platform
-- ({"web": {...}, "mobile": {...}}): a missing platform or key means the
-- default from the shared OPTIONAL_FEATURES registry, so a feature can ship on
-- or off without another migration, and no backfill is needed. Cycle tracking
-- keeps its own switch in cycle_settings.enabled, so 'cycle' is never stored
-- here. UI only: no route reads it to block access.
-- Date: 2026-11-13

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS feature_choices JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Constraints from an earlier draft of this migration (one map for the whole
-- account) are replaced below.
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_feature_choices_is_object;
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_feature_choices_no_cycle;
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_feature_choices_platforms;

-- Only development databases that ran that draft can hold a value of another
-- shape; it never shipped, so those choices are dropped rather than guessed.
UPDATE public.user_preferences
   SET feature_choices = '{}'::jsonb
 WHERE jsonb_typeof(feature_choices) <> 'object'
    OR (feature_choices - 'web' - 'mobile') <> '{}'::jsonb
    OR jsonb_typeof(COALESCE(feature_choices -> 'web', '{}'::jsonb)) <> 'object'
    OR jsonb_typeof(COALESCE(feature_choices -> 'mobile', '{}'::jsonb)) <> 'object';

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_feature_choices_platforms
    CHECK (
      jsonb_typeof(feature_choices) = 'object'
      AND (feature_choices - 'web' - 'mobile') = '{}'::jsonb
      AND jsonb_typeof(COALESCE(feature_choices -> 'web', '{}'::jsonb)) = 'object'
      AND jsonb_typeof(COALESCE(feature_choices -> 'mobile', '{}'::jsonb)) = 'object'
    );

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_feature_choices_no_cycle
    CHECK (
      NOT (COALESCE(feature_choices -> 'web', '{}'::jsonb) ? 'cycle')
      AND NOT (COALESCE(feature_choices -> 'mobile', '{}'::jsonb) ? 'cycle')
    );

COMMENT ON COLUMN public.user_preferences.feature_choices IS
  'Explicit on/off choices for optional features, one map per platform ({"web": {...}, "mobile": {...}}), keyed by feature id (the shared OPTIONAL_FEATURES registry; well-formed ids a newer app knows are kept too). A missing platform or key uses the registry default; cycle is never stored here. Read and written only through /api/user-preferences/features. UI only: no route reads it to block access.';
