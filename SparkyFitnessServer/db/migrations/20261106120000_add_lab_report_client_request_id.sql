-- Migration: A lab report import carries a key the client makes once per
-- reviewed report. When a save reaches the server but its answer is lost, the
-- retry sends the same key and gets the saved report back instead of a second
-- copy of every result. Keys are per user; older imports have none.

ALTER TABLE public.lab_reports
    ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_reports_user_client_request
    ON public.lab_reports(user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN public.lab_reports.client_request_id IS 'Key the client sent with the import, so a retried save returns this report instead of saving it again. NULL for imports without one.';
