-- Migration: Create action_tags, the saved actions behind NFC tags (issue #941)
-- Date: 2026-10-30

-- A tag sticker holds only a link with a random tag_code. What a tap does is
-- stored here, so an action can be changed without rewriting the sticker and
-- the sticker never carries health data. `action` is a JSON object validated by
-- the API (shared tagActionSchema, discriminated on "type").
CREATE TABLE IF NOT EXISTS public.action_tags (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    tag_code VARCHAR(64) NOT NULL,
    label VARCHAR(120) NOT NULL,
    action JSONB NOT NULL,
    -- When true a tap asks for confirmation before the action runs.
    ask_before_running BOOLEAN NOT NULL DEFAULT FALSE,
    -- Claimed by the scan endpoint to drop a double read of the same sticker.
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id),
    updated_by_user_id UUID REFERENCES public."user"(id),
    CONSTRAINT action_tags_user_code_unique UNIQUE (user_id, tag_code),
    CONSTRAINT action_tags_action_check CHECK (
        jsonb_typeof(action) = 'object' AND action ? 'type'
    ),
    CONSTRAINT action_tags_code_check CHECK (char_length(tag_code) >= 16)
);

CREATE INDEX IF NOT EXISTS idx_action_tags_user_id ON public.action_tags (user_id);
