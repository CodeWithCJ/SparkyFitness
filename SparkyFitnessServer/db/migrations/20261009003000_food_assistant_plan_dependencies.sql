-- Plan creation undo may delete only its own unused template. This boolean
-- guard includes references hidden by RLS and never exposes their identities.
-- Retain fractional portions; the old two-decimal column rounded source amounts.
ALTER TABLE public.meal_plan_template_assignments ALTER COLUMN quantity TYPE numeric;
CREATE OR REPLACE FUNCTION public.assistant_plan_has_external_dependants(plan_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.meal_plan_templates t WHERE t.id = plan_id
    AND t.user_id = public.authenticated_user_id()) THEN
    RAISE EXCEPTION 'Plan not found or not owned by the current actor.' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.food_entries WHERE meal_plan_template_id = plan_id);
END;
$$;
REVOKE ALL ON FUNCTION public.assistant_plan_has_external_dependants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_plan_has_external_dependants(uuid) TO PUBLIC;
