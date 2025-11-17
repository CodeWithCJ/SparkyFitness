-- Migration to alter exercise_entry_id to be nullable in exercise_entry_activity_details table
ALTER TABLE public.exercise_entry_activity_details
ALTER COLUMN exercise_entry_id DROP NOT NULL;