ALTER TABLE public.exercise_entry_sets ADD COLUMN is_pr boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.exercise_entry_sets.is_pr IS
  'Whether this set was a personal record (heavier than the prior best weight, or more reps at the top weight) when checked off during a live workout. Warmup sets never earn PRs.';
