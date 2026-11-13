-- Migration: oral care sessions (#1862) and the daily brushing goal
-- Date: 2026-11-08
-- Re-runnable: every statement is guarded.

CREATE TABLE IF NOT EXISTS public.oral_care_sessions (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    -- Null for a quick "I brushed" log with no timing.
    duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    care_type VARCHAR(30) NOT NULL DEFAULT 'brushing',
    custom_label VARCHAR(50),
    -- manual | timer | the health source that imported it
    provider VARCHAR(50) NOT NULL DEFAULT 'manual',
    external_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    CONSTRAINT chk_oral_care_sessions_care_type CHECK (
        care_type IN ('brushing', 'flossing', 'mouthwash', 'tongue_cleaning', 'other')
    ),
    -- "other" needs a name; the named types never carry one.
    CONSTRAINT chk_oral_care_sessions_custom_label CHECK (
        (care_type = 'other' AND custom_label IS NOT NULL AND btrim(custom_label) <> '')
        OR (care_type <> 'other' AND custom_label IS NULL)
    ),
    CONSTRAINT chk_oral_care_sessions_time_order CHECK (
        start_time IS NULL OR end_time IS NULL OR end_time >= start_time
    )
);

CREATE INDEX IF NOT EXISTS idx_oral_care_sessions_user_date
    ON public.oral_care_sessions(user_id, entry_date);

-- Idempotency for health-store sync: re-sending a sample updates its row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_oral_care_sessions_user_external
    ON public.oral_care_sessions(user_id, provider, external_id)
    WHERE external_id IS NOT NULL;

ALTER TABLE public.user_preferences
    ADD COLUMN IF NOT EXISTS oral_care_daily_target SMALLINT NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS oral_care_target_seconds INTEGER NOT NULL DEFAULT 120;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_preferences_oral_care_daily_target'
    ) THEN
        ALTER TABLE public.user_preferences
            ADD CONSTRAINT chk_user_preferences_oral_care_daily_target
            CHECK (oral_care_daily_target BETWEEN 1 AND 6);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_preferences_oral_care_target_seconds'
    ) THEN
        ALTER TABLE public.user_preferences
            ADD CONSTRAINT chk_user_preferences_oral_care_target_seconds
            CHECK (oral_care_target_seconds BETWEEN 30 AND 600);
    END IF;
END $$;
