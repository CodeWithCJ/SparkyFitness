BEGIN;

-- Create a new table for user-defined water containers
CREATE TABLE user_water_containers (
    id SERIAL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    volume INTEGER NOT NULL,
    unit VARCHAR(50) NOT NULL, -- 'ml', 'oz', 'cup'
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add a column to user_preferences to store the preferred display unit for water
ALTER TABLE user_preferences
ADD COLUMN water_display_unit VARCHAR(50) DEFAULT 'ml';

-- Add the new water_ml column to the water_intake table
ALTER TABLE water_intake
ADD COLUMN water_ml INTEGER;

-- Migrate existing data from glasses_consumed to water_ml
-- We use the default conversion of 1 glass = 240 ml
UPDATE water_intake
SET water_ml = glasses_consumed * 240
WHERE glasses_consumed IS NOT NULL;

-- Drop the old glasses_consumed column
ALTER TABLE water_intake
DROP COLUMN glasses_consumed;

-- Add water_goal_ml to user_goals table
ALTER TABLE user_goals
ADD COLUMN water_goal_ml INTEGER;

-- Migrate existing water_goal (in glasses) to water_goal_ml (in ml)
-- Use the same default conversion of 1 glass = 240 ml
UPDATE user_goals
SET water_goal_ml = water_goal * 240
WHERE water_goal IS NOT NULL;

-- Drop the old water_goal column
ALTER TABLE user_goals
DROP COLUMN water_goal;

COMMIT;