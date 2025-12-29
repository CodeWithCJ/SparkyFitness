-- Migration for adding custom nutrients feature

-- Create user_custom_nutrients table
CREATE TABLE public.user_custom_nutrients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
        unit TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT unique_user_nutrient_name UNIQUE (user_id, name)
);

-- Add custom_nutrients column to food_variants
ALTER TABLE public.food_variants
ADD COLUMN custom_nutrients JSONB DEFAULT '{}'::jsonb;

-- Add custom_nutrients column to food_entries
ALTER TABLE public.food_entries
ADD COLUMN custom_nutrients JSONB DEFAULT '{}'::jsonb;

-- Update RLS policies for food_variants to include custom_nutrients
-- This assumes existing RLS policies are defined in functions like create_library_policy or similar.
-- If not, specific ALTER POLICY statements would be needed.
-- For now, we'll assume the existing policies will automatically apply to new columns or need re-application.

-- Re-apply RLS policies for food_variants if necessary (example, adjust based on actual RLS implementation)
-- SELECT public.create_library_policy('food_variants', 'shared_with_public', ARRAY['food_list']);
-- SELECT public.create_owner_centric_all_policy('food_variants');

-- Re-apply RLS policies for food_entries if necessary
-- SELECT public.create_diary_policy('food_entries');

-- Add trigger to update updated_at for user_custom_nutrients
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.user_custom_nutrients
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();
