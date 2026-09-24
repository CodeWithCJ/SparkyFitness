-- Coordination state for running several server instances against one
-- database. Each instance proposes the shared settings it reads from its
-- environment; a group's settings change only when every current instance
-- proposes the same values. A single all-in-one server agrees with itself.
--
-- These tables live in the system schema, where the application role has
-- USAGE but no table privileges, so only the owner connection can read them.

-- One row per running instance. Each check-in pushes expires_at forward using
-- database time, so every instance judges expiry by the same clock.
CREATE TABLE IF NOT EXISTS system.instance_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    release_version text NOT NULL,
    proposals jsonb NOT NULL,
    expires_at timestamptz NOT NULL
);

-- Agreed settings, one row per settings group. release_version records which
-- release wrote the row, so a reader on the same release can tell a damaged
-- row from one written before a field existed.
CREATE TABLE IF NOT EXISTS system.shared_settings (
    group_name text PRIMARY KEY,
    payload jsonb NOT NULL,
    release_version text NOT NULL,
    accepted_at timestamptz NOT NULL DEFAULT now()
);

-- Single row: how many instances are expected. The expected count follows the
-- live count only after a different live count has held steady for a grace
-- period, so a rolling-update surge does not raise it and one surviving
-- instance cannot immediately change settings on its own. pending_count and
-- pending_since record the differing live count being timed; both are null
-- while the live count matches expected_count.
CREATE TABLE IF NOT EXISTS system.instance_membership (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    expected_count integer NOT NULL CHECK (expected_count > 0),
    pending_count integer CHECK (pending_count > 0),
    pending_since timestamptz,
    CHECK ((pending_count IS NULL) = (pending_since IS NULL)),
    CHECK (pending_count IS DISTINCT FROM expected_count)
);
