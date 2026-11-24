-- Allow Gemini's OAuth callbacks for Remote MCP OAuth by default.
-- Google's MCP OAuth guide lists production, sandbox and test hosts, each with
-- /r/ and /a/ paths. Each Gemini app gets its own path below these prefixes,
-- so they are stored as HTTPS path-prefix patterns. Gemini registers all six
-- at once, and dynamic client registration is refused unless every redirect
-- URI is allowed, so all six are needed.
--
-- Existing installs: only an allowlist still equal to the original shipped
-- list is updated. An administrator-edited list is left alone. Re-runnable.

ALTER TABLE global_settings
  ALTER COLUMN mcp_oauth_allowed_redirect_uris SET DEFAULT ARRAY[
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'https://oauth-redirect.googleusercontent.com/r/*',
    'https://oauth-redirect-sandbox.googleusercontent.com/r/*',
    'https://oauth-redirect-test.googleusercontent.com/r/*',
    'https://oauth-redirect.googleusercontent.com/a/*',
    'https://oauth-redirect-sandbox.googleusercontent.com/a/*',
    'https://oauth-redirect-test.googleusercontent.com/a/*',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'http://[::1]:*'
  ]::text[];

UPDATE global_settings
SET mcp_oauth_allowed_redirect_uris = ARRAY[
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'https://oauth-redirect.googleusercontent.com/r/*',
    'https://oauth-redirect-sandbox.googleusercontent.com/r/*',
    'https://oauth-redirect-test.googleusercontent.com/r/*',
    'https://oauth-redirect.googleusercontent.com/a/*',
    'https://oauth-redirect-sandbox.googleusercontent.com/a/*',
    'https://oauth-redirect-test.googleusercontent.com/a/*',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'http://[::1]:*'
  ]::text[]
WHERE mcp_oauth_allowed_redirect_uris = ARRAY[
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'http://[::1]:*'
  ]::text[];
