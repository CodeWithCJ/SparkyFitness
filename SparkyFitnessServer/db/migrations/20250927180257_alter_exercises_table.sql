-- Migration: 20250927_180257_alter_exercises_table.sql

-- Add new columns to the exercises table
ALTER TABLE exercises
ADD COLUMN source VARCHAR(50),
ADD COLUMN source_id VARCHAR(255),
ADD COLUMN force VARCHAR(50),
ADD COLUMN level VARCHAR(50),
ADD COLUMN mechanic VARCHAR(50),
ADD COLUMN equipment TEXT, -- Stored as JSON array of strings
ADD COLUMN primary_muscles TEXT, -- Stored as JSON array of strings
ADD COLUMN secondary_muscles TEXT, -- Stored as JSON array of strings
ADD COLUMN instructions TEXT, -- Stored as JSON array of strings
ADD COLUMN images TEXT; -- Stored as JSON array of URLs (local paths after download)

-- Add a unique constraint for source and source_id, allowing nulls for manual entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_source_source_id_unique
ON exercises (source, source_id)
WHERE source IS NOT NULL AND source_id IS NOT NULL;

-- Add an index for faster lookups by source
CREATE INDEX IF NOT EXISTS idx_exercises_source ON exercises (source);

-- Update existing exercises to have 'manual' source if source is null
UPDATE exercises SET source = 'manual' WHERE source IS NULL;

-- Make source column NOT NULL after updating existing data
ALTER TABLE exercises ALTER COLUMN source SET NOT NULL;