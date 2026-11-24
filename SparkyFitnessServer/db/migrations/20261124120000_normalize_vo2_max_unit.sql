-- Migration: Write the VO2 max unit one way, ml/kg/min.
-- File: SparkyFitnessServer/db/migrations/20261124120000_normalize_vo2_max_unit.sql
--
-- Providers filed the "VO2 Max" custom category under ml/min/kg (Oura, Withings,
-- Health Connect and HealthKit sync) or mL/kg/min (Garmin). A category keeps the
-- unit it was created with, and only ml/kg/min has a display precision. Relabel
-- the categories sync creates. No new table; re-runnable.

UPDATE public.custom_categories
SET measurement_type = 'ml/kg/min'
WHERE name IN ('VO2 Max', 'vo2_max')
  AND measurement_type IN ('ml/min/kg', 'mL/kg/min');
