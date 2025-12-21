-- Migration: drop mood_entry_id and weight_at_end from fasting_logs
-- This removes duplicate storage of mood and weight in fasting_logs; mood entries remain in mood_entries table.

BEGIN;

ALTER TABLE IF EXISTS fasting_logs
    DROP COLUMN IF EXISTS mood_entry_id,
    DROP COLUMN IF EXISTS weight_at_end;

COMMIT;
