-- Migration: Create plate_inventories, the bars and plates a person owns
-- Date: 2026-10-24

-- One row per person. bars and plates are JSON arrays validated by the API
-- (shared savePlateInventoryBodySchema); weights are in weight_unit.
CREATE TABLE IF NOT EXISTS public.plate_inventories (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    weight_unit VARCHAR(3) NOT NULL DEFAULT 'kg',
    bars JSONB NOT NULL DEFAULT '[]'::jsonb,
    plates JSONB NOT NULL DEFAULT '[]'::jsonb,
    collars_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    -- Weight of one collar, in weight_unit.
    collar_weight NUMERIC(7, 3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id),
    updated_by_user_id UUID REFERENCES public."user"(id),
    CONSTRAINT plate_inventories_user_unique UNIQUE (user_id),
    CONSTRAINT plate_inventories_unit_check CHECK (weight_unit IN ('kg', 'lbs')),
    CONSTRAINT plate_inventories_bars_check CHECK (jsonb_typeof(bars) = 'array'),
    CONSTRAINT plate_inventories_plates_check CHECK (jsonb_typeof(plates) = 'array'),
    CONSTRAINT plate_inventories_collar_check CHECK (collar_weight >= 0)
);
