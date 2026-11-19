-- Logging a food by its cooked weight (#3534).
--
-- food_entries.quantity stays the raw weight of the portion, so totals,
-- reports and sync are unchanged. cooked_quantity is the cooked weight that
-- was eaten, in the same unit as quantity. The batch yield is not stored: it
-- is cooked_quantity / quantity.
--
-- Only diary entries carry it. Foods, variants and meals do not (a variant
-- can be shared, and the yield changes with every pot), and components of a
-- logged meal keep NULL because meals already have a batch cooked weight.

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS cooked_quantity numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'food_entries_cooked_quantity_positive'
       AND conrelid = 'public.food_entries'::regclass
  ) THEN
    ALTER TABLE public.food_entries
      ADD CONSTRAINT food_entries_cooked_quantity_positive
      CHECK (cooked_quantity IS NULL OR cooked_quantity > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.food_entries.cooked_quantity IS
  'Cooked weight eaten, in the same unit as quantity (the raw weight). NULL when the entry was not weighed cooked.';
