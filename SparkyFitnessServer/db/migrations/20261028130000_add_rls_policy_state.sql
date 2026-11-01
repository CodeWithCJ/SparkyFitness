-- The rls_policies.sql apply the server last made (utils/applyRlsPolicies.ts):
-- the file's sha256 and a fingerprint of the policy catalogs. Startup skips
-- the apply while both still match. Migrations run before the apply, so the
-- table always exists by then. Deleting the row forces the next apply.
--
-- Owned by the schema owner and written only through the owner pool; the app
-- role has no grant on this table.
CREATE TABLE IF NOT EXISTS system.rls_policy_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  file_sha256 TEXT NOT NULL,
  catalog_fingerprint TEXT NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL
);
