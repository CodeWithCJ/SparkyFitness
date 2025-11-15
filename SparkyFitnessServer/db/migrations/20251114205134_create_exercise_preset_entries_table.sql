-- Migration to create exercise_preset_entries table and add exercise_preset_entry_id to exercise_entries

-- Create exercise_preset_entries table
CREATE TABLE exercise_preset_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workout_preset_id INTEGER REFERENCES workout_presets(id) ON DELETE SET NULL, -- Nullable FK to original preset
    name VARCHAR(255) NOT NULL,
    description TEXT,
    entry_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT
);

-- Add exercise_preset_entry_id to exercise_entries table
ALTER TABLE exercise_entries
ADD COLUMN exercise_preset_entry_id UUID REFERENCES public.exercise_preset_entries(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_exercise_preset_entries_user_id ON exercise_preset_entries(user_id);
CREATE INDEX idx_exercise_preset_entries_entry_date ON exercise_preset_entries(entry_date);
CREATE INDEX idx_exercise_entries_exercise_preset_entry_id ON exercise_entries(exercise_preset_entry_id);