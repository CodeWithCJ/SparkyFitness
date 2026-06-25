-- Per-service chat tool profile. 'core' trims the chatbot tool surface for
-- small/local models (offered only for Ollama); 'full' is the default and ships
-- the complete tool set to every backend.
ALTER TABLE public.ai_service_settings
  ADD COLUMN IF NOT EXISTS chat_tool_profile text NOT NULL DEFAULT 'full'
  CHECK (chat_tool_profile IN ('full', 'core'));
