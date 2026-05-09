-- Create the water_intake_log table for granular drink-by-drink tracking
CREATE TABLE IF NOT EXISTS public.water_intake_log (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    water_ml NUMERIC(10,3) NOT NULL,
    container_id INTEGER REFERENCES public.user_water_containers(id) ON DELETE SET NULL,
    container_name VARCHAR(255),
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id)
);

-- Index for efficient date-based lookups
CREATE INDEX IF NOT EXISTS idx_water_intake_log_user_date
    ON public.water_intake_log(user_id, entry_date);

-- Backfill: create one log entry per existing water_intake row
-- Since we don't have individual drink data, create a single entry with the full daily total
INSERT INTO public.water_intake_log (user_id, entry_date, water_ml, source, created_at, created_by_user_id)
SELECT
    wi.user_id,
    wi.entry_date,
    wi.water_ml,
    wi.source,
    wi.created_at,
    wi.created_by_user_id
FROM public.water_intake wi
WHERE wi.water_ml > 0
ON CONFLICT DO NOTHING;
