-- Add allergens and traces columns to food_variants and food_entries
ALTER TABLE public.food_variants
ADD COLUMN allergens text[],
ADD COLUMN traces text[];

ALTER TABLE public.food_entries
ADD COLUMN allergens text[],
ADD COLUMN traces text[];

-- User allergen preferences for warning badges
CREATE TABLE public.user_allergen_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  allergen_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, allergen_name)
);

ALTER TABLE public.user_allergen_preferences ENABLE ROW LEVEL SECURITY;
