-- The original request remains immutable while its editable checkpoint advances.
-- Import retries can return prior work without re-fetching a page or image.
ALTER TABLE food_assistant_tasks
  ADD COLUMN IF NOT EXISTS origin jsonb NOT NULL DEFAULT '{"type":"user_draft"}'::jsonb
  CHECK (jsonb_typeof(origin) = 'object');
-- Existing owner-only task policies cover this column.
