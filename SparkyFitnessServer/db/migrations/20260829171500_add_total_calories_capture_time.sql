-- Keep the Total Calories sample time independent from the daily summary row's
-- audit timestamp. Other Health Connect metrics share this row and may update it
-- after the calorie sample was captured, which must not change TDEE projection.
ALTER TABLE daily_health_metrics
ADD COLUMN IF NOT EXISTS total_calories_captured_at TIMESTAMP WITH TIME ZONE;

-- Preserve the best available timestamp for totals synced before this column
-- existed. Future writes store the source entry timestamp directly.
UPDATE daily_health_metrics
SET total_calories_captured_at = COALESCE(updated_at, created_at)
WHERE total_calories IS NOT NULL
  AND total_calories_captured_at IS NULL;
