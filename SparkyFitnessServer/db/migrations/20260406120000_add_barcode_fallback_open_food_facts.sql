ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS barcode_fallback_open_food_facts BOOLEAN DEFAULT TRUE;
