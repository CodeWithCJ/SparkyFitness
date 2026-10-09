ALTER TABLE public.food_assistant_tasks DROP CONSTRAINT IF EXISTS food_assistant_tasks_kind_check;
ALTER TABLE public.food_assistant_tasks ADD CONSTRAINT food_assistant_tasks_kind_check
  CHECK (kind IN ('recipe','meal_plan','diary','shopping','analysis','food'));

-- Only a boolean leaves this function. The actor must own the food, including
-- when checking references hidden by RLS before undo removes a new variant.
CREATE OR REPLACE FUNCTION public.assistant_food_has_dependants(target_food uuid, target_variant uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.foods f WHERE f.id=target_food AND f.user_id=public.authenticated_user_id())
    OR (target_variant IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.food_variants v WHERE v.id=target_variant AND v.food_id=target_food)) THEN
    RAISE EXCEPTION 'Food or serving variant not owned by the current actor.' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.food_entries WHERE food_id=target_food AND (target_variant IS NULL OR variant_id=target_variant))
    OR EXISTS (SELECT 1 FROM public.meal_foods WHERE food_id=target_food AND (target_variant IS NULL OR variant_id=target_variant))
    OR EXISTS (SELECT 1 FROM public.meal_plans WHERE food_id=target_food AND (target_variant IS NULL OR variant_id=target_variant))
    OR EXISTS (SELECT 1 FROM public.meal_plan_template_assignments WHERE food_id=target_food AND (target_variant IS NULL OR variant_id=target_variant))
    OR EXISTS (SELECT 1 FROM public.food_favorites WHERE food_id=target_food AND target_variant IS NULL)
    OR EXISTS (SELECT 1 FROM public.user_water_containers WHERE linked_food_id=target_food AND (target_variant IS NULL OR linked_variant_id=target_variant));
END;
$$;
REVOKE ALL ON FUNCTION public.assistant_food_has_dependants(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_food_has_dependants(uuid,uuid) TO PUBLIC;
