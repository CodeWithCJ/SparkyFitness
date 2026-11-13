-- Migration: Create shoes table and link exercise entries to a shoe
-- Date: 2026-10-12

CREATE TABLE IF NOT EXISTS public.shoes (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    brand VARCHAR(120),
    model VARCHAR(120),
    nickname VARCHAR(120),
    purchase_date DATE,
    purchase_price NUMERIC(10, 2),
    -- Mileage the pair already carried when it was added (kilometres).
    starting_distance_km NUMERIC(9, 2) NOT NULL DEFAULT 0,
    -- Distance after which the pair is considered worn out (kilometres).
    retirement_distance_km NUMERIC(9, 2) NOT NULL DEFAULT 800,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id),
    updated_by_user_id UUID REFERENCES public."user"(id),
    CONSTRAINT shoes_status_check CHECK (status IN ('active', 'retired')),
    CONSTRAINT shoes_distances_check CHECK (
        starting_distance_km >= 0 AND retirement_distance_km > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_shoes_user_status
    ON public.shoes(user_id, status);

-- At most one default shoe per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shoes_user_default
    ON public.shoes(user_id)
    WHERE is_default;

-- Exercise entries keep their shoe link when the pair is retired; deleting a
-- pair only clears the link (the diary entry stays intact).
ALTER TABLE public.exercise_entries
    ADD COLUMN IF NOT EXISTS shoe_id UUID REFERENCES public.shoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_entries_shoe_id
    ON public.exercise_entries(shoe_id)
    WHERE shoe_id IS NOT NULL;
