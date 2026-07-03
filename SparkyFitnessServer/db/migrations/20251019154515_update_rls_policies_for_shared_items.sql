-- Update RLS policies to allow referencing public/shared foods and meals

-- Policy for food_entries table (Diary entries)
DROP POLICY IF EXISTS food_entries_insert_policy ON public.food_entries;
CREATE POLICY food_entries_insert_policy ON public.food_entries
FOR INSERT
WITH CHECK (
    (
        -- User can insert their own food entries
        user_id = current_setting('app.user_id')::uuid
        OR
        -- User can insert food entries for another user if they have 'can_manage_diary' permission
        EXISTS (
            SELECT 1
            FROM public.family_access fa
            WHERE fa.owner_user_id = public.food_entries.user_id
              AND fa.family_user_id = current_setting('app.user_id')::uuid
              AND fa.is_active = TRUE
              AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
        )
    )
    AND
    -- The food being referenced must be visible to the current user (via foods_select_policy)
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = public.food_entries.food_id
    )
);

-- Policy for meal_foods table
DROP POLICY IF EXISTS meal_foods_rls ON public.meal_foods;
CREATE POLICY meal_foods_rls ON public.meal_foods
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.meals m
        WHERE m.id = meal_foods.meal_id
    )
    AND
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = public.meal_foods.food_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.meals m
        WHERE m.id = meal_foods.meal_id
    )
    AND
    EXISTS (
        SELECT 1 FROM public.foods f
        WHERE f.id = public.meal_foods.food_id
    )
);

-- Policy for meal_plan_template_assignments table
DROP POLICY IF EXISTS meal_plan_template_assignments_rls ON public.meal_plan_template_assignments;
CREATE POLICY meal_plan_template_assignments_rls ON public.meal_plan_template_assignments
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.meal_plan_templates mpt
        WHERE mpt.id = meal_plan_template_assignments.template_id
          AND mpt.user_id = current_setting('app.user_id')::uuid
    )
    AND (
        (meal_plan_template_assignments.item_type = 'food' AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_plan_template_assignments.food_id))
        OR
        (meal_plan_template_assignments.item_type = 'meal' AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_plan_template_assignments.meal_id))
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.meal_plan_templates mpt
        WHERE mpt.id = meal_plan_template_assignments.template_id
          AND mpt.user_id = current_setting('app.user_id')::uuid
    )
    AND (
        (meal_plan_template_assignments.item_type = 'food' AND EXISTS (SELECT 1 FROM public.foods f WHERE f.id = meal_plan_template_assignments.food_id))
        OR
        (meal_plan_template_assignments.item_type = 'meal' AND EXISTS (SELECT 1 FROM public.meals m WHERE m.id = meal_plan_template_assignments.meal_id))
    )
);