-- SparkyFitnessServer/db/migrations/20261112200000_add_mcp_server_provider_type.sql
-- Add the MCP tool server provider type and per-person chat opt-in. An admin
-- adds a global provider with a base URL and an optional bearer token, stored
-- encrypted in external_data_providers.app_key like the other providers' keys.
-- Each person opts in before chat uses the tools the admin allows.
--
-- provider_options holds what a tool server needs beyond that: which tools are
-- allowed and whether to send the person's ID. It is NULL for every other
-- provider. A new column on an existing table, so no RLS change.
--
-- Strictly private, so a tool server is never shared through
-- share_external_providers. The service refuses this type outside the admin's
-- global provider routes.

ALTER TABLE public.external_data_providers
  ADD COLUMN IF NOT EXISTS provider_options JSONB;

INSERT INTO public.external_provider_types (id, display_name, description)
VALUES (
  'mcp_server',
  'MCP tool server',
  'Outside MCP server whose tools chat can use. Whatever the assistant passes to a tool is sent to this server, and what comes back enters the chat. Add only servers you trust.'
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

UPDATE public.external_provider_types
SET categories = ARRAY['other'],
    required_fields = ARRAY['base_url'],
    field_labels = '{"base_url": "MCP server URL", "app_key": "Bearer token (optional)"}'::jsonb,
    is_strictly_private = TRUE,
    supports_barcode = FALSE
WHERE id = 'mcp_server';

-- Each person chooses servers for their own chat, off by default. This adds a
-- column to the existing user_preferences RLS table, so no RLS change.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS chat_mcp_server_ids UUID[] NOT NULL DEFAULT '{}';
