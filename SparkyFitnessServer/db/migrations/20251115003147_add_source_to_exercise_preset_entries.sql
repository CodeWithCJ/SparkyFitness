-- Migration to add 'source' column to exercise_preset_entries table
ALTER TABLE public.exercise_preset_entries
ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';