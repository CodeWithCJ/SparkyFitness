-- Migration: Generated routes. A route returned by the generate endpoint and
-- then saved carries source = 'generated'. The routes table only allowed
-- drawn, gpx and activity, so widen the check. Safe to re-run: the constraint
-- is dropped by name first, and a table created with the wider check already
-- is left equivalent.
-- Date: 2026-10-20

ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_source_check;
ALTER TABLE public.routes
    ADD CONSTRAINT routes_source_check
    CHECK (source IN ('drawn', 'gpx', 'activity', 'generated'));
