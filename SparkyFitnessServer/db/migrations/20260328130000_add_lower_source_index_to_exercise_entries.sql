-- Migration: add function-based index on LOWER(source) for exercise_entries
-- Ensures LOWER(source) <> 'manual' filter in cross-source dedup stays performant.

CREATE INDEX IF NOT EXISTS idx_exercise_entries_lower_source
  ON exercise_entries (LOWER(source));
