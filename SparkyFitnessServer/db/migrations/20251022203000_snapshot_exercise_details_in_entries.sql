-- Add new columns to exercise_entries for snapshotting exercise details
ALTER TABLE public.exercise_entries
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS source VARCHAR(50),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS force VARCHAR(50),
    ADD COLUMN IF NOT EXISTS level VARCHAR(50),
    ADD COLUMN IF NOT EXISTS mechanic VARCHAR(50),
    ADD COLUMN IF NOT EXISTS equipment TEXT,
    ADD COLUMN IF NOT EXISTS primary_muscles TEXT,
    ADD COLUMN IF NOT EXISTS secondary_muscles TEXT,
    ADD COLUMN IF NOT EXISTS instructions TEXT,
    ADD COLUMN IF NOT EXISTS images TEXT;

-- Backfill the new snapshot columns for existing exercise entries
UPDATE public.exercise_entries ee
SET
    category = e.category,
    source = e.source,
    source_id = e.source_id,
    force = e.force,
    level = e.level,
    mechanic = e.mechanic,
    equipment = e.equipment,
    primary_muscles = e.primary_muscles,
    secondary_muscles = e.secondary_muscles,
    instructions = e.instructions,
    images = e.images
FROM public.exercises e
WHERE ee.exercise_id = e.id
  -- Only update rows where the snapshot data hasn't been filled yet
  AND ee.category IS NULL;
