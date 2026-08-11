-- Adds image support to the food domain, mirroring the existing exercise image feature.
--
-- foods.images / meals.images hold a JSON array of image paths. These are jsonb
-- (rather than the TEXT-encoded JSON that exercises.images uses) so Postgres
-- validates the payload and the pg driver hands back a parsed array on read.
--
-- food_entries.image_url is a single per-entry override photo. It is deliberately
-- NOT written back to the parent food/meal: the diary falls back to the food's or
-- meal's own first image when this is null.

ALTER TABLE foods
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE food_entries
  ADD COLUMN IF NOT EXISTS image_url text;
