-- Index to speed up Garmin nutrition idempotency cleanup queries
-- (finding food_entries whose food_id references a garmin-sourced food)
CREATE INDEX IF NOT EXISTS idx_foods_provider_type_user_id
ON public.foods (provider_type, user_id)
WHERE provider_type IS NOT NULL;
