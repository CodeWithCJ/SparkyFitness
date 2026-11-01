-- Fixed-window counters shared by every server instance, one row per key: the
-- per-address limits of the server's own routes that Better Auth's limiter
-- (public.rate_limit) does not cover (middleware/ipRateLimit.ts, keyed
-- "<limiter>|<address>"). A hit after the window has passed restarts it.
-- Times are the database's own clock, so instances with skewed clocks agree.
--
-- Owned by the schema owner and read and written only through the owner pool;
-- the app role has no grant on the system schema's tables.
CREATE TABLE IF NOT EXISTS system.rate_limit_windows (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL,
  -- When the current window ends. Stored per row because limiters have
  -- different windows and an instance knows only the ones it has used.
  expires_at TIMESTAMPTZ NOT NULL
);

-- Expired rows are deleted by expires_at.
CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_expires_at
  ON system.rate_limit_windows (expires_at);
