-- Adds image support to the food domain, mirroring the existing exercise image
-- feature.
--
-- All four columns are jsonb arrays of image paths, rather than the
-- TEXT-encoded JSON that exercises.images uses, so Postgres validates the
-- payload and the pg driver hands back a parsed array on read.
--
-- foods.images / meals.images are the library images for a food or meal.
--
-- food_entries.images / food_entry_meals.images are per-entry override photos
-- for a single diary entry. They are deliberately NOT written back to the
-- parent food or meal: a diary entry with no override of its own falls back to
-- displaying the parent's images.

-- jsonb validates syntax but still accepts objects, scalars, and JSON null,
-- so each column also asserts the array shape the application contract needs.
ALTER TABLE foods
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE food_entries
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE food_entry_meals
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'foods_images_is_array') THEN
    ALTER TABLE foods
      ADD CONSTRAINT foods_images_is_array CHECK (jsonb_typeof(images) = 'array');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meals_images_is_array') THEN
    ALTER TABLE meals
      ADD CONSTRAINT meals_images_is_array CHECK (jsonb_typeof(images) = 'array');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_entries_images_is_array') THEN
    ALTER TABLE food_entries
      ADD CONSTRAINT food_entries_images_is_array CHECK (jsonb_typeof(images) = 'array');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_entry_meals_images_is_array') THEN
    ALTER TABLE food_entry_meals
      ADD CONSTRAINT food_entry_meals_images_is_array CHECK (jsonb_typeof(images) = 'array');
  END IF;
END $$;
