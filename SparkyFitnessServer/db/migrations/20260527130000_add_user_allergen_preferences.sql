CREATE TABLE public.user_allergen_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  allergen_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, allergen_name)
);

ALTER TABLE public.user_allergen_preferences ENABLE ROW LEVEL SECURITY;
