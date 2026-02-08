-- Migration to add sort_order for exercise ordering
-- Created at: 2026-02-05 20:02:00

-- Add sort_order to workout_preset_exercises
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'workout_preset_exercises' AND COLUMN_NAME = 'sort_order') THEN
        ALTER TABLE workout_preset_exercises ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add sort_order to workout_plan_template_assignments
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'workout_plan_template_assignments' AND COLUMN_NAME = 'sort_order') THEN
        ALTER TABLE workout_plan_template_assignments ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add sort_order to exercise_entries
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'exercise_entries' AND COLUMN_NAME = 'sort_order') THEN
        ALTER TABLE exercise_entries ADD COLUMN sort_order INTEGER DEFAULT 0;
    END IF;
END $$;
