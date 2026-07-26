-- Several nutrition queries divide by serving_size (e.g. reportRepository:
-- `calories * quantity / serving_size`), so a 0 or negative serving_size would
-- divide-by-zero or invert a day's totals. Normalize any existing non-positive
-- rows to 1 (a non-positive serving size is meaningless), then enforce the
-- invariant on both the variant definition and the food_entries snapshot.

UPDATE public.food_variants
   SET serving_size = 1
 WHERE serving_size IS NULL OR serving_size <= 0;

UPDATE public.food_entries
   SET serving_size = 1
 WHERE serving_size IS NULL OR serving_size <= 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_variants_serving_size_positive'
  ) THEN
    ALTER TABLE public.food_variants
      ADD CONSTRAINT food_variants_serving_size_positive CHECK (serving_size > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_entries_serving_size_positive'
  ) THEN
    ALTER TABLE public.food_entries
      ADD CONSTRAINT food_entries_serving_size_positive CHECK (serving_size > 0);
  END IF;
END $$;
