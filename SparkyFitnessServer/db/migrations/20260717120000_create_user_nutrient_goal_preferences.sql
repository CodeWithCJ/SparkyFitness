-- Per-user goal direction override for any nutrient (predefined or custom).
-- A nutrient's "goal direction" decides how progress toward its daily goal is
-- interpreted:
--   minimum -> more is better, fill toward the goal (existing default behavior)
--   maximum -> less is better, stay under the goal (e.g. added sugar, cholesterol)
--   target  -> hit a band, using target_min/target_max (e.g. calories when maintaining)
-- `nutrient_key` holds either a predefined nutrient id (matching the column
-- names on user_goals, e.g. "cholesterol", "calories") or a custom nutrient's
-- name (matching user_custom_nutrients.name / the custom_nutrients JSONB key
-- used elsewhere). No row for a given (user_id, nutrient_key) means "use the
-- built-in default direction" -- see CENTRAL_NUTRIENT_CONFIG on the frontend
-- and BUILTIN_MAXIMUM_DEFAULTS on the server, which must be kept in sync.
CREATE TABLE IF NOT EXISTS public.user_nutrient_goal_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    nutrient_key text NOT NULL,
    goal_type text NOT NULL CHECK (goal_type IN ('minimum', 'maximum', 'target')),
    target_min numeric,
    target_max numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_nutrient_goal_preferences_user_key_unique UNIQUE (user_id, nutrient_key),
    CONSTRAINT user_nutrient_goal_preferences_target_band CHECK (
        goal_type <> 'target' OR (target_min IS NOT NULL AND target_max IS NOT NULL AND target_min <= target_max)
    )
);

CREATE INDEX IF NOT EXISTS idx_user_nutrient_goal_preferences_user_id
    ON public.user_nutrient_goal_preferences(user_id);


ALTER TABLE "public"."user_preferences"
ADD COLUMN "added_sugar_algorithm" TEXT NOT NULL DEFAULT 'WHO_IDEAL';
