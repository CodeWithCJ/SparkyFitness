-- COROS allows a limited number of FIT file downloads per account per day.
-- The count lives on the provider rows so every server instance spends the
-- same budget, and a restart does not reset it. The budget is the sum over
-- the rows linked to one COROS account. fit_downloads_day is the UTC day the
-- row's count belongs to; a download on a later day starts it again at 1.
ALTER TABLE external_data_providers
  ADD COLUMN IF NOT EXISTS fit_downloads_day DATE,
  ADD COLUMN IF NOT EXISTS fit_downloads_used INTEGER NOT NULL DEFAULT 0;
