-- Optional 1-5 energy and focus ratings on mood check-ins; NULL means not rated.
ALTER TABLE public.mood_entries ADD COLUMN IF NOT EXISTS energy_value SMALLINT;
ALTER TABLE public.mood_entries ADD COLUMN IF NOT EXISTS focus_value SMALLINT;
ALTER TABLE public.mood_entries DROP CONSTRAINT IF EXISTS mood_entries_energy_value_range;
ALTER TABLE public.mood_entries ADD CONSTRAINT mood_entries_energy_value_range
  CHECK (energy_value IS NULL OR energy_value BETWEEN 1 AND 5);
ALTER TABLE public.mood_entries DROP CONSTRAINT IF EXISTS mood_entries_focus_value_range;
ALTER TABLE public.mood_entries ADD CONSTRAINT mood_entries_focus_value_range
  CHECK (focus_value IS NULL OR focus_value BETWEEN 1 AND 5);
