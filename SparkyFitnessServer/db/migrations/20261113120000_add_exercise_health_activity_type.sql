-- #1750: which Apple Health / Health Connect activity type an exercise is
-- written as. NULL means "Automatic" (guessed from name, category and
-- modality by the shared resolveHealthActivityType), so existing rows need no
-- backfill. The value is a key of HEALTH_ACTIVITY_TYPE_TARGETS in
-- shared/src/constants/healthActivityTypes.ts; the server checks the key list
-- on write, and this CHECK only guards the shape so adding a key never needs
-- another migration. Diary entries copy the value when they are created,
-- like their other snapshot columns, so a workout keeps its type after the
-- library exercise is deleted. No new table, so RLS policies are unchanged.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS health_activity_type text;

ALTER TABLE exercises
  DROP CONSTRAINT IF EXISTS exercises_health_activity_type_format_check;

ALTER TABLE exercises
  ADD CONSTRAINT exercises_health_activity_type_format_check
  CHECK (
    health_activity_type IS NULL
    OR health_activity_type ~ '^[a-z][a-z_]{1,39}$'
  );

COMMENT ON COLUMN exercises.health_activity_type IS
  'Apple Health / Health Connect activity type key for write-back (#1750); NULL = automatic.';

ALTER TABLE exercise_entries
  ADD COLUMN IF NOT EXISTS health_activity_type text;

ALTER TABLE exercise_entries
  DROP CONSTRAINT IF EXISTS exercise_entries_health_activity_type_format_check;

ALTER TABLE exercise_entries
  ADD CONSTRAINT exercise_entries_health_activity_type_format_check
  CHECK (
    health_activity_type IS NULL
    OR health_activity_type ~ '^[a-z][a-z_]{1,39}$'
  );

COMMENT ON COLUMN exercise_entries.health_activity_type IS
  'Snapshot of exercises.health_activity_type when the entry was created (#1750); used once the exercise is deleted.';
