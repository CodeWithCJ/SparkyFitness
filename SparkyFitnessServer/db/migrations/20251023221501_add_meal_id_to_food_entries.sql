-- Migration to add meal_id to food_entries table and make food_id nullable

-- Make food_id nullable
ALTER TABLE public.food_entries
ALTER COLUMN food_id DROP NOT NULL;

-- Add meal_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'food_entries' AND column_name = 'meal_id') THEN
        ALTER TABLE public.food_entries
        ADD COLUMN meal_id uuid;
    END IF;
END
$$;

-- Add foreign key constraint to meals table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_food_entries_meal_id' AND conrelid = 'public.food_entries'::regclass) THEN
        ALTER TABLE public.food_entries
        ADD CONSTRAINT fk_food_entries_meal_id FOREIGN KEY (meal_id)
        REFERENCES public.meals (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE;
    END IF;
END
$$;

-- Add a check constraint to ensure either food_id or meal_id is present, but not both, if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_food_or_meal_id' AND conrelid = 'public.food_entries'::regclass) THEN
        ALTER TABLE public.food_entries
        ADD CONSTRAINT chk_food_or_meal_id
        CHECK (
            (food_id IS NOT NULL AND meal_id IS NULL) OR
            (food_id IS NULL AND meal_id IS NOT NULL)
        );
    END IF;
END
$$;