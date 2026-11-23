-- Provider identity belongs to a logged session, independently of its title or day.
-- Legacy Hevy sessions are adopted through their child source IDs on the next sync.
ALTER TABLE public.exercise_preset_entries
  ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_preset_entries_provider_identity_idx
  ON public.exercise_preset_entries (user_id, source, source_id)
  WHERE source_id IS NOT NULL;
