-- Consolidated DDL for SparkyFitness Database

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET search_path = public;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

COMMENT ON SCHEMA "public" IS 'standard public schema';

-- Extensions
-- NOTE: pg_stat_statements, pgcrypto, and uuid-ossp have been intentionally
-- removed. gen_random_uuid() is a PostgreSQL built-in since PG 13 and does
-- not require any extension. This allows the app to run without superuser
-- privileges on external/managed PostgreSQL clusters (e.g. CloudNativePG,
-- Amazon RDS, Azure Flexible Server).

-- Schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS system;

-- Tables

CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text UNIQUE,
    password_hash text NOT NULL,
    raw_user_meta_data jsonb,
    created_at timestamptz,
    updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS "public"."ai_service_settings" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "service_type" "text" NOT NULL,
    "service_name" "text" NOT NULL,
    "custom_url" "text",
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "system_prompt" "text" DEFAULT ''::"text",
    "model_name" "text",
    "encrypted_api_key" "text",
    "api_key_iv" "text"
);

CREATE TABLE IF NOT EXISTS "public"."check_in_measurements" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "weight" numeric,
    "neck" numeric,
    "waist" numeric,
    "hips" numeric,
    "steps" integer,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."custom_categories" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying(50) NOT NULL,
    "measurement_type" character varying(50) NOT NULL,
    "frequency" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "custom_categories_frequency_check" CHECK (("frequency" = ANY (ARRAY['All'::"text", 'Daily'::"text", 'Hourly'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."custom_measurements" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "value" numeric NOT NULL,
    "entry_date" "date" NOT NULL,
    "entry_hour" integer,
    "entry_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "public"."exercise_entries" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "duration_minutes" numeric NOT NULL,
    "calories_burned" numeric NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."exercises" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text",
    "calories_per_hour" numeric DEFAULT 300,
    "description" "text",
    "user_id" "uuid",
    "is_custom" boolean DEFAULT false,
    "shared_with_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."family_access" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "family_user_id" "uuid" NOT NULL,
    "family_email" "text" NOT NULL,
    "access_permissions" "jsonb" DEFAULT '{"calorie": false, "checkin": false, "reports": false}'::"jsonb" NOT NULL,
    "access_start_date" timestamp with time zone DEFAULT now() NOT NULL,
    "access_end_date" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    CONSTRAINT "family_access_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'inactive'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."food_data_providers" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider_name" "text" NOT NULL,
    "provider_type" "text" NOT NULL,
    "app_id" "text",
    "app_key" "text",
    "is_active" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "encrypted_app_id" TEXT,
    "app_id_iv" TEXT,
    "app_id_tag" TEXT,
    "encrypted_app_key" TEXT,
    "app_key_iv" TEXT,
    "app_key_tag" TEXT,
    CONSTRAINT "food_data_providers_provider_type_check" CHECK (("provider_type" = ANY (ARRAY['openfoodfacts'::"text", 'nutritionix'::"text", 'fatsecret'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."food_entries" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "food_id" "uuid" NOT NULL,
    "meal_type" "text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit" "text" DEFAULT 'g'::"text",
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "variant_id" "uuid",
    CONSTRAINT "food_entries_meal_type_check" CHECK (("meal_type" = ANY (ARRAY['breakfast'::"text", 'lunch'::"text", 'dinner'::"text", 'snacks'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."food_variants" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "food_id" "uuid" NOT NULL,
    "serving_size" numeric DEFAULT 1 NOT NULL,
    "serving_unit" "text" DEFAULT 'g'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "calories" numeric DEFAULT 0,
    "protein" numeric DEFAULT 0,
    "carbs" numeric DEFAULT 0,
    "fat" numeric DEFAULT 0,
    "saturated_fat" numeric DEFAULT 0,
    "polyunsaturated_fat" numeric DEFAULT 0,
    "monounsaturated_fat" numeric DEFAULT 0,
    "trans_fat" numeric DEFAULT 0,
    "cholesterol" numeric DEFAULT 0,
    "sodium" numeric DEFAULT 0,
    "potassium" numeric DEFAULT 0,
    "dietary_fiber" numeric DEFAULT 0,
    "sugars" numeric DEFAULT 0,
    "vitamin_a" numeric DEFAULT 0,
    "vitamin_c" numeric DEFAULT 0,
    "calcium" numeric DEFAULT 0,
    "iron" numeric DEFAULT 0,
    "is_default" BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS "public"."foods" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "brand" "text",
    "barcode" "text",
    "provider_external_id" "text",
    "is_custom" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "shared_with_public" boolean DEFAULT false,
    "provider_type" "text"
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "date_of_birth" "date",
    "phone" "text",
    "bio" "text",
    "phone_number" VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS "public"."sparky_chat_history" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "message_type" "text" NOT NULL,
    "content" "text" NOT NULL,
    "image_url" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "message" "text",
    "response" "text",
    CONSTRAINT "sparky_chat_history_message_type_check" CHECK (("message_type" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."user_api_keys" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "api_key" "text" NOT NULL,
    "description" "text",
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "last_used_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."user_goals" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "goal_date" "date",
    "calories" numeric DEFAULT 2000,
    "protein" numeric DEFAULT 150,
    "carbs" numeric DEFAULT 250,
    "fat" numeric DEFAULT 67,
    "water_goal" integer DEFAULT 8,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    "saturated_fat" numeric DEFAULT 20,
    "polyunsaturated_fat" numeric DEFAULT 10,
    "monounsaturated_fat" numeric DEFAULT 25,
    "trans_fat" numeric DEFAULT 0,
    "cholesterol" numeric DEFAULT 300,
    "sodium" numeric DEFAULT 2300,
    "potassium" numeric DEFAULT 3500,
    "dietary_fiber" numeric DEFAULT 25,
    "sugars" numeric DEFAULT 50,
    "vitamin_a" numeric DEFAULT 900,
    "vitamin_c" numeric DEFAULT 90,
    "calcium" numeric DEFAULT 1000,
    "iron" numeric DEFAULT 18
);

CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL UNIQUE,
    "date_format" "text" DEFAULT 'MM/DD/YYYY'::"text" NOT NULL,
    "default_weight_unit" "text" DEFAULT 'kg'::"text" NOT NULL,
    "default_measurement_unit" "text" DEFAULT 'cm'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "system_prompt" "text" DEFAULT 'You are Sparky, a helpful AI assistant for health and fitness tracking. Be friendly, encouraging, and provide accurate information about nutrition, exercise, and wellness.'::"text",
    "auto_clear_history" "text" DEFAULT 'never'::"text",
    "logging_level" "text" DEFAULT 'ERROR'::"text",
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "default_food_data_provider_id" "uuid",
    CONSTRAINT "logging_level_check" CHECK (("logging_level" = ANY (ARRAY['DEBUG'::"text", 'INFO'::"text", 'WARN'::"text", 'ERROR'::"text", 'SILENT'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."water_intake" (
    "id" "uuid" DEFAULT gen_random_uuid() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "glasses_consumed" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS system.schema_migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Functions

CREATE OR REPLACE FUNCTION "public"."can_access_user_data"("target_user_id" "uuid", "permission_type" "text", "authenticated_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  -- If accessing own data, always allow
  IF target_user_id = authenticated_user_id THEN
    RETURN true;
  END IF;

  -- Check if current user has family access with the required permission
  RETURN EXISTS (
    SELECT 1
    FROM public.family_access fa
    WHERE fa.family_user_id = authenticated_user_id
      AND fa.owner_user_id = target_user_id
      AND fa.is_active = true
      AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
      AND (
        -- Direct permission check
        (fa.access_permissions->permission_type)::boolean = true
        OR
        -- Inheritance: reports permission grants read access to calorie and checkin
        (permission_type IN ('calorie', 'checkin') AND (fa.access_permissions->>'reports')::boolean = true)
        OR
        -- Inheritance: food_list permission grants read access to calorie data (foods table)
        (permission_type = 'calorie' AND (fa.access_permissions->>'food_list')::boolean = true)
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."check_family_access"("p_family_user_id" "uuid", "p_owner_user_id" "uuid", "p_permission" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.family_access
    WHERE family_user_id = p_family_user_id
      AND owner_user_id = p_owner_user_id
      AND is_active = true
      AND (access_end_date IS NULL OR access_end_date > now())
      AND (access_permissions->p_permission)::boolean = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."clear_old_chat_history"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Delete chat history entries older than 7 days for users who have set auto_clear_history to '7days'
  DELETE FROM public.sparky_chat_history
  WHERE user_id IN (
    SELECT user_id
    FROM public.user_preferences
    WHERE auto_clear_history = '7days'
  )
  AND created_at < now() - interval '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION "public"."create_user_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."find_user_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    user_id uuid;
BEGIN
    -- This function runs with elevated privileges to find users by email
    SELECT id INTO user_id
    FROM auth.users
    WHERE email = p_email
    LIMIT 1;

    RETURN user_id;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."generate_user_api_key"("p_user_id" "uuid", "p_description" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
declare
  new_api_key text;
begin
  -- Generate a random UUID and use it as the API key
  new_api_key := gen_random_uuid();

  -- Insert the new API key into the user_api_keys table with default permissions for health data write
  insert into public.user_api_keys (user_id, api_key, description, permissions)
  values (p_user_id, new_api_key, p_description, '{"health_data_write": true}'::jsonb);

  return new_api_key;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_accessible_users"("p_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "full_name" "text", "email" "text", "permissions" "jsonb", "access_end_date" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    fa.owner_user_id,
    p.full_name,
    au.email::text, -- Get email from auth.users and explicitly cast to text
    fa.access_permissions,
    fa.access_end_date
  FROM public.family_access fa
  JOIN public.profiles p ON p.id = fa.owner_user_id
  JOIN auth.users au ON au.id = fa.owner_user_id -- Join with auth.users
  WHERE fa.family_user_id = p_user_id
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now());
END;
$$;

CREATE OR REPLACE FUNCTION "public"."get_goals_for_date"("p_user_id" "uuid", "p_date" "date") RETURNS TABLE("calories" numeric, "protein" numeric, "carbs" numeric, "fat" numeric, "water_goal" integer, "saturated_fat" numeric, "polyunsaturated_fat" numeric, "monounsaturated_fat" numeric, "trans_fat" numeric, "cholesterol" numeric, "sodium" numeric, "potassium" numeric, "dietary_fiber" numeric, "sugars" numeric, "vitamin_a" numeric, "vitamin_c" numeric, "calcium" numeric, "iron" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- First try to get goal for the exact date
  RETURN QUERY
  SELECT g.calories, g.protein, g.carbs, g.fat, g.water_goal,
         g.saturated_fat, g.polyunsaturated_fat, g.monounsaturated_fat, g.trans_fat,
         g.cholesterol, g.sodium, g.potassium, g.dietary_fiber, g.sugars,
         g.vitamin_a, g.vitamin_c, g.calcium, g.iron
  FROM public.user_goals g
  WHERE g.user_id = p_user_id AND g.goal_date = p_date
  LIMIT 1;

  -- If no exact date goal found, get the most recent goal before this date
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT g.calories, g.protein, g.carbs, g.fat, g.water_goal,
           g.saturated_fat, g.polyunsaturated_fat, g.monounsaturated_fat, g.trans_fat,
           g.cholesterol, g.sodium, g.potassium, g.dietary_fiber, g.sugars,
           g.vitamin_a, g.vitamin_c, g.calcium, g.iron
    FROM public.user_goals g
    WHERE g.user_id = p_user_id
      AND (g.goal_date < p_date OR g.goal_date IS NULL)
    ORDER BY g.goal_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- If still no goal found, return default values
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 2000::NUMERIC, 150::NUMERIC, 250::NUMERIC, 67::NUMERIC, 8::INTEGER,
           20::NUMERIC, 10::NUMERIC, 25::NUMERIC, 0::NUMERIC,
           300::NUMERIC, 2300::NUMERIC, 3500::NUMERIC, 25::NUMERIC, 50::NUMERIC,
           900::NUMERIC, 90::NUMERIC, 1000::NUMERIC, 18::NUMERIC;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');

  INSERT INTO public.user_goals (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."manage_goal_timeline"("p_user_id" "uuid", "p_start_date" "date", "p_calories" numeric, "p_protein" numeric, "p_carbs" numeric, "p_fat" numeric, "p_water_goal" integer, "p_saturated_fat" numeric DEFAULT 20, "p_polyunsaturated_fat" numeric DEFAULT 10, "p_monounsaturated_fat" numeric DEFAULT 25, "p_trans_fat" numeric DEFAULT 0, "p_cholesterol" numeric DEFAULT 300, "p_sodium" numeric DEFAULT 2300, "p_potassium" numeric DEFAULT 3500, "p_dietary_fiber" numeric DEFAULT 25, "p_sugars" numeric DEFAULT 50, "p_vitamin_a" numeric DEFAULT 900, "p_vitamin_c" numeric DEFAULT 90, "p_calcium" numeric DEFAULT 1000, "p_iron" numeric DEFAULT 18) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_end_date DATE;
  v_current_date DATE;
BEGIN
  -- If editing a past date (before today), only update that specific date
  IF p_start_date < CURRENT_DATE THEN
    INSERT INTO public.user_goals (
      user_id, goal_date, calories, protein, carbs, fat, water_goal,
      saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
      cholesterol, sodium, potassium, dietary_fiber, sugars,
      vitamin_a, vitamin_c, calcium, iron
    )
    VALUES (
      p_user_id, p_start_date, p_calories, p_protein, p_carbs, p_fat, p_water_goal,
      p_saturated_fat, p_polyunsaturated_fat, p_monounsaturated_fat, p_trans_fat,
      p_cholesterol, p_sodium, p_potassium, p_dietary_fiber, p_sugars,
      p_vitamin_a, p_vitamin_c, p_calcium, p_iron
    )
    ON CONFLICT (user_id, COALESCE(goal_date, '1900-01-01'::date))
    DO UPDATE SET
      calories = EXCLUDED.calories,
      protein = EXCLUDED.protein,
      carbs = EXCLUDED.carbs,
      fat = EXCLUDED.fat,
      water_goal = EXCLUDED.water_goal,
      saturated_fat = EXCLUDED.saturated_fat,
      polyunsaturated_fat = EXCLUDED.polyunsaturated_fat,
      monounsaturated_fat = EXCLUDED.monounsaturated_fat,
      trans_fat = EXCLUDED.trans_fat,
      cholesterol = EXCLUDED.cholesterol,
      sodium = EXCLUDED.sodium,
      potassium = EXCLUDED.potassium,
      dietary_fiber = EXCLUDED.dietary_fiber,
      sugars = EXCLUDED.sugars,
      vitamin_a = EXCLUDED.vitamin_a,
      vitamin_c = EXCLUDED.vitamin_c,
      calcium = EXCLUDED.calcium,
      iron = EXCLUDED.iron,
      updated_at = now();
    RETURN;
  END IF;

  -- For today or future dates: delete 6 months and insert new goals
  v_end_date := p_start_date + INTERVAL '6 months';

  -- Delete all existing goals from start date for 6 months
  DELETE FROM public.user_goals
  WHERE user_id = p_user_id
    AND goal_date >= p_start_date
    AND goal_date < v_end_date
    AND goal_date IS NOT NULL;

  -- Insert new goals for each day in the 6-month range
  v_current_date := v_end_date; -- Start from end date and go backwards to avoid conflicts
  WHILE v_current_date >= p_start_date LOOP
    INSERT INTO public.user_goals (
      user_id, goal_date, calories, protein, carbs, fat, water_goal,
      saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
      cholesterol, sodium, potassium, dietary_fiber, sugars,
      vitamin_a, vitamin_c, calcium, iron
    )
    VALUES (
      p_user_id, v_current_date, p_calories, p_protein, p_carbs, p_fat, p_water_goal,
      p_saturated_fat, p_polyunsaturated_fat, p_monounsaturated_fat, p_trans_fat,
      p_cholesterol, p_sodium, p_potassium, p_dietary_fiber, p_sugars,
      p_vitamin_a, p_vitamin_c, p_calcium, p_iron
    );

    v_current_date := v_current_date - 1;
  END LOOP;

  -- Remove the default goal (NULL goal_date) to avoid conflicts
  DELETE FROM public.user_goals
  WHERE user_id = p_user_id AND goal_date IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."revoke_all_user_api_keys"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.user_api_keys
  set is_active = false, updated_at = now()
  where user_id = p_user_id;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."revoke_user_api_key"("p_user_id" "uuid", "p_api_key" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update public.user_api_keys
  set is_active = false, updated_at = now()
  where user_id = p_user_id and api_key = p_api_key;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."update_food_data_providers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Indexes

CREATE INDEX "idx_ai_service_settings_active" ON "public"."ai_service_settings" USING "btree" ("user_id", "is_active");
CREATE INDEX "idx_ai_service_settings_user_id" ON "public"."ai_service_settings" USING "btree" ("user_id");
CREATE INDEX "idx_custom_categories_user_id" ON "public"."custom_categories" USING "btree" ("user_id");
CREATE INDEX "idx_custom_measurements_category_id" ON "public"."custom_measurements" USING "btree" ("category_id");
CREATE INDEX "idx_custom_measurements_date" ON "public"."custom_measurements" USING "btree" ("entry_date");
CREATE INDEX "idx_custom_measurements_user_id" ON "public"."custom_measurements" USING "btree" ("user_id");
CREATE INDEX "idx_foods_provider_external_id_provider_type" ON "public"."foods" USING "btree" ("provider_external_id", "provider_type");
CREATE INDEX "idx_sparky_chat_history_created_at" ON "public"."sparky_chat_history" USING "btree" ("user_id", "created_at");
CREATE INDEX "idx_sparky_chat_history_session" ON "public"."sparky_chat_history" USING "btree" ("user_id", "session_id");
CREATE INDEX "idx_sparky_chat_history_user_id" ON "public"."sparky_chat_history" USING "btree" ("user_id");
CREATE UNIQUE INDEX "idx_user_goals_unique_user_date" ON "public"."user_goals" USING "btree" ("user_id", COALESCE("goal_date", '1900-01-01'::"date"));
CREATE INDEX "idx_user_goals_user_date" ON "public"."user_goals" USING "btree" ("user_id", "goal_date");
CREATE INDEX "idx_user_goals_user_date_asc" ON "public"."user_goals" USING "btree" ("user_id", "goal_date");

-- Triggers

CREATE OR REPLACE TRIGGER "on_profile_created" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_user_preferences"();
CREATE OR REPLACE TRIGGER "update_food_data_providers_updated_at_trigger" BEFORE UPDATE ON "public"."food_data_providers" FOR EACH ROW EXECUTE FUNCTION "public"."update_food_data_providers_updated_at"();

RESET ALL;