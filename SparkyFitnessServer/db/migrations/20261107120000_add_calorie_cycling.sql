-- Calorie cycling (#2327): spread the weekly calorie budget over the weekdays.
-- `calorie_cycling_offsets` holds one raw percentage per weekday (index 1 =
-- Sunday in SQL, 0 in the app); the server scales the pattern so the week still
-- adds up to the day's target x 7. Off by default, so nobody's targets change
-- until they turn it on.

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS calorie_cycling_mode TEXT NOT NULL DEFAULT 'off'
  CHECK (calorie_cycling_mode IN ('off', 'training_rest', 'custom'));

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS calorie_cycling_offsets SMALLINT[] NOT NULL
  DEFAULT '{0,0,0,0,0,0,0}'
  CHECK (
    cardinality(calorie_cycling_offsets) = 7
    AND -40 <= ALL (calorie_cycling_offsets)
    AND 40 >= ALL (calorie_cycling_offsets)
  );

-- A past day's target uses the cycling settings in force on that day (#1795).
-- Days recorded before this migration predate the feature and stay off.
ALTER TABLE public.user_calorie_rule_history
ADD COLUMN IF NOT EXISTS calorie_cycling_mode TEXT NOT NULL DEFAULT 'off';

ALTER TABLE public.user_calorie_rule_history
ADD COLUMN IF NOT EXISTS calorie_cycling_offsets SMALLINT[] NOT NULL
  DEFAULT '{0,0,0,0,0,0,0}';

CREATE OR REPLACE FUNCTION public.record_calorie_rule_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  zone TEXT;
  prior_preferences public.user_preferences%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Recreated preferences must replace the latest recorded settings. An
    -- initially enabled opt-in also needs an off baseline for past days.
    IF NOT NEW.adjust_macros_with_exercise
       AND NEW.calorie_cycling_mode = 'off'
       AND NOT EXISTS (
         SELECT 1 FROM public.user_calorie_rule_history WHERE user_id = NEW.user_id
       ) THEN
      RETURN NULL;
    END IF;
    prior_preferences := NEW;
    prior_preferences.adjust_macros_with_exercise := FALSE;
    prior_preferences.calorie_cycling_mode := 'off';
    prior_preferences.calorie_cycling_offsets := '{0,0,0,0,0,0,0}';
  ELSE
    prior_preferences := OLD;
  END IF;

  -- Keep the rules before the first change. Even an initially enabled opt-in
  -- starts today; it must not change targets for earlier diary dates.
  INSERT INTO public.user_calorie_rule_history (
      user_id, effective_date,
      goal_mode, goal_mode_calculation_method, goal_mode_custom_percentage,
      goal_mode_weekly_change_kg, calorie_goal_adjustment_mode, exercise_calorie_percentage,
      tdee_allow_negative_adjustment, calorie_safety_floor_mode,
      calorie_safety_floor_value, adaptive_activity_separate, bmr_algorithm,
      activity_level, use_external_bmr, include_bmr_in_net_calories, adjust_macros_with_exercise,
      calorie_cycling_mode, calorie_cycling_offsets
    )
    SELECT
      prior_preferences.user_id, '-infinity',
      prior_preferences.goal_mode, prior_preferences.goal_mode_calculation_method, prior_preferences.goal_mode_custom_percentage,
      prior_preferences.goal_mode_weekly_change_kg, prior_preferences.calorie_goal_adjustment_mode, prior_preferences.exercise_calorie_percentage,
      prior_preferences.tdee_allow_negative_adjustment, prior_preferences.calorie_safety_floor_mode,
      prior_preferences.calorie_safety_floor_value, prior_preferences.adaptive_activity_separate, prior_preferences.bmr_algorithm,
      prior_preferences.activity_level, prior_preferences.use_external_bmr, prior_preferences.include_bmr_in_net_calories, prior_preferences.adjust_macros_with_exercise,
      prior_preferences.calorie_cycling_mode, prior_preferences.calorie_cycling_offsets
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_calorie_rule_history WHERE user_id = prior_preferences.user_id
    );

  -- An unknown zone would make AT TIME ZONE fail the whole preference update.
  -- Case-insensitive, because the server accepts any casing Intl accepts.
  zone := COALESCE(
    (SELECT name FROM pg_timezone_names
     WHERE lower(name) = lower(NEW.timezone) LIMIT 1),
    'UTC'
  );

  -- A change applies from today in the user's zone; a second change on the
  -- same day replaces the first.
  INSERT INTO public.user_calorie_rule_history (
    user_id, effective_date,
    goal_mode, goal_mode_calculation_method, goal_mode_custom_percentage,
    goal_mode_weekly_change_kg, calorie_goal_adjustment_mode, exercise_calorie_percentage,
    tdee_allow_negative_adjustment, calorie_safety_floor_mode,
    calorie_safety_floor_value, adaptive_activity_separate, bmr_algorithm,
    activity_level, use_external_bmr, include_bmr_in_net_calories, adjust_macros_with_exercise,
    calorie_cycling_mode, calorie_cycling_offsets
  )
  VALUES (
    NEW.user_id, (now() AT TIME ZONE zone)::date,
    NEW.goal_mode, NEW.goal_mode_calculation_method, NEW.goal_mode_custom_percentage,
    NEW.goal_mode_weekly_change_kg, NEW.calorie_goal_adjustment_mode, NEW.exercise_calorie_percentage,
    NEW.tdee_allow_negative_adjustment, NEW.calorie_safety_floor_mode,
    NEW.calorie_safety_floor_value, NEW.adaptive_activity_separate, NEW.bmr_algorithm,
    NEW.activity_level, NEW.use_external_bmr, NEW.include_bmr_in_net_calories, NEW.adjust_macros_with_exercise,
    NEW.calorie_cycling_mode, NEW.calorie_cycling_offsets
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
    adjust_macros_with_exercise = EXCLUDED.adjust_macros_with_exercise,
    calorie_cycling_mode = EXCLUDED.calorie_cycling_mode,
    calorie_cycling_offsets = EXCLUDED.calorie_cycling_offsets,
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
        OLD.activity_level, OLD.use_external_bmr, OLD.include_bmr_in_net_calories, OLD.adjust_macros_with_exercise,
        OLD.calorie_cycling_mode, OLD.calorie_cycling_offsets
      ) IS DISTINCT FROM ROW(
        NEW.goal_mode, NEW.goal_mode_calculation_method, NEW.goal_mode_custom_percentage,
        NEW.goal_mode_weekly_change_kg, NEW.calorie_goal_adjustment_mode, NEW.exercise_calorie_percentage,
        NEW.tdee_allow_negative_adjustment, NEW.calorie_safety_floor_mode,
        NEW.calorie_safety_floor_value, NEW.adaptive_activity_separate, NEW.bmr_algorithm,
        NEW.activity_level, NEW.use_external_bmr, NEW.include_bmr_in_net_calories, NEW.adjust_macros_with_exercise,
        NEW.calorie_cycling_mode, NEW.calorie_cycling_offsets
      )
    )
    EXECUTE FUNCTION public.record_calorie_rule_change();

DROP TRIGGER IF EXISTS record_calorie_rule_change_on_insert ON public.user_preferences;
CREATE TRIGGER record_calorie_rule_change_on_insert
    AFTER INSERT ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.record_calorie_rule_change();
