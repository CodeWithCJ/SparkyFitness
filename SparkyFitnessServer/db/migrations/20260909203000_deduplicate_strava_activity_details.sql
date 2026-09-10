-- Remove recognized duplicate Strava snapshots left by repeated imports.
-- Keep complete detail ahead of summaries, then the latest acquired snapshot.
-- Preserve creator boundaries and leave an entire group untouched if any
-- snapshot has an unknown shape, activity identity, resource state or creator.
BEGIN;

-- Match the runtime writer's parent-before-detail lock order. Reads continue;
-- parent updates and detail writes wait until survivor selection commits.
LOCK TABLE public.exercise_entries IN SHARE MODE;
LOCK TABLE public.exercise_entry_activity_details IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT d.id,
         BOOL_AND(COALESCE(
           d.created_by_user_id IS NOT NULL
           AND jsonb_typeof(d.detail_data) = 'object'
           AND d.detail_data->>'id' ~ '^[1-9][0-9]*$'
           AND d.detail_data->>'id' = e.source_id
           AND d.detail_data->'resource_state' IN ('2'::jsonb, '3'::jsonb),
           false
         )) OVER source_group AS recognized_group,
         ROW_NUMBER() OVER (
           source_group ORDER BY (d.detail_data->'resource_state' = '3'::jsonb) DESC,
                                 d.created_at DESC NULLS LAST, d.id DESC
         ) AS position
  FROM public.exercise_entry_activity_details d
  JOIN public.exercise_entries e ON e.id = d.exercise_entry_id
  WHERE d.provider_name = 'Strava'
    AND d.detail_type = 'full_activity_data'
    AND d.exercise_preset_entry_id IS NULL
    AND e.source = 'Strava'
  WINDOW source_group AS (PARTITION BY d.exercise_entry_id, d.created_by_user_id)
)
DELETE FROM public.exercise_entry_activity_details d
USING ranked r
WHERE d.id = r.id AND r.recognized_group AND r.position > 1;

COMMIT;
