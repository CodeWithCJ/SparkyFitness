-- A recipe undo must not cascade into another person's plans or favorites.
-- Return only a boolean for a recipe owned by the authenticated actor. RLS on
-- the referencing tables would otherwise hide other people's references.
CREATE OR REPLACE FUNCTION public.assistant_recipe_has_dependants(recipe_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.meals m WHERE m.id = recipe_id
    AND m.user_id = public.authenticated_user_id()) THEN
    RAISE EXCEPTION 'Recipe not found or not owned by the current actor.' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.food_entries WHERE meal_id = recipe_id)
    OR EXISTS (SELECT 1 FROM public.food_entry_meals WHERE meal_template_id = recipe_id)
    OR EXISTS (SELECT 1 FROM public.meal_plans WHERE meal_id = recipe_id)
    OR EXISTS (SELECT 1 FROM public.meal_plan_template_assignments WHERE meal_id = recipe_id)
    OR EXISTS (SELECT 1 FROM public.meal_foods WHERE child_meal_id = recipe_id)
    OR EXISTS (SELECT 1 FROM public.food_favorites WHERE meal_id = recipe_id);
END;
$$;
REVOKE ALL ON FUNCTION public.assistant_recipe_has_dependants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_recipe_has_dependants(uuid) TO PUBLIC;
