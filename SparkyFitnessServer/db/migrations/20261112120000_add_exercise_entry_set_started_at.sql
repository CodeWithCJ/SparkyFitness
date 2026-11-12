-- When a set was started (#2840).
-- Re-runnable: ADD COLUMN IF NOT EXISTS.
--
-- completed_at records when a set was checked off. started_at records when the
-- person started it, so the rest actually taken (previous set completed_at ->
-- started_at) and the time spent on the set (started_at -> completed_at) can be
-- told apart. rest_time stays the planned rest. No backfill: older sets and
-- sets without a recorded start stay NULL.

ALTER TABLE public.exercise_entry_sets ADD COLUMN IF NOT EXISTS started_at timestamptz;
COMMENT ON COLUMN public.exercise_entry_sets.started_at IS
  'Client-recorded moment the set was started during a live workout. NULL = no start recorded. An update that omits the field keeps the stored value.';
