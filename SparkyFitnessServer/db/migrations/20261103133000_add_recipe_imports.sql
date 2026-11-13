-- Private Mealie ingredient-import provenance and confirmed food mappings.
-- The meal and its diary snapshots keep the existing library/sharing policies.
CREATE TABLE IF NOT EXISTS public.recipe_imports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
 meal_id UUID NOT NULL UNIQUE REFERENCES public.meals(id) ON DELETE CASCADE,
 provider_id UUID NOT NULL REFERENCES public.external_data_providers(id) ON DELETE CASCADE,
 source JSONB NOT NULL CHECK (jsonb_typeof(source) = 'object'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recipe_imports_user ON public.recipe_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_imports_provider ON public.recipe_imports(provider_id);
CREATE TABLE IF NOT EXISTS public.recipe_food_mappings (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
 provider_id UUID NOT NULL REFERENCES public.external_data_providers(id) ON DELETE CASCADE,
 source_food_key TEXT NOT NULL,
 food_id UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
 variant_id UUID NOT NULL REFERENCES public.food_variants(id) ON DELETE CASCADE,
 quantity_per_source_unit DOUBLE PRECISION NOT NULL CHECK (quantity_per_source_unit > 0 AND quantity_per_source_unit < 'Infinity'::float8),
 unit TEXT NOT NULL CHECK (length(unit) > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,provider_id,source_food_key)
);
CREATE INDEX IF NOT EXISTS idx_recipe_food_mappings_provider ON public.recipe_food_mappings(provider_id);
CREATE INDEX IF NOT EXISTS idx_recipe_food_mappings_food ON public.recipe_food_mappings(food_id);
CREATE INDEX IF NOT EXISTS idx_recipe_food_mappings_variant ON public.recipe_food_mappings(variant_id);
ALTER TABLE public.recipe_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_food_mappings ENABLE ROW LEVEL SECURITY;
