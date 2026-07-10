-- New SparkyFitness accounts start with the Saudi/Najdi Arabic experience.
-- Existing rows are intentionally untouched so explicit saved preferences
-- continue to win.

BEGIN;

ALTER TABLE public.user_preferences
  ALTER COLUMN language SET DEFAULT 'ar';

COMMIT;
