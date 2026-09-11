-- Daily active calories are cumulative totals, not additive workouts.
-- Retain the most recently written import, including downward corrections.
BEGIN;

-- Prevent edits and cascading child inserts while selecting complete groups.
LOCK TABLE public.exercise_entries IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.exercise_entry_activity_details,
           public.exercise_entry_sets,
           public.exercise_entry_laps,
           public.exercise_entry_gps_points,
           public.exercise_entry_hr_zones IN SHARE MODE;

WITH ranked AS (
  SELECT e.id,
         BOOL_OR(x.user_id <> e.user_id) OVER source_group AS shared_group,
         BOOL_AND(COALESCE(
           e.created_by_user_id = e.user_id
           AND (e.updated_by_user_id IS NULL OR e.updated_by_user_id = e.user_id)
           AND e.entry_date IS NOT NULL
           AND e.duration_minutes = 0
           AND e.calories_burned >= 0 AND e.calories_burned < 'Infinity'::numeric
           AND e.notes IN (
             'Active calories logged from ' || CASE WHEN e.source = 'HealthKit' THEN 'Apple Health' ELSE e.source END || '.',
             'Active calories logged from ' || CASE WHEN e.source = 'HealthKit' THEN 'Apple Health' ELSE e.source END || ' (updated).'
           )
           -- Extra snapshot fields distinguish edited entries from bare imports.
           AND jsonb_strip_nulls(to_jsonb(e) - ARRAY[
             'id', 'user_id', 'exercise_id', 'entry_date', 'duration_minutes',
             'calories_burned', 'notes', 'created_by_user_id', 'updated_by_user_id',
             'exercise_name', 'source', 'created_at', 'updated_at', 'sort_order'
           ]) = '{}'::jsonb
           AND COALESCE(e.sort_order, 0) = 0
           AND NOT EXISTS (SELECT 1 FROM public.exercise_entry_activity_details d WHERE d.exercise_entry_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM public.exercise_entry_sets s WHERE s.exercise_entry_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM public.exercise_entry_laps l WHERE l.exercise_entry_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM public.exercise_entry_gps_points g WHERE g.exercise_entry_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM public.exercise_entry_hr_zones h WHERE h.exercise_entry_id = e.id),
           false
         )) OVER source_group AS recognized_group,
         ROW_NUMBER() OVER (
           source_group ORDER BY e.updated_at DESC, e.calories_burned DESC,
                                 (x.user_id = e.user_id) DESC,
                                 e.created_at, e.id
         ) AS position
  FROM public.exercise_entries e
  JOIN public.exercises x ON x.id = e.exercise_id
  WHERE e.exercise_name = 'Active Calories'
    AND e.source IS NOT NULL AND e.source <> ''
  WINDOW source_group AS (PARTITION BY e.user_id, e.entry_date, e.source)
)
DELETE FROM public.exercise_entries e
USING ranked r
WHERE e.id = r.id AND r.shared_group AND r.recognized_group AND r.position > 1;

COMMIT;
