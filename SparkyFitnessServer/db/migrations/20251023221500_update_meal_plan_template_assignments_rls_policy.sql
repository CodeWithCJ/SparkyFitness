-- Drop the existing restrictive policy on meal_plan_template_assignments
DROP POLICY IF EXISTS meal_plan_template_assignments_all_policy ON public.meal_plan_template_assignments;

-- Create a new policy for meal_plan_template_assignments
CREATE POLICY meal_plan_template_assignments_all_policy ON public.meal_plan_template_assignments
FOR ALL
TO PUBLIC
USING (
    EXISTS (
        SELECT 1
        FROM public.meal_plan_templates mpt
        WHERE mpt.id = meal_plan_template_assignments.template_id
          AND mpt.user_id = current_setting('app.user_id')::uuid
    )
    OR
    EXISTS (
        SELECT 1
        FROM public.meals m
        WHERE m.id = meal_plan_template_assignments.meal_id
          AND (
                m.user_id = current_setting('app.user_id')::uuid
                OR m.is_public = TRUE
                OR EXISTS (
                    SELECT 1 FROM public.family_access fa
                    WHERE fa.family_user_id = m.user_id
                      AND fa.owner_user_id = current_setting('app.user_id')::uuid
                      AND fa.is_active = TRUE
                      AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
                )
                OR EXISTS (
                    SELECT 1 FROM public.family_access fa
                    WHERE fa.family_user_id = m.user_id
                      AND fa.owner_user_id = current_setting('app.user_id')::uuid
                      AND fa.is_active = TRUE
                      AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
                )
            )
    )
    OR
    EXISTS (
        SELECT 1
        FROM public.foods f
        WHERE f.id = meal_plan_template_assignments.food_id
          AND (
                f.user_id = current_setting('app.user_id')::uuid
                OR f.shared_with_public = TRUE
                OR EXISTS (
                    SELECT 1 FROM public.family_access fa
                    WHERE fa.family_user_id = f.user_id
                      AND fa.owner_user_id = current_setting('app.user_id')::uuid
                      AND fa.is_active = TRUE
                      AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
                )
                OR EXISTS (
                    SELECT 1 FROM public.family_access fa
                    WHERE fa.family_user_id = f.user_id
                      AND fa.owner_user_id = current_setting('app.user_id')::uuid
                      AND fa.is_active = TRUE
                      AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
                )
            )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.meal_plan_templates mpt
        WHERE mpt.id = meal_plan_template_assignments.template_id
          AND mpt.user_id = current_setting('app.user_id')::uuid
    )
    AND
    (
        meal_plan_template_assignments.food_id IS NULL
        OR
        EXISTS (
            SELECT 1
            FROM public.foods f
            WHERE f.id = meal_plan_template_assignments.food_id
              AND (
                    f.user_id = current_setting('app.user_id')::uuid
                    OR f.shared_with_public = TRUE
                    OR EXISTS (
                        SELECT 1 FROM public.family_access fa
                        WHERE fa.family_user_id = f.user_id
                          AND fa.owner_user_id = current_setting('app.user_id')::uuid
                          AND fa.is_active = TRUE
                          AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
                    )
                    OR EXISTS (
                        SELECT 1 FROM public.family_access fa
                        WHERE fa.family_user_id = f.user_id
                          AND fa.owner_user_id = current_setting('app.user_id')::uuid
                          AND fa.is_active = TRUE
                          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
                    )
                )
        )
    )
    AND
    (
        meal_plan_template_assignments.variant_id IS NULL
        OR
        EXISTS (
            SELECT 1
            FROM public.food_variants fv
            JOIN public.foods f ON fv.food_id = f.id
            WHERE fv.id = meal_plan_template_assignments.variant_id
              AND (
                    f.user_id = current_setting('app.user_id')::uuid
                    OR f.shared_with_public = TRUE
                    OR EXISTS (
                        SELECT 1 FROM public.family_access fa
                        WHERE fa.family_user_id = f.user_id
                          AND fa.owner_user_id = current_setting('app.user_id')::uuid
                          AND fa.is_active = TRUE
                          AND (fa.access_permissions->>'can_view_food_library')::boolean = TRUE
                    )
                    OR EXISTS (
                        SELECT 1 FROM public.family_access fa
                        WHERE fa.family_user_id = f.user_id
                          AND fa.owner_user_id = current_setting('app.user_id')::uuid
                          AND fa.is_active = TRUE
                          AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
                    )
                )
        )
    )
);