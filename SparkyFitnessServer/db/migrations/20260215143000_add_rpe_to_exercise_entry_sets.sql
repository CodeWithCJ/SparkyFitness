-- SparkyFitnessServer/db/migrations/20260215143000_add_rpe_to_exercise_entry_sets.sql

ALTER TABLE public.exercise_entry_sets ADD COLUMN rpe numeric(3, 1);

COMMENT ON COLUMN public.exercise_entry_sets.rpe IS 'Rate of Perceived Exertion (usually 1-10 scale)';
