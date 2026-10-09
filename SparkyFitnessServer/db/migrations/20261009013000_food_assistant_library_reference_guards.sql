-- Enforce new variant references without rewriting old diary snapshots or
-- requiring a repair of legacy orphan IDs. NOT VALID still checks new writes
-- and takes the reference lock that makes concurrent variant undo safe.
ALTER TABLE public.food_entries
  ADD CONSTRAINT food_entries_variant_id_fkey
  FOREIGN KEY (variant_id) REFERENCES public.food_variants(id)
  ON DELETE SET NULL NOT VALID;

CREATE INDEX IF NOT EXISTS food_entries_variant_id_idx
  ON public.food_entries (variant_id) WHERE variant_id IS NOT NULL;

-- A snapshot can retain its variant independently of its parent food ID.
-- Check that reference directly, including rows hidden by RLS. Keep queued
-- contribution state as a dependant rather than cascading it during undo.
CREATE OR REPLACE FUNCTION public.assistant_food_has_dependants(target_food uuid, target_variant uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off AS $$
DECLARE
  target_variants uuid[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.foods f WHERE f.id=target_food AND f.user_id=public.authenticated_user_id())
    OR (target_variant IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.food_variants v WHERE v.id=target_variant AND v.food_id=target_food)) THEN
    RAISE EXCEPTION 'Food or serving variant not owned by the current actor.' USING ERRCODE = '42501';
  END IF;
  SELECT array_agg(id) INTO target_variants FROM public.food_variants
    WHERE food_id=target_food AND (target_variant IS NULL OR id=target_variant);
  RETURN EXISTS (SELECT 1 FROM public.food_entries WHERE (target_variant IS NULL AND food_id=target_food) OR variant_id=ANY(target_variants))
    OR EXISTS (SELECT 1 FROM public.meal_foods WHERE (target_variant IS NULL AND food_id=target_food) OR variant_id=ANY(target_variants))
    OR EXISTS (SELECT 1 FROM public.meal_plans WHERE (target_variant IS NULL AND food_id=target_food) OR variant_id=ANY(target_variants))
    OR EXISTS (SELECT 1 FROM public.meal_plan_template_assignments WHERE (target_variant IS NULL AND food_id=target_food) OR variant_id=ANY(target_variants))
    OR EXISTS (SELECT 1 FROM public.food_favorites WHERE food_id=target_food AND target_variant IS NULL)
    OR EXISTS (SELECT 1 FROM public.user_water_containers WHERE (target_variant IS NULL AND linked_food_id=target_food) OR linked_variant_id=ANY(target_variants))
    OR EXISTS (SELECT 1 FROM public.openfoodfacts_sync_queue WHERE food_id=target_food AND target_variant IS NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.assistant_food_has_dependants(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_food_has_dependants(uuid,uuid) TO PUBLIC;
