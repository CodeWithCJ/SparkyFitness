-- Names of the fields a user edited on a synced exercise entry. A re-sent
-- provider workout (matched by source_id) leaves these fields alone.
-- NULL means nothing was edited, so untouched rows stay identical to before.
ALTER TABLE public.exercise_entries
  ADD COLUMN manual_fields text[];
