-- Migration: Lab results get their own tables instead of riding on custom categories.
-- Built-in markers (HbA1c, LDL, ...) are identified by a stable key defined in
-- @workspace/shared, so only the user's own markers are stored. Each result keeps
-- its own unit and reference range, because labs print both on every report and
-- they differ between labs. Several results per marker per day are allowed.

CREATE TABLE IF NOT EXISTS public.lab_markers (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    ref_range_low DOUBLE PRECISION,
    ref_range_high DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    CONSTRAINT lab_markers_ref_range_check
        CHECK (ref_range_low IS NULL OR ref_range_high IS NULL OR ref_range_low <= ref_range_high)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_markers_user_name
    ON public.lab_markers(user_id, lower(name));

CREATE TABLE IF NOT EXISTS public.lab_results (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    marker_key TEXT,
    custom_marker_id UUID REFERENCES public.lab_markers(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    value_numeric DOUBLE PRECISION,
    value_text TEXT,
    unit TEXT NOT NULL DEFAULT '',
    ref_range_low DOUBLE PRECISION,
    ref_range_high DOUBLE PRECISION,
    lab_name TEXT,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    CONSTRAINT lab_results_one_marker_check
        CHECK ((marker_key IS NOT NULL) <> (custom_marker_id IS NOT NULL)),
    CONSTRAINT lab_results_value_check
        CHECK (value_numeric IS NOT NULL OR value_text IS NOT NULL),
    CONSTRAINT lab_results_source_check
        CHECK (source IN ('manual', 'report', 'fhir')),
    CONSTRAINT lab_results_ref_range_check
        CHECK (ref_range_low IS NULL OR ref_range_high IS NULL OR ref_range_low <= ref_range_high)
);

CREATE INDEX IF NOT EXISTS idx_lab_results_user_date
    ON public.lab_results(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_lab_results_user_key_date
    ON public.lab_results(user_id, marker_key, entry_date DESC)
    WHERE marker_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lab_results_user_custom_date
    ON public.lab_results(user_id, custom_marker_id, entry_date DESC)
    WHERE custom_marker_id IS NOT NULL;

COMMENT ON TABLE public.lab_markers IS 'A user''s own lab markers. Built-in markers are identified by key in @workspace/shared and are not stored.';
COMMENT ON COLUMN public.lab_markers.ref_range_low IS 'Default lower reference bound, in the marker unit. NULL when unknown.';
COMMENT ON TABLE public.lab_results IS 'One lab result for a built-in marker (marker_key) or a custom marker (custom_marker_id). Keeps its own unit and reference range as printed by the lab.';
COMMENT ON COLUMN public.lab_results.value_text IS 'Qualitative result (e.g. Negative, Trace) when there is no number.';
COMMENT ON COLUMN public.lab_results.source IS 'How the result got here: manual, report (imported from a PDF or photo) or fhir.';
