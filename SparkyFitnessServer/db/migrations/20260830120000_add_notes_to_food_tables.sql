-- Adds a freeform markdown notes field to the food domain.
--
-- foods.notes / meals.notes are library-level reference notes: the details a
-- user wants to remember about an item every time they log it (how they order
-- a particular bowl, a recipe, a preparation tweak). They are owner-authored
-- and, like brand or barcode, visible to anyone who can already read the row.
--
-- food_entries.notes / food_entry_meals.notes are per-occurrence notes for a
-- single diary entry. They are deliberately NOT written back to the parent
-- food or meal, and are never derived from it: the parent's notes are shown
-- read-only alongside the entry's own note.
--
-- Nullable TEXT with no default, matching meals.description and
-- exercises.description. Length is bounded in the application layer rather
-- than by a CHECK constraint, consistent with every other free-text column in
-- this schema.

ALTER TABLE foods
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE food_entries
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE food_entry_meals
  ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN public.foods.notes IS 'Owner-authored markdown reference note for this food (e.g. how it is ordered or prepared).';
COMMENT ON COLUMN public.meals.notes IS 'Owner-authored markdown reference note for this meal (e.g. a recipe).';
COMMENT ON COLUMN public.food_entries.notes IS 'Per-occurrence markdown note for a single diary entry. Never derived from foods.notes.';
COMMENT ON COLUMN public.food_entry_meals.notes IS 'Per-occurrence markdown note for a single logged meal. Never derived from meals.notes.';
