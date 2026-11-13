-- Migration: A person's saved routes (a library of paths to run, walk, ride or
-- hike). A route is a simplified track of points plus optional turn cues. It
-- can be drawn on a map, imported from a GPX file, or saved from a recorded
-- activity (source_exercise_entry_id remembers which one).
-- Date: 2026-10-21

CREATE TABLE IF NOT EXISTS public.routes (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    activity VARCHAR(10) NOT NULL DEFAULT 'run'
        CHECK (activity IN ('run', 'walk', 'ride', 'hike')),
    source VARCHAR(10) NOT NULL DEFAULT 'drawn'
        CHECK (source IN ('drawn', 'gpx', 'activity')),
    distance_m DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (distance_m >= 0),
    elevation_gain_m DOUBLE PRECISION
        CHECK (elevation_gain_m IS NULL OR elevation_gain_m >= 0),
    points JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(points) = 'array'),
    cues JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(cues) = 'array'),
    source_exercise_entry_id UUID
        REFERENCES public.exercise_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_user_updated
    ON public.routes (user_id, updated_at DESC);

-- Deleting an exercise entry runs ON DELETE SET NULL against this column, which
-- would otherwise scan every route to find the ones that came from it.
CREATE INDEX IF NOT EXISTS idx_routes_source_exercise_entry
    ON public.routes (source_exercise_entry_id)
    WHERE source_exercise_entry_id IS NOT NULL;
