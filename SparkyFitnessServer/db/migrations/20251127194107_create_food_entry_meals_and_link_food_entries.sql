-- Create the food_entry_meals table
CREATE TABLE food_entry_meals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meal_template_id UUID REFERENCES meals(id) ON DELETE SET NULL,
    meal_type VARCHAR(50) NOT NULL,
    entry_date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Add an index for efficient querying
CREATE INDEX idx_food_entry_meals_user_id_entry_date ON food_entry_meals (user_id, entry_date);
CREATE INDEX idx_food_entry_meals_meal_template_id ON food_entry_meals (meal_template_id);

-- Add the food_entry_meal_id column to the food_entries table
ALTER TABLE food_entries
ADD COLUMN food_entry_meal_id UUID REFERENCES food_entry_meals(id) ON DELETE CASCADE;

-- Add an index for efficient lookups of meal components
CREATE INDEX idx_food_entries_food_entry_meal_id ON food_entries (food_entry_meal_id);

-- Important: Existing 'food_entries' records that were aggregated meals
-- (food_id IS NULL AND meal_id IS NOT NULL) will need to be migrated
-- into the new 'food_entry_meals' and linked 'food_entries' structure
-- via a separate data migration script.
-- After data migration, the 'meal_id' column on food_entries could potentially be set to NULL.