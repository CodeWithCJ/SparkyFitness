-- Table for Workout Presets (Routines)
CREATE TABLE workout_presets (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Exercises within Workout Presets
CREATE TABLE workout_preset_exercises (
    id SERIAL PRIMARY KEY,
    workout_preset_id INTEGER NOT NULL REFERENCES workout_presets(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    sets INTEGER,
    reps INTEGER,
    weight DECIMAL(10, 2),
    image_url TEXT, -- Optional: URL for a picture of the machine or form
    duration INTEGER, -- Duration in minutes (optional)
    notes TEXT, -- Additional notes for the exercise in the preset (optional)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Workout Plan Templates
CREATE TABLE workout_plan_templates (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Assignments within Workout Plan Templates
CREATE TABLE workout_plan_template_assignments (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES workout_plan_templates(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL, -- 0 for Sunday, 1 for Monday, etc.
    workout_preset_id INTEGER REFERENCES workout_presets(id) ON DELETE CASCADE,
    exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE, -- For individual exercises not part of a preset
    sets INTEGER DEFAULT 0,
    reps INTEGER DEFAULT 0,
    weight DECIMAL(10, 2) DEFAULT 0.0,
    duration INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_workout_assignment_type CHECK (
        (workout_preset_id IS NOT NULL AND exercise_id IS NULL) OR
        (workout_preset_id IS NULL AND exercise_id IS NOT NULL)
    )
);

-- Add a column to exercise_entries to link to workout_plan_template_assignments
ALTER TABLE exercise_entries
ADD COLUMN workout_plan_assignment_id INTEGER REFERENCES workout_plan_template_assignments(id) ON DELETE SET NULL;

-- Add a column to exercise_entries to store image URLs for logged exercises
ALTER TABLE exercise_entries
ADD COLUMN image_url TEXT;

-- Update the updated_at column automatically
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workout_presets_timestamp
BEFORE UPDATE ON workout_presets
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_workout_preset_exercises_timestamp
BEFORE UPDATE ON workout_preset_exercises
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_workout_plan_templates_timestamp
BEFORE UPDATE ON workout_plan_templates
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_workout_plan_template_assignments_timestamp
BEFORE UPDATE ON workout_plan_template_assignments
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();