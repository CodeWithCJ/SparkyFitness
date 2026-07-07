ALTER TABLE public.workout_preset_exercises ADD COLUMN superset_group integer;
COMMENT ON COLUMN public.workout_preset_exercises.superset_group IS
  'Client-assigned superset group key, scoped to the parent workout preset. NULL = not in a superset. Members share the value and are kept adjacent via sort_order.';
