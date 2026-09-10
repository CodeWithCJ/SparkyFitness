-- Narrow the plausibility bounds on check_in_measurements.bmr from 300-10000 to 600-6000.
--
-- The 300-10000 range introduced with the measured-BMR feature is wide enough to accept
-- readings no adult can produce. A 350 kcal value passed validation, replaced the user's
-- chosen formula, and — because getRecommendedCalorieSafetyFloor() uses RMR verbatim —
-- became the safety floor under their calorie goal (issue #2395).
--
-- 600-6000 is still generous: Mifflin-St Jeor gives roughly 1030 kcal for a 40 kg, 150 cm
-- woman and 3070 kcal for a 200 kg, 190 cm man. It rejects impossible readings without
-- second-guessing an unusual body. These are the bounds that shipped in v1.6.3/v1.6.4.
--
-- Only values the new constraint would reject are cleared; every plausible reading,
-- including those backfilled from the legacy basal_metabolic_rate custom category, is
-- preserved. Affected days fall back to the user's configured BMR formula.
UPDATE check_in_measurements
SET bmr = NULL
WHERE bmr IS NOT NULL
  AND (bmr < 600 OR bmr > 6000);

ALTER TABLE check_in_measurements
DROP CONSTRAINT IF EXISTS check_in_measurements_bmr_check,
ADD CONSTRAINT check_in_measurements_bmr_check CHECK (bmr IS NULL OR (bmr >= 600 AND bmr <= 6000));

COMMENT ON COLUMN check_in_measurements.bmr IS 'Basal Metabolic Rate (BMR) in kcal, measured from smart weight scale or synced from health provider. Applies only to its own entry_date; days without a reading fall back to the user''s BMR formula.';
