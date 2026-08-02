-- Several nutrition queries divide by serving_size (e.g. reportRepository:
-- `calories * quantity / serving_size`), so a 0 or negative serving_size would
-- divide-by-zero or invert a day's totals. Normalize any existing non-positive
-- rows to 1 (a non-positive serving size is meaningless), then enforce the
-- invariant on both the variant definition and the food_entries snapshot.
--
-- NULL is deliberately left alone. `food_entries.serving_size` is a nullable
-- snapshot column and consumers disagree on the NULL fallback
-- (`dailySummaryService.ts` uses `serving_size || 100`, `foodEntryService.ts`
-- uses `|| 1`), so rewriting NULL to 1 would permanently inflate legacy rows by
-- 100x. NULL was never part of the divide-by-zero class anyway: `x / NULL` is
-- NULL, and a CHECK evaluating to NULL passes.

UPDATE public.food_variants
   SET serving_size = 1
 WHERE serving_size <= 0;

UPDATE public.food_entries
   SET serving_size = 1
 WHERE serving_size <= 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'food_variants_serving_size_positive'
       AND conrelid = 'public.food_variants'::regclass
  ) THEN
    ALTER TABLE public.food_variants
      ADD CONSTRAINT food_variants_serving_size_positive CHECK (serving_size > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'food_entries_serving_size_positive'
       AND conrelid = 'public.food_entries'::regclass
  ) THEN
    ALTER TABLE public.food_entries
      ADD CONSTRAINT food_entries_serving_size_positive CHECK (serving_size > 0);
  END IF;
END $$;
