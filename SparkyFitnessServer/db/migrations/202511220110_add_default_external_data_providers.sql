-- Create a function to insert default external data providers for a new user
CREATE OR REPLACE FUNCTION public.create_default_external_data_providers(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Insert default 'free-exercise-db' provider
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
  ) VALUES (
    p_user_id, 'Free Exercise DB', 'free-exercise-db', TRUE, FALSE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO NOTHING;

  -- Insert default 'wger' provider
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
  ) VALUES (
    p_user_id, 'Wger', 'wger', TRUE, FALSE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO NOTHING;

  -- Insert default 'openfoodfacts' provider
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, shared_with_public, created_at, updated_at
  ) VALUES (
    p_user_id, 'Open Food Facts', 'openfoodfacts', TRUE, FALSE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO NOTHING;
END;
$$;

-- Alter the handle_new_user function to call create_default_external_data_providers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.onboarding_status (user_id)
  VALUES (new.id);

  -- Call the new function to create default external data providers
  PERFORM public.create_default_external_data_providers(new.id);

  RETURN new;
END;
$$;


-- Add a unique constraint to external_data_providers on user_id and provider_name
ALTER TABLE public.external_data_providers
ADD CONSTRAINT unique_user_provider UNIQUE (user_id, provider_name);