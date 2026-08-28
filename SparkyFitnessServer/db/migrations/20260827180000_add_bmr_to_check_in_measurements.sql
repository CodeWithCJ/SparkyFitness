-- Migration: Add bmr column to check_in_measurements table
ALTER TABLE check_in_measurements
ADD COLUMN IF NOT EXISTS bmr NUMERIC(6, 1);

ALTER TABLE check_in_measurements
DROP CONSTRAINT IF EXISTS check_in_measurements_bmr_check,
ADD CONSTRAINT check_in_measurements_bmr_check CHECK (bmr IS NULL OR (bmr >= 300 AND bmr <= 10000));

COMMENT ON COLUMN check_in_measurements.bmr IS 'Basal Metabolic Rate (BMR) in kcal, measured from smart weight scale or synced from health provider.';

-- Backfill check_in_measurements.bmr from custom_measurements where category name is 'basal_metabolic_rate'
-- 1. Update existing check_in_measurements rows
UPDATE check_in_measurements ci
SET bmr = ROUND(cm_latest.value::numeric, 1)::numeric(6, 1)
FROM (
  SELECT DISTINCT ON (cm.user_id, cm.entry_date)
    cm.user_id,
    cm.entry_date,
    cm.value
  FROM custom_measurements cm
  JOIN custom_categories cc ON cc.id = cm.category_id
  WHERE cc.name = 'basal_metabolic_rate'
    AND cm.value ~ '^[0-9]+(\.[0-9]+)?$'
    AND cm.value::numeric >= 300
    AND cm.value::numeric <= 10000
  ORDER BY cm.user_id, cm.entry_date, cm.updated_at DESC, cm.entry_timestamp DESC
) cm_latest
WHERE ci.user_id = cm_latest.user_id
  AND ci.entry_date = cm_latest.entry_date
  AND ci.bmr IS NULL;

-- 2. Insert check_in_measurements rows for dates that have a custom BMR but no check_in_measurements row yet
INSERT INTO check_in_measurements (user_id, entry_date, bmr)
SELECT
  cm_latest.user_id,
  cm_latest.entry_date,
  ROUND(cm_latest.value::numeric, 1)::numeric(6, 1)
FROM (
  SELECT DISTINCT ON (cm.user_id, cm.entry_date)
    cm.user_id,
    cm.entry_date,
    cm.value
  FROM custom_measurements cm
  JOIN custom_categories cc ON cc.id = cm.category_id
  WHERE cc.name = 'basal_metabolic_rate'
    AND cm.value ~ '^[0-9]+(\.[0-9]+)?$'
    AND cm.value::numeric >= 300
    AND cm.value::numeric <= 10000
  ORDER BY cm.user_id, cm.entry_date, cm.updated_at DESC, cm.entry_timestamp DESC
) cm_latest
WHERE NOT EXISTS (
  SELECT 1 FROM check_in_measurements ci
  WHERE ci.user_id = cm_latest.user_id
    AND ci.entry_date = cm_latest.entry_date
);

-- 3. Clean up legacy custom_measurements for basal_metabolic_rate now that data is in check_in_measurements
DELETE FROM custom_measurements cm
USING custom_categories cc
WHERE cc.id = cm.category_id
  AND cc.name = 'basal_metabolic_rate';

-- 4. Remove the obsolete basal_metabolic_rate custom category
DELETE FROM custom_categories
WHERE name = 'basal_metabolic_rate';
