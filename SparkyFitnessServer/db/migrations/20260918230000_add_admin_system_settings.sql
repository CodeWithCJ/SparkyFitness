-- System-wide admin policy settings on global_settings.
--
-- The first four replace env-only operator toggles with settings an admin can
-- change in the UI; the matching environment variables still force a policy on
-- when set, so existing deployments keep working.
--
-- mock_data_enabled is the master switch for the runtime mock-data options.
-- While false (the default), the per-sync `saveMockData` / `dataSource` request
-- options are ignored, so a production instance cannot be made to write
-- provider responses to disk or replay fixtures. An admin turns it on
-- temporarily to collect a sample bundle, then turns it back off.

ALTER TABLE global_settings
ADD COLUMN IF NOT EXISTS allow_private_network_ai BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS allow_private_network_food_providers BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS public_api_docs BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dev_tools_enabled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mock_data_enabled BOOLEAN NOT NULL DEFAULT FALSE;
