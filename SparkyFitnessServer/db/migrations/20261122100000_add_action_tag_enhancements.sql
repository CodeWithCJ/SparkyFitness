-- Migration: Add optional amount adjustment, custom timestamp, presets, and tap-to-log options to action_tags

ALTER TABLE public.action_tags
    ADD COLUMN IF NOT EXISTS allow_amount_adjustment BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS allow_custom_timestamp BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS tap_to_log BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS preset_amounts JSONB NULL;
