ALTER TABLE public.exercise_entries
  ADD COLUMN water_estimated integer;

ALTER TABLE public.user_preferences
  ADD COLUMN add_exercise_water_to_goal boolean NOT NULL DEFAULT false;

-- Backfill existing Garmin activities from the raw JSONB data
UPDATE exercise_entries ee
SET water_estimated = ROUND((ead.detail_data->'activity'->>'waterEstimated')::numeric)
FROM exercise_entry_activity_details ead
WHERE ead.exercise_entry_id = ee.id
  AND ead.provider_name = 'garmin'
  AND ead.detail_data->'activity'->>'waterEstimated' IS NOT NULL
  AND ee.water_estimated IS NULL;
