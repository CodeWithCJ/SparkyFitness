-- Persist the "All Providers" aggregated food search as the user's default.
--
-- This deliberately does NOT reuse default_food_data_provider_id: that column is
-- a uuid, and the aggregated mode is identified by the '__all__' sentinel, which
-- is not a uuid and fails the column's input conversion. Keeping it separate also
-- preserves the user's single-provider choice, so turning the aggregated default
-- back off restores the provider they had picked instead of resetting to
-- whichever provider happens to sort first.
--
-- NOT NULL matches show_net_carbs and the required z.boolean() in the shared
-- schema: a writer that supplies an explicit NULL would bypass the default and
-- produce a row the canonical schema cannot parse.
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS food_search_all_providers_default BOOLEAN NOT NULL DEFAULT FALSE;
