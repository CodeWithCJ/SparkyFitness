-- Issue #1795: changing a calorie setting rewrote the targets of past days,
-- because every day read the one current user_preferences row. Each change of
-- a setting that feeds a day's calorie target now records the rules in force
-- from that day on, and a day resolves the latest row on or before it.
CREATE TABLE IF NOT EXISTS public.user_calorie_rule_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    -- '-infinity' marks the rules in force before the first recorded change.
    effective_date DATE NOT NULL,
    goal_mode CHARACTER VARYING(50),
    goal_mode_calculation_method CHARACTER VARYING(50),
    goal_mode_custom_percentage INTEGER,
    goal_mode_weekly_change_kg DOUBLE PRECISION,
    calorie_goal_adjustment_mode TEXT,
    exercise_calorie_percentage INTEGER,
    tdee_allow_negative_adjustment BOOLEAN,
    calorie_safety_floor_mode TEXT,
    calorie_safety_floor_value INTEGER,
    adaptive_activity_separate BOOLEAN,
    bmr_algorithm TEXT,
    activity_level CHARACTER VARYING(20),
    use_external_bmr BOOLEAN,
    include_bmr_in_net_calories BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_calorie_rule_history_user_day_key UNIQUE (user_id, effective_date)
);

COMMENT ON TABLE public.user_calorie_rule_history IS
  'The calorie settings in force from effective_date on, so a past day keeps the target it was logged against. Written by a trigger on user_preferences.';

-- Recorded in the database so that every writer of user_preferences (settings
-- screens, the AI tools, onboarding) is covered without calling anything.
CREATE OR REPLACE FUNCTION public.record_calorie_rule_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  -- An unknown zone would make AT TIME ZONE fail the whole preference update.
  -- Case-insensitive, because the server accepts any casing Intl accepts.
  zone TEXT := COALESCE(
    (SELECT name FROM pg_timezone_names
     WHERE lower(name) = lower(NEW.timezone) LIMIT 1),
    'UTC'
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A preferences row created again after a delete. With no history its
    -- settings already apply to every day; with history they must be recorded,
    -- or the last recorded row would override them.
    IF NOT EXISTS (
      SELECT 1 FROM public.user_calorie_rule_history WHERE user_id = NEW.user_id
    ) THEN
      RETURN NULL;
    END IF;
  ELSE
    -- The first change after this migration also keeps the old rules for every
    -- earlier day; without it those days would fall back to the new settings.
    INSERT INTO public.user_calorie_rule_history (
      user_id, effective_date,
      goal_mode, goal_mode_calculation_method, goal_mode_custom_percentage,
      goal_mode_weekly_change_kg, calorie_goal_adjustment_mode, exercise_calorie_percentage,
      tdee_allow_negative_adjustment, calorie_safety_floor_mode,
      calorie_safety_floor_value, adaptive_activity_separate, bmr_algorithm,
      activity_level, use_external_bmr, include_bmr_in_net_calories
    )
    SELECT
      OLD.user_id, '-infinity',
      OLD.goal_mode, OLD.goal_mode_calculation_method, OLD.goal_mode_custom_percentage,
      OLD.goal_mode_weekly_change_kg, OLD.calorie_goal_adjustment_mode, OLD.exercise_calorie_percentage,
      OLD.tdee_allow_negative_adjustment, OLD.calorie_safety_floor_mode,
      OLD.calorie_safety_floor_value, OLD.adaptive_activity_separate, OLD.bmr_algorithm,
      OLD.activity_level, OLD.use_external_bmr, OLD.include_bmr_in_net_calories
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_calorie_rule_history WHERE user_id = OLD.user_id
    );
  END IF;

  -- A change applies from today in the user's zone; a second change on the
  -- same day replaces the first.
  INSERT INTO public.user_calorie_rule_history (
    user_id, effective_date,
    goal_mode, goal_mode_calculation_method, goal_mode_custom_percentage,
    goal_mode_weekly_change_kg, calorie_goal_adjustment_mode, exercise_calorie_percentage,
    tdee_allow_negative_adjustment, calorie_safety_floor_mode,
    calorie_safety_floor_value, adaptive_activity_separate, bmr_algorithm,
    activity_level, use_external_bmr, include_bmr_in_net_calories
  )
  VALUES (
    NEW.user_id, (now() AT TIME ZONE zone)::date,
    NEW.goal_mode, NEW.goal_mode_calculation_method, NEW.goal_mode_custom_percentage,
    NEW.goal_mode_weekly_change_kg, NEW.calorie_goal_adjustment_mode, NEW.exercise_calorie_percentage,
    NEW.tdee_allow_negative_adjustment, NEW.calorie_safety_floor_mode,
    NEW.calorie_safety_floor_value, NEW.adaptive_activity_separate, NEW.bmr_algorithm,
    NEW.activity_level, NEW.use_external_bmr, NEW.include_bmr_in_net_calories
  )
  ON CONFLICT (user_id, effective_date) DO UPDATE SET
    goal_mode = EXCLUDED.goal_mode,
    goal_mode_calculation_method = EXCLUDED.goal_mode_calculation_method,
    goal_mode_custom_percentage = EXCLUDED.goal_mode_custom_percentage,
    goal_mode_weekly_change_kg = EXCLUDED.goal_mode_weekly_change_kg,
    calorie_goal_adjustment_mode = EXCLUDED.calorie_goal_adjustment_mode,
    exercise_calorie_percentage = EXCLUDED.exercise_calorie_percentage,
    tdee_allow_negative_adjustment = EXCLUDED.tdee_allow_negative_adjustment,
    calorie_safety_floor_mode = EXCLUDED.calorie_safety_floor_mode,
    calorie_safety_floor_value = EXCLUDED.calorie_safety_floor_value,
    adaptive_activity_separate = EXCLUDED.adaptive_activity_separate,
    bmr_algorithm = EXCLUDED.bmr_algorithm,
    activity_level = EXCLUDED.activity_level,
    use_external_bmr = EXCLUDED.use_external_bmr,
    include_bmr_in_net_calories = EXCLUDED.include_bmr_in_net_calories,
    updated_at = now();

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS record_calorie_rule_change ON public.user_preferences;
CREATE TRIGGER record_calorie_rule_change
    AFTER UPDATE ON public.user_preferences
    FOR EACH ROW
    WHEN (
      ROW(
        OLD.goal_mode, OLD.goal_mode_calculation_method, OLD.goal_mode_custom_percentage,
        OLD.goal_mode_weekly_change_kg, OLD.calorie_goal_adjustment_mode, OLD.exercise_calorie_percentage,
        OLD.tdee_allow_negative_adjustment, OLD.calorie_safety_floor_mode,
        OLD.calorie_safety_floor_value, OLD.adaptive_activity_separate, OLD.bmr_algorithm,
        OLD.activity_level, OLD.use_external_bmr, OLD.include_bmr_in_net_calories
      ) IS DISTINCT FROM ROW(
        NEW.goal_mode, NEW.goal_mode_calculation_method, NEW.goal_mode_custom_percentage,
        NEW.goal_mode_weekly_change_kg, NEW.calorie_goal_adjustment_mode, NEW.exercise_calorie_percentage,
        NEW.tdee_allow_negative_adjustment, NEW.calorie_safety_floor_mode,
        NEW.calorie_safety_floor_value, NEW.adaptive_activity_separate, NEW.bmr_algorithm,
        NEW.activity_level, NEW.use_external_bmr, NEW.include_bmr_in_net_calories
      )
    )
    EXECUTE FUNCTION public.record_calorie_rule_change();

DROP TRIGGER IF EXISTS record_calorie_rule_change_on_insert ON public.user_preferences;
CREATE TRIGGER record_calorie_rule_change_on_insert
    AFTER INSERT ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.record_calorie_rule_change();
