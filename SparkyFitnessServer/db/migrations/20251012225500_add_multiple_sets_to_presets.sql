-- Migration to add multiple sets to workout presets

-- Step 1: Create the new table to store individual sets for workout preset exercises
CREATE TABLE workout_preset_exercise_sets (
    id SERIAL PRIMARY KEY,
    workout_preset_exercise_id INTEGER NOT NULL REFERENCES workout_preset_exercises(id) ON DELETE CASCADE,
    set_number INTEGER NOT NULL,
    set_type TEXT DEFAULT 'Working Set',
    reps INTEGER,
    weight DECIMAL(10, 2),
    duration INTEGER, -- in minutes
    rest_time INTEGER, -- in seconds
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add an index for faster querying
CREATE INDEX idx_workout_preset_exercise_sets_preset_exercise_id
ON workout_preset_exercise_sets (workout_preset_exercise_id);

-- Create a trigger for the updated_at column
CREATE TRIGGER update_workout_preset_exercise_sets_timestamp
BEFORE UPDATE ON workout_preset_exercise_sets
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Step 2: Data Migration
DO $$
DECLARE
    rec RECORD;
    i INTEGER;
BEGIN
    FOR rec IN SELECT * FROM workout_preset_exercises LOOP
        IF rec.sets IS NULL OR rec.sets <= 0 THEN
            INSERT INTO workout_preset_exercise_sets (
                workout_preset_exercise_id, set_number, set_type, reps, weight, duration, notes
            ) VALUES (
                rec.id, 1, 'Working Set', rec.reps, rec.weight, rec.duration, rec.notes
            );
        ELSE
            FOR i IN 1..rec.sets LOOP
                INSERT INTO workout_preset_exercise_sets (
                    workout_preset_exercise_id, set_number, set_type, reps, weight, duration, notes
                ) VALUES (
                    rec.id, i, 'Working Set', rec.reps, rec.weight, rec.duration, rec.notes
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Step 3: Alter the workout_preset_exercises Table
ALTER TABLE workout_preset_exercises
DROP COLUMN sets,
DROP COLUMN reps,
DROP COLUMN weight,
DROP COLUMN duration,
DROP COLUMN notes;