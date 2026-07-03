-- Migration to add multiple sets to workout plan assignments

-- Step 1: Create New Table workout_plan_assignment_sets
CREATE TABLE workout_plan_assignment_sets (
    id SERIAL PRIMARY KEY,
    assignment_id INTEGER NOT NULL REFERENCES workout_plan_template_assignments(id) ON DELETE CASCADE,
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

CREATE INDEX idx_assignment_sets_assignment_id ON workout_plan_assignment_sets (assignment_id);

CREATE TRIGGER update_workout_plan_assignment_sets_timestamp
BEFORE UPDATE ON workout_plan_assignment_sets
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Step 2: Data Migration
DO $$
DECLARE
    rec RECORD;
    i INTEGER;
BEGIN
    FOR rec IN SELECT * FROM workout_plan_template_assignments WHERE exercise_id IS NOT NULL LOOP
        IF rec.sets IS NULL OR rec.sets <= 0 THEN
            INSERT INTO workout_plan_assignment_sets (
                assignment_id, set_number, set_type, reps, weight, duration, notes
            ) VALUES (
                rec.id, 1, 'Working Set', rec.reps, rec.weight, rec.duration, rec.notes
            );
        ELSE
            FOR i IN 1..rec.sets LOOP
                INSERT INTO workout_plan_assignment_sets (
                    assignment_id, set_number, set_type, reps, weight, duration, notes
                ) VALUES (
                    rec.id, i, 'Working Set', rec.reps, rec.weight, rec.duration, rec.notes
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Step 3: Alter workout_plan_template_assignments Table
ALTER TABLE workout_plan_template_assignments
DROP COLUMN sets,
DROP COLUMN reps,
DROP COLUMN weight,
DROP COLUMN duration,
DROP COLUMN notes;