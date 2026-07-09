-- Columns supporting the reworked live workout session: supersets, set completion, and PR tracking.
-- IF NOT EXISTS keeps this a no-op on databases that applied these changes as individual migrations.

ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS superset_group integer;
COMMENT ON COLUMN public.exercise_entries.superset_group IS
  'Client-assigned superset group key, scoped to the parent exercise_preset_entry. NULL = not in a superset. Members share the value and are kept adjacent via sort_order.';

ALTER TABLE public.workout_preset_exercises ADD COLUMN IF NOT EXISTS superset_group integer;
COMMENT ON COLUMN public.workout_preset_exercises.superset_group IS
  'Client-assigned superset group key, scoped to the parent workout preset. NULL = not in a superset. Members share the value and are kept adjacent via sort_order.';

ALTER TABLE public.exercise_entry_sets ADD COLUMN IF NOT EXISTS completed_at timestamptz;
COMMENT ON COLUMN public.exercise_entry_sets.completed_at IS
  'Client-recorded moment the set was checked off during a live workout. NULL = not completed.';

ALTER TABLE public.exercise_entry_sets ADD COLUMN IF NOT EXISTS is_pr boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.exercise_entry_sets.is_pr IS
  'Whether this set was a personal record (heavier than the prior best weight, or more reps at the top weight) when checked off during a live workout. Warmup sets never earn PRs.';
