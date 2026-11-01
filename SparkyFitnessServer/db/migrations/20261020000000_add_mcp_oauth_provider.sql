-- OAuth 2.1 authorization-server storage for the remote /mcp endpoint.
-- Table and column names mirror the explicit Better Auth mappings in
-- utils/mcpOAuthSchema.ts. IDs use UUIDs to match the existing auth schema.
-- Better Auth's Kysely adapter serializes string arrays as JSON text because
-- PostgreSQL array support is disabled at the adapter boundary.

ALTER TABLE global_settings
  ADD COLUMN IF NOT EXISTS mcp_oauth_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mcp_oauth_allowed_redirect_uris text[] NOT NULL DEFAULT ARRAY[
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'http://[::1]:*'
  ]::text[];

CREATE TABLE IF NOT EXISTS jwks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key text NOT NULL,
  private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  alg text,
  crv text
);

CREATE TABLE IF NOT EXISTS oauth_client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret text,
  client_discovery_id text,
  disabled boolean NOT NULL DEFAULT false,
  skip_consent boolean,
  enable_end_session boolean,
  subject_type text,
  scopes text,
  client_credentials_scopes text NOT NULL DEFAULT '[]',
  user_id uuid REFERENCES "user"(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text,
  uri text,
  icon text,
  contacts text,
  tos text,
  policy text,
  software_id text,
  software_version text,
  software_statement text,
  redirect_uris text NOT NULL,
  post_logout_redirect_uris text,
  backchannel_logout_uri text,
  backchannel_logout_session_required boolean,
  token_endpoint_auth_method text,
  application_type text,
  jwks text,
  jwks_uri text,
  grant_types text,
  response_types text,
  require_pkce boolean,
  dpop_bound_access_tokens boolean NOT NULL DEFAULT false,
  reference_id text,
  metadata jsonb
);
CREATE INDEX IF NOT EXISTS idx_oauth_client_user_id ON oauth_client(user_id);

CREATE TABLE IF NOT EXISTS oauth_resource (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL UNIQUE,
  name text NOT NULL,
  access_token_ttl integer,
  refresh_token_ttl integer,
  signing_algorithm text,
  signing_key_id text,
  allowed_scopes text,
  custom_claims jsonb,
  dpop_bound_access_tokens_required boolean NOT NULL DEFAULT false,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  policy_version integer NOT NULL DEFAULT 1,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS oauth_client_resource (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  resource_id text NOT NULL REFERENCES oauth_resource(identifier) ON DELETE CASCADE,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT oauth_client_resource_unique UNIQUE (client_id, resource_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_client_resource_client_id
  ON oauth_client_resource(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_client_resource_resource_id
  ON oauth_client_resource(resource_id);

CREATE TABLE IF NOT EXISTS oauth_refresh_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  client_id text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  session_id uuid REFERENCES "session"(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  reference_id text,
  authorization_code_id text,
  resources text,
  requested_user_info_claims text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked timestamptz,
  rotated_at timestamptz,
  rotation_replay_response text,
  rotation_replay_expires_at timestamptz,
  auth_time timestamptz,
  confirmation jsonb,
  scopes text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_token_client_id
  ON oauth_refresh_token(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_token_session_id
  ON oauth_refresh_token(session_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_token_user_id
  ON oauth_refresh_token(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_token_authorization_code_id
  ON oauth_refresh_token(authorization_code_id);

CREATE TABLE IF NOT EXISTS oauth_access_token (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  client_id text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  session_id uuid REFERENCES "session"(id) ON DELETE SET NULL,
  user_id uuid REFERENCES "user"(id) ON DELETE CASCADE,
  reference_id text,
  authorization_code_id text,
  resources text,
  requested_user_info_claims text,
  refresh_id uuid REFERENCES oauth_refresh_token(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked timestamptz,
  confirmation jsonb,
  scopes text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_access_token_client_id
  ON oauth_access_token(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_token_session_id
  ON oauth_access_token(session_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_token_user_id
  ON oauth_access_token(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_token_authorization_code_id
  ON oauth_access_token(authorization_code_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_token_refresh_id
  ON oauth_access_token(refresh_id);

CREATE TABLE IF NOT EXISTS oauth_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  user_id uuid REFERENCES "user"(id) ON DELETE CASCADE,
  reference_id text,
  resources text,
  requested_user_info_claims text,
  scopes text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oauth_consent_client_id
  ON oauth_consent(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_consent_user_id
  ON oauth_consent(user_id);

-- A consent can be granted again after it is revoked. Keep the most recent
-- revocation timestamp so JWTs issued before that point stay invalid even when
-- a new consent for the same user/client pair is created later.
CREATE TABLE IF NOT EXISTS oauth_authorization_revocation (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

CREATE TABLE IF NOT EXISTS oauth_client_assertion (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
