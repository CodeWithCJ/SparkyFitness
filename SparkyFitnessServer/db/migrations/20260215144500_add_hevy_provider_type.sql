-- SparkyFitnessServer/db/migrations/20260215144500_add_hevy_provider_type.sql

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES ('hevy', 'Hevy', 'Workout tracking app integration via API Key')
ON CONFLICT (id) DO NOTHING;



ALTER TABLE public.exercise_entry_sets ADD COLUMN rpe numeric(3, 1);

COMMENT ON COLUMN public.exercise_entry_sets.rpe IS 'Rate of Perceived Exertion (usually 1-10 scale)';
