-- Existing configurations keep a medium effort; the setting is optional in
-- clients so older mobile/web versions continue to save service configurations.
ALTER TABLE ai_service_settings
  ADD COLUMN IF NOT EXISTS reasoning_effort text NOT NULL DEFAULT 'medium'
  CHECK (reasoning_effort IN ('low', 'medium', 'high', 'xhigh', 'max'));
-- Existing owner/public/admin RLS policies apply to this column as well.
