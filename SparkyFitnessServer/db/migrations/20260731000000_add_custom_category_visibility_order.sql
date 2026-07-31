-- Custom-category visibility and ordering (issue #1988):
--   1. is_visible controls whether a category appears in input screens and the
--      daily summary. Hidden categories stay visible in the manager, reports,
--      and history.
--   2. sort_order drives ascending display order within a user (tie-break
--      created_at, then id). New categories default to max(sort_order)+10.
-- Each block is idempotent, so a re-run (or a database that already applied a
-- partial earlier version) is a no-op.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'custom_categories'
        AND column_name = 'is_visible'
    ) THEN
        ALTER TABLE custom_categories
        ADD COLUMN is_visible boolean NOT NULL DEFAULT true;

        ALTER TABLE custom_categories
        ADD COLUMN sort_order integer NOT NULL DEFAULT 100;

        -- One-time deterministic backfill for pre-existing categories: a user's
        -- first category gets 10, the next 20, etc. Only rows still holding the
        -- migration default are renumbered, so consciously set values on an
        -- already-patched database are never overwritten.
        UPDATE custom_categories
        SET sort_order = sub.rn * 10
        FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id ORDER BY created_at ASC, id ASC
                   ) AS rn
            FROM custom_categories
            WHERE sort_order = 100
        ) sub
        WHERE custom_categories.id = sub.id;

        COMMENT ON COLUMN public.custom_categories.is_visible IS
            'Controls whether the category appears in input screens and the daily summary. Hidden categories remain visible in the manager, reports, and history.';
        COMMENT ON COLUMN public.custom_categories.sort_order IS
            'Ascending display order within a user (tie-break created_at, then id). New categories default to max(sort_order)+10.';
    END IF;
END $$;

-- Ordering index covering the manager listing and reports joins.
CREATE INDEX IF NOT EXISTS idx_custom_categories_user_sort_order
    ON custom_categories (user_id, sort_order, created_at, id);
