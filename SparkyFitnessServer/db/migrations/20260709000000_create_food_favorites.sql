-- Create food_favorites table
-- Lets a user "star" a food or meal so it surfaces in a Favorites section
-- on the food search empty-state. Exactly one of food_id / meal_id is set.
CREATE TABLE IF NOT EXISTS public.food_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    food_id UUID REFERENCES public.foods(id) ON DELETE CASCADE,
    meal_id UUID REFERENCES public.meals(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT food_favorites_one_target CHECK (
        (food_id IS NOT NULL AND meal_id IS NULL)
        OR (food_id IS NULL AND meal_id IS NOT NULL)
    ),
    CONSTRAINT food_favorites_unique_food UNIQUE (user_id, food_id),
    CONSTRAINT food_favorites_unique_meal UNIQUE (user_id, meal_id)
);

CREATE INDEX IF NOT EXISTS idx_food_favorites_user_id ON public.food_favorites(user_id);

-- Index the FK targets so an ON DELETE CASCADE from foods/meals is an index
-- lookup, not a full scan. The unique constraints lead with user_id, so they
-- cannot serve a cascade filtered on food_id / meal_id alone. Partial to skip
-- the NULL side of the one-of CHECK.
CREATE INDEX IF NOT EXISTS idx_food_favorites_food_id ON public.food_favorites(food_id) WHERE food_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_food_favorites_meal_id ON public.food_favorites(meal_id) WHERE meal_id IS NOT NULL;

-- RLS Policies are enabled and defined in rls_policies.sql
-- Permissions are granted in grantPermissions.js
