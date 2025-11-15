-- Migration to add exercise_preset_entry_id to exercise_entry_activity_details table
ALTER TABLE public.exercise_entry_activity_details
ADD COLUMN exercise_preset_entry_id UUID REFERENCES public.exercise_preset_entries(id) ON DELETE CASCADE;

-- Add a check constraint to ensure that either exercise_entry_id or exercise_preset_entry_id is present, but not both
ALTER TABLE public.exercise_entry_activity_details
ADD CONSTRAINT chk_exercise_entry_id_or_preset_id
CHECK (
    (exercise_entry_id IS NOT NULL AND exercise_preset_entry_id IS NULL) OR
    (exercise_entry_id IS NULL AND exercise_preset_entry_id IS NOT NULL)
);