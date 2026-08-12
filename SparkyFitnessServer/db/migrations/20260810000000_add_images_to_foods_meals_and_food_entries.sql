-- Adds image support to the food domain, mirroring the existing exercise image feature.
--
-- foods.images / meals.images hold a JSON array of image paths. These are jsonb
-- (rather than the TEXT-encoded JSON that exercises.images uses) so Postgres
-- validates the payload and the pg driver hands back a parsed array on read.
--
-- food_entries.image_url and food_entry_meals.image_url are single per-entry
-- override photos. They are deliberately NOT written back to the parent
-- food/meal: the diary falls back to the food's or meal's own first image when
-- the override is null.
--
-- Every statement is IF NOT EXISTS so this file stays idempotent and can be
-- safely re-applied to a database that already ran an earlier version of it.

ALTER TABLE foods
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE food_entries
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE food_entry_meals
  ADD COLUMN IF NOT EXISTS image_url text;
