ALTER TABLE public.exercise_entry_sets ADD COLUMN completed_at timestamptz;
COMMENT ON COLUMN public.exercise_entry_sets.completed_at IS
  'Client-recorded moment the set was checked off during a live workout. NULL = not completed.';
