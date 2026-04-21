-- Scope the exercises (source, source_id) uniqueness to each user so that
-- multiple users can import the same external-source exercise (e.g. the same
-- Free-Exercise-DB entry) into their own per-user copies.

DROP INDEX IF EXISTS idx_exercises_source_source_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_user_source_source_id_unique
ON exercises (user_id, source, source_id)
WHERE source IS NOT NULL AND source_id IS NOT NULL;
