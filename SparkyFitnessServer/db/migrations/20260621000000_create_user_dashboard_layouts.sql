-- Customizable dashboard widget layouts (issue: resizable diary widgets).
--
-- Stores per-user, per-page widget grid layouts for the web app. The first
-- consumer is the Diary page (page_key = 'diary'); the table is intentionally
-- generic so other dashboards (reports, home, etc.) can reuse it later.
--
-- A blank table (no row for a user/page) means "use the default layout" -- the
-- frontend generates defaults dynamically from the user's current widget set,
-- so we do not seed rows here.
--
-- Shapes:
--   layout : { lg: Layout[], md: Layout[], sm: Layout[], xs: Layout[] }
--            Layout = { i, x, y, w, h, minW?, minH? }
--   hidden : string[]  (widget keys the user has hidden)
--
-- RLS is enabled and the owner_policy is applied centrally in
-- db/rls_policies.sql (reapplied on every startup). Grants to the app user are
-- handled dynamically by db/grantPermissions.ts. Guarded so it is safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    page_key text NOT NULL,
    layout jsonb NOT NULL,
    hidden jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_dashboard_layouts_user_page_unique UNIQUE (user_id, page_key)
);

-- The unique constraint above builds the composite index used for the only
-- lookup pattern (by user_id + page_key), so no extra index is needed.

COMMIT;
