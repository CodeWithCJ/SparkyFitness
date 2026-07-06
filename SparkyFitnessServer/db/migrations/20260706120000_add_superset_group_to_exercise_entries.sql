ALTER TABLE public.exercise_entries ADD COLUMN superset_group integer;
COMMENT ON COLUMN public.exercise_entries.superset_group IS
  'Client-assigned superset group key, scoped to the parent exercise_preset_entry. NULL = not in a superset. Members share the value and are kept adjacent via sort_order.';
