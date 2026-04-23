-- Sleep stages now merge by natural key (entry_id, start_time, end_time) on re-sync
-- (issue #1180). Defensively dedupe legacy duplicates before adding the unique index.
--
-- Survivor rule: keep the row most recently touched. updated_at and created_at both have
-- DEFAULT CURRENT_TIMESTAMP but neither column is declared NOT NULL, so COALESCE through
-- both, falling back to epoch. Tiebreak on id only when timestamps are identical
-- (UUID order is random and uncorrelated with recency).
DELETE FROM sleep_entry_stages a
USING sleep_entry_stages b
WHERE a.entry_id = b.entry_id
  AND a.start_time = b.start_time
  AND a.end_time = b.end_time
  AND a.id <> b.id
  AND (
    COALESCE(a.updated_at, a.created_at, '1970-01-01'::timestamptz)
      < COALESCE(b.updated_at, b.created_at, '1970-01-01'::timestamptz)
    OR (
      COALESCE(a.updated_at, a.created_at, '1970-01-01'::timestamptz)
        = COALESCE(b.updated_at, b.created_at, '1970-01-01'::timestamptz)
      AND a.id < b.id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS sleep_entry_stages_entry_natural_key_idx
  ON public.sleep_entry_stages (entry_id, start_time, end_time);
