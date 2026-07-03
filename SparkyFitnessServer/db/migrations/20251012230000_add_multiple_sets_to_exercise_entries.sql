-- Migration to add multiple sets to exercise entries

-- Step 1: Create New Table exercise_entry_sets
CREATE TABLE exercise_entry_sets (
    id SERIAL PRIMARY KEY,
    exercise_entry_id UUID NOT NULL REFERENCES exercise_entries(id) ON DELETE CASCADE,
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

CREATE INDEX idx_exercise_entry_sets_entry_id ON exercise_entry_sets (exercise_entry_id);

CREATE TRIGGER update_exercise_entry_sets_timestamp
BEFORE UPDATE ON exercise_entry_sets
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Step 2: Data Migration
DO $$
DECLARE
    rec RECORD;
    i INTEGER;
BEGIN
    FOR rec IN SELECT * FROM exercise_entries LOOP
        IF rec.sets IS NULL OR rec.sets <= 0 THEN
            INSERT INTO exercise_entry_sets (
                exercise_entry_id, set_number, set_type, reps, weight
            ) VALUES (
                rec.id, 1, 'Working Set', rec.reps, rec.weight
            );
        ELSE
            FOR i IN 1..rec.sets LOOP
                INSERT INTO exercise_entry_sets (
                    exercise_entry_id, set_number, set_type, reps, weight
                ) VALUES (
                    rec.id, i, 'Working Set', rec.reps, rec.weight
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;

-- Step 3: Alter exercise_entries Table
ALTER TABLE exercise_entries
DROP COLUMN sets,
DROP COLUMN reps,
DROP COLUMN weight;