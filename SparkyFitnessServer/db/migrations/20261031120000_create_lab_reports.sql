-- Migration: Lab report imports get a row, so the results a report produced can
-- be found and deleted together. A result keeps a nullable link to its report;
-- results typed in by hand have none. Deleting a report deletes its results.

CREATE TABLE IF NOT EXISTS public.lab_reports (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    lab_name TEXT,
    collected_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lab_reports_user_created
    ON public.lab_reports(user_id, created_at DESC);

ALTER TABLE public.lab_results
    ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES public.lab_reports(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lab_results_report
    ON public.lab_results(report_id)
    WHERE report_id IS NOT NULL;

COMMENT ON TABLE public.lab_reports IS 'One imported lab report (a PDF or photo read into results). The report itself is not stored, only which results came from it.';
COMMENT ON COLUMN public.lab_results.report_id IS 'The imported report this result came from. NULL for results entered by hand. Deleting the report deletes the result.';
