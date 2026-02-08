-- Fix keys created with the old Better Auth defaults (10 requests per 24 hours)
UPDATE public.api_key
SET rate_limit_time_window = 60000,
    rate_limit_max = 100,
    request_count = 0
WHERE rate_limit_time_window = 86400000
  AND rate_limit_max = 10;

-- Set column defaults so manual INSERTs also get sane values
ALTER TABLE public.api_key
  ALTER COLUMN rate_limit_time_window SET DEFAULT 60000,
  ALTER COLUMN rate_limit_max SET DEFAULT 100;
