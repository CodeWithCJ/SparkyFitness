CREATE TABLE IF NOT EXISTS onboarding_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,    
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  sex VARCHAR(10),
  primary_goal VARCHAR(20),
  current_weight NUMERIC(5, 2),
  height NUMERIC(5, 2),
  birth_date DATE,
  body_fat_range VARCHAR(20),
  target_weight NUMERIC(5, 2),
  meals_per_day INTEGER,
  activity_level VARCHAR(20),
  add_burned_calories BOOLEAN,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.onboarding_status (user_id, onboarding_complete)
SELECT 
    u.id, 
    FALSE 
FROM 
    auth.users u
LEFT JOIN 
    public.onboarding_status os ON u.id = os.user_id
WHERE 
    os.user_id IS NULL; 

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.onboarding_status (user_id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END
$$;
