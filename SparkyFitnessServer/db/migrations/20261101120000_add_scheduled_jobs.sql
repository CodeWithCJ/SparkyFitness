-- One row per scheduled job (services/scheduledJobs.ts): every server instance
-- registers every job, and the one whose claim moves last_slot forward runs
-- that tick. Written only through the owner pool; the app role has no grant
-- on the system schema's tables.
CREATE TABLE IF NOT EXISTS system.scheduled_jobs (
  name TEXT PRIMARY KEY,
  -- The latest tick claimed; a tick at or before it is never claimed again.
  last_slot TIMESTAMPTZ NOT NULL,
  -- "<hostname>:<pid>" of the instance that claimed it, for operators.
  claimed_by TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL
);
