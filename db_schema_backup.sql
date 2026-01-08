--
-- PostgreSQL database dump
--

\restrict Hb9PePndvFR0vQvRT7LibJs74ogZtZW4BjX9ezkShB8cbvZsnfAY1d8Oj2PNNme

-- Dumped from database version 15.14
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: system; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA system;


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: can_access_user_data(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_user_data(target_user_id uuid, permission_type text, authenticated_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
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


--
-- Name: check_family_access(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_family_access(p_family_user_id uuid, p_owner_user_id uuid, p_permission text) RETURNS boolean
    LANGUAGE plpgsql
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


--
-- Name: clear_old_chat_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_old_chat_history() RETURNS void
    LANGUAGE plpgsql
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


--
-- Name: create_default_external_data_providers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_external_data_providers(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: create_diary_policy(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_diary_policy(table_name text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (has_diary_access(user_id));
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (has_diary_access(user_id))
    WITH CHECK (has_diary_access(user_id));
  ', table_name, table_name);
END;
$$;


--
-- Name: create_library_policy(text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_library_policy(table_name text, shared_column text, permissions text[]) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  quoted_permissions text;
  shared_expression text;
BEGIN
  -- Quote each permission name to ensure valid ARRAY syntax
  SELECT array_to_string(ARRAY(
    SELECT quote_literal(p) FROM unnest(permissions) p
  ), ',') INTO quoted_permissions;

  -- Use boolean false if shared_column is 'false', otherwise treat as column name
  IF shared_column = 'false' THEN
    shared_expression := 'false';
  ELSE
    shared_expression := quote_ident(shared_column);
  END IF;
  
  EXECUTE format('
    CREATE POLICY select_policy ON public.%I FOR SELECT TO PUBLIC
    USING (has_library_access_with_public(user_id, %s, ARRAY[%s]));
    CREATE POLICY modify_policy ON public.%I FOR ALL TO PUBLIC
    USING (current_user_id() = user_id)
    WITH CHECK (current_user_id() = user_id);
  ', table_name, shared_expression, quoted_permissions, table_name);
END;
$$;


--
-- Name: create_owner_centric_all_policy(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_owner_centric_all_policy(table_name text) RETURNS void
    LANGUAGE plpgsql
    AS $_$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS %1$s_all_policy ON public.%1$s;
        CREATE POLICY %1$s_all_policy ON public.%1$s
        FOR ALL
        TO sparky_app
        USING (user_id = current_setting(''app.user_id'')::uuid)
        WITH CHECK (user_id = current_setting(''app.user_id'')::uuid);
    ', table_name);
END;
$_$;


--
-- Name: create_owner_centric_id_policy(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_owner_centric_id_policy(table_name text) RETURNS void
    LANGUAGE plpgsql
    AS $_$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS %1$s_all_policy ON public.%1$s;
        CREATE POLICY %1$s_all_policy ON public.%1$s
        FOR ALL
        TO sparky_app
        USING (id = current_setting(''app.user_id'')::uuid)
        WITH CHECK (id = current_setting(''app.user_id'')::uuid);
    ', table_name);
END;
$_$;


--
-- Name: create_owner_policy(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_owner_policy(table_name text, id_column text DEFAULT 'user_id'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  EXECUTE format('
    CREATE POLICY owner_policy ON public.%I FOR ALL TO PUBLIC
    USING (%I = current_user_id())
    WITH CHECK (%I = current_user_id());
  ', table_name, id_column, id_column);
END;
$$;


--
-- Name: create_user_centric_policy(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_user_centric_policy(table_name text) RETURNS void
    LANGUAGE plpgsql
    AS $_$
BEGIN
    EXECUTE format('
        DROP POLICY IF EXISTS %1$s_user_policy ON public.%1$s;
        CREATE POLICY %1$s_user_policy ON public.%1$s
        FOR ALL
        USING (user_id = current_setting(''app.user_id'')::uuid)
        WITH CHECK (user_id = current_setting(''app.user_id'')::uuid);
    ', table_name);
END;
$_$;


--
-- Name: create_user_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_user_preferences() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: current_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT (current_setting('app.user_id'::text))::uuid;
$$;


--
-- Name: find_user_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_user_by_email(p_email text) RETURNS uuid
    LANGUAGE plpgsql
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


--
-- Name: generate_user_api_key(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_user_api_key(p_user_id uuid, p_description text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql
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


--
-- Name: get_accessible_users(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_accessible_users(p_user_id uuid) RETURNS TABLE(user_id uuid, full_name text, email text, permissions jsonb, access_end_date timestamp with time zone)
    LANGUAGE plpgsql
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


--
-- Name: get_goals_for_date(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_goals_for_date(p_user_id uuid, p_date date) RETURNS TABLE(calories numeric, protein numeric, carbs numeric, fat numeric, water_goal integer, saturated_fat numeric, polyunsaturated_fat numeric, monounsaturated_fat numeric, trans_fat numeric, cholesterol numeric, sodium numeric, potassium numeric, dietary_fiber numeric, sugars numeric, vitamin_a numeric, vitamin_c numeric, calcium numeric, iron numeric)
    LANGUAGE plpgsql
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


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.onboarding_status (user_id)
  VALUES (new.id);

  -- Call the new function to create default external data providers
  PERFORM public.create_default_external_data_providers(new.id);

  RETURN new;
END;
$$;


--
-- Name: has_diary_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_diary_access(owner_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT current_user_id() = owner_uuid OR has_family_access(owner_uuid, 'can_manage_diary');
$$;


--
-- Name: has_family_access(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_family_access(owner_uuid uuid, perm text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = current_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND (fa.access_permissions ->> perm)::boolean = true
  );
$$;


--
-- Name: has_family_access_or(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_family_access_or(owner_uuid uuid, perms text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.family_access fa
    WHERE fa.owner_user_id = owner_uuid
    AND fa.family_user_id = current_user_id()
    AND fa.is_active = true
    AND (fa.access_end_date IS NULL OR fa.access_end_date > now())
    AND EXISTS (
      SELECT 1 FROM unnest(perms) p
      WHERE (fa.access_permissions ->> p)::boolean = true
    )
  );
$$;


--
-- Name: has_library_access_with_public(uuid, boolean, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_library_access_with_public(owner_uuid uuid, is_shared boolean, perms text[]) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT current_user_id() = owner_uuid OR is_shared OR has_family_access_or(owner_uuid, perms);
$$;


--
-- Name: manage_goal_timeline(uuid, date, numeric, numeric, numeric, numeric, integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manage_goal_timeline(p_user_id uuid, p_start_date date, p_calories numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_water_goal integer, p_saturated_fat numeric DEFAULT 20, p_polyunsaturated_fat numeric DEFAULT 10, p_monounsaturated_fat numeric DEFAULT 25, p_trans_fat numeric DEFAULT 0, p_cholesterol numeric DEFAULT 300, p_sodium numeric DEFAULT 2300, p_potassium numeric DEFAULT 3500, p_dietary_fiber numeric DEFAULT 25, p_sugars numeric DEFAULT 50, p_vitamin_a numeric DEFAULT 900, p_vitamin_c numeric DEFAULT 90, p_calcium numeric DEFAULT 1000, p_iron numeric DEFAULT 18) RETURNS void
    LANGUAGE plpgsql
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


--
-- Name: revoke_all_user_api_keys(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_all_user_api_keys(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.user_api_keys
  set is_active = false, updated_at = now()
  where user_id = p_user_id;
end;
$$;


--
-- Name: revoke_user_api_key(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_user_api_key(p_user_id uuid, p_api_key text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  update public.user_api_keys
  set is_active = false, updated_at = now()
  where user_id = p_user_id and api_key = p_api_key;
end;
$$;


--
-- Name: set_updated_at_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: set_user_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_id(user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  PERFORM set_config('app.user_id', user_id::text, false);
END;
$$;


--
-- Name: trigger_set_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_external_data_providers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_external_data_providers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid NOT NULL,
    email text,
    password_hash text NOT NULL,
    raw_user_meta_data jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    role character varying(50) DEFAULT 'user'::character varying NOT NULL,
    password_reset_token character varying(255),
    password_reset_expires bigint,
    is_active boolean DEFAULT true,
    last_login_at timestamp with time zone,
    mfa_secret text,
    mfa_totp_enabled boolean DEFAULT false,
    mfa_email_enabled boolean DEFAULT false,
    mfa_recovery_codes jsonb,
    mfa_enforced boolean DEFAULT false,
    magic_link_token text,
    magic_link_expires timestamp with time zone,
    email_mfa_code text,
    email_mfa_expires_at timestamp with time zone
);


--
-- Name: admin_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_activity_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    admin_user_id uuid NOT NULL,
    target_user_id uuid,
    action_type character varying(255) NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: ai_service_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_service_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    service_type text NOT NULL,
    service_name text NOT NULL,
    custom_url text,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    system_prompt text DEFAULT ''::text,
    model_name text,
    encrypted_api_key text,
    api_key_iv text,
    api_key_tag text
);


--
-- Name: backup_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_settings (
    id integer NOT NULL,
    backup_enabled boolean DEFAULT false NOT NULL,
    backup_days text[] DEFAULT '{}'::text[] NOT NULL,
    backup_time text DEFAULT '02:00'::text NOT NULL,
    retention_days integer DEFAULT 7 NOT NULL,
    last_backup_status text,
    last_backup_timestamp timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: backup_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: backup_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_settings_id_seq OWNED BY public.backup_settings.id;


--
-- Name: check_in_measurements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_in_measurements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    weight numeric,
    neck numeric,
    waist numeric,
    hips numeric,
    steps integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    height numeric,
    body_fat_percentage numeric,
    created_by_user_id uuid,
    updated_by_user_id uuid
);


--
-- Name: custom_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    measurement_type character varying(50) NOT NULL,
    frequency text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    data_type text DEFAULT 'numeric'::text,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    display_name character varying(100),
    CONSTRAINT custom_categories_frequency_check CHECK ((frequency = ANY (ARRAY['All'::text, 'Daily'::text, 'Hourly'::text])))
);


--
-- Name: COLUMN custom_categories.display_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.custom_categories.display_name IS 'User-editable display name for the category. If NULL, the name field is used for display. The name field serves as the stable identifier for syncing and lookups.';


--
-- Name: custom_measurements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_measurements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    value text NOT NULL,
    entry_date date NOT NULL,
    entry_hour integer,
    entry_timestamp timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    notes text,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL
);


--
-- Name: exercise_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    duration_minutes numeric NOT NULL,
    calories_burned numeric NOT NULL,
    entry_date date DEFAULT CURRENT_DATE,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    workout_plan_assignment_id integer,
    image_url text,
    created_by_user_id uuid,
    exercise_name text,
    calories_per_hour numeric,
    updated_by_user_id uuid,
    category text,
    source character varying(50),
    source_id character varying(255),
    force character varying(50),
    level character varying(50),
    mechanic character varying(50),
    equipment text,
    primary_muscles text,
    secondary_muscles text,
    instructions text,
    images text,
    distance numeric,
    avg_heart_rate integer,
    exercise_preset_entry_id uuid
);


--
-- Name: exercise_entry_activity_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_entry_activity_details (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    exercise_entry_id uuid,
    provider_name text NOT NULL,
    detail_type text NOT NULL,
    detail_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_user_id uuid,
    updated_by_user_id uuid,
    exercise_preset_entry_id uuid,
    CONSTRAINT chk_exercise_entry_id_or_preset_id CHECK ((((exercise_entry_id IS NOT NULL) AND (exercise_preset_entry_id IS NULL)) OR ((exercise_entry_id IS NULL) AND (exercise_preset_entry_id IS NOT NULL))))
);


--
-- Name: exercise_entry_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_entry_sets (
    id integer NOT NULL,
    exercise_entry_id uuid NOT NULL,
    set_number integer NOT NULL,
    set_type text DEFAULT 'Working Set'::text,
    reps integer,
    weight numeric(10,2),
    duration integer,
    rest_time integer,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: exercise_entry_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exercise_entry_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exercise_entry_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exercise_entry_sets_id_seq OWNED BY public.exercise_entry_sets.id;


--
-- Name: exercise_preset_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_preset_entries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    workout_preset_id integer,
    name character varying(255) NOT NULL,
    description text,
    entry_date date NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id uuid,
    notes text,
    source text DEFAULT 'manual'::text NOT NULL
);


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'general'::text,
    calories_per_hour numeric DEFAULT 300,
    description text,
    user_id uuid,
    is_custom boolean DEFAULT false,
    shared_with_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    source_external_id text,
    source character varying(50) NOT NULL,
    source_id character varying(255),
    force character varying(50),
    level character varying(50),
    mechanic character varying(50),
    equipment text,
    primary_muscles text,
    secondary_muscles text,
    instructions text,
    images text,
    is_quick_exercise boolean DEFAULT false
);


--
-- Name: external_data_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_data_providers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider_name text NOT NULL,
    provider_type text NOT NULL,
    app_id text,
    app_key text,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    encrypted_app_id text,
    app_id_iv text,
    app_id_tag text,
    encrypted_app_key text,
    app_key_iv text,
    app_key_tag text,
    base_url text,
    token_expires_at timestamp with time zone,
    external_user_id text,
    encrypted_garth_dump text,
    garth_dump_iv text,
    garth_dump_tag text,
    shared_with_public boolean DEFAULT false NOT NULL,
    encrypted_access_token text,
    access_token_iv text,
    access_token_tag text,
    encrypted_refresh_token text,
    refresh_token_iv text,
    refresh_token_tag text,
    scope text,
    last_sync_at timestamp with time zone,
    sync_frequency text DEFAULT 'manual'::text,
    CONSTRAINT external_data_providers_provider_type_check CHECK ((provider_type = ANY (ARRAY['fatsecret'::text, 'openfoodfacts'::text, 'mealie'::text, 'garmin'::text, 'health'::text, 'nutritionix'::text, 'wger'::text, 'free-exercise-db'::text, 'withings'::text, 'tandoor'::text, 'usda'::text])))
);


--
-- Name: family_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_user_id uuid NOT NULL,
    family_user_id uuid NOT NULL,
    family_email text NOT NULL,
    access_permissions jsonb DEFAULT '{"can_manage_diary": false, "can_view_food_library": false, "can_view_exercise_library": false}'::jsonb NOT NULL,
    access_start_date timestamp with time zone DEFAULT now() NOT NULL,
    access_end_date timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text,
    CONSTRAINT family_access_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'inactive'::text])))
);


--
-- Name: fasting_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fasting_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    target_end_time timestamp with time zone,
    duration_minutes integer,
    fasting_type character varying(50),
    status character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fasting_logs_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: food_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    food_id uuid,
    meal_type text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit text DEFAULT 'g'::text,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    variant_id uuid,
    meal_plan_template_id uuid,
    created_by_user_id uuid,
    food_name text,
    brand_name text,
    serving_size numeric,
    serving_unit text,
    calories numeric,
    protein numeric,
    carbs numeric,
    fat numeric,
    saturated_fat numeric,
    polyunsaturated_fat numeric,
    monounsaturated_fat numeric,
    trans_fat numeric,
    cholesterol numeric,
    sodium numeric,
    potassium numeric,
    dietary_fiber numeric,
    sugars numeric,
    vitamin_a numeric,
    vitamin_c numeric,
    calcium numeric,
    iron numeric,
    glycemic_index text,
    updated_by_user_id uuid,
    meal_id uuid,
    food_entry_meal_id uuid,
    custom_nutrients jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chk_food_or_meal_id CHECK ((((food_id IS NOT NULL) AND (meal_id IS NULL)) OR ((food_id IS NULL) AND (meal_id IS NOT NULL)))),
    CONSTRAINT food_entries_meal_type_check CHECK ((meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snacks'::text])))
);


--
-- Name: food_entry_meals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_entry_meals (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    meal_template_id uuid,
    meal_type character varying(50) NOT NULL,
    entry_date date NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    quantity numeric DEFAULT 1.0 NOT NULL,
    unit text DEFAULT 'serving'::text
);


--
-- Name: COLUMN food_entry_meals.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.food_entry_meals.quantity IS 'Amount of the meal consumed (e.g., 0.5 for half serving, 500 for 500ml)';


--
-- Name: COLUMN food_entry_meals.unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.food_entry_meals.unit IS 'Unit of measurement for the consumed quantity (should match meals.serving_unit)';


--
-- Name: food_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    food_id uuid NOT NULL,
    serving_size numeric DEFAULT 1 NOT NULL,
    serving_unit text DEFAULT 'g'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    calories numeric DEFAULT 0,
    protein numeric DEFAULT 0,
    carbs numeric DEFAULT 0,
    fat numeric DEFAULT 0,
    saturated_fat numeric DEFAULT 0,
    polyunsaturated_fat numeric DEFAULT 0,
    monounsaturated_fat numeric DEFAULT 0,
    trans_fat numeric DEFAULT 0,
    cholesterol numeric DEFAULT 0,
    sodium numeric DEFAULT 0,
    potassium numeric DEFAULT 0,
    dietary_fiber numeric DEFAULT 0,
    sugars numeric DEFAULT 0,
    vitamin_a numeric DEFAULT 0,
    vitamin_c numeric DEFAULT 0,
    calcium numeric DEFAULT 0,
    iron numeric DEFAULT 0,
    is_default boolean DEFAULT false,
    glycemic_index text,
    custom_nutrients jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT food_variants_glycemic_index_check CHECK ((glycemic_index = ANY (ARRAY['None'::text, 'Very Low'::text, 'Low'::text, 'Medium'::text, 'High'::text, 'Very High'::text])))
);


--
-- Name: foods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.foods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    brand text,
    barcode text,
    provider_external_id text,
    is_custom boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    shared_with_public boolean DEFAULT false,
    provider_type text,
    is_quick_food boolean DEFAULT false NOT NULL
);


--
-- Name: global_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_settings (
    id integer DEFAULT 1 NOT NULL,
    enable_email_password_login boolean DEFAULT true NOT NULL,
    is_oidc_active boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    mfa_mandatory boolean DEFAULT false,
    CONSTRAINT single_row_check CHECK ((id = 1))
);


--
-- Name: goal_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goal_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    preset_name character varying(255) NOT NULL,
    calories numeric,
    protein numeric,
    carbs numeric,
    fat numeric,
    water_goal integer,
    saturated_fat numeric,
    polyunsaturated_fat numeric,
    monounsaturated_fat numeric,
    trans_fat numeric,
    cholesterol numeric,
    sodium numeric,
    potassium numeric,
    dietary_fiber numeric,
    sugars numeric,
    vitamin_a numeric,
    vitamin_c numeric,
    calcium numeric,
    iron numeric,
    target_exercise_calories_burned numeric,
    target_exercise_duration_minutes integer,
    protein_percentage numeric,
    carbs_percentage numeric,
    fat_percentage numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    breakfast_percentage numeric,
    lunch_percentage numeric,
    dinner_percentage numeric,
    snacks_percentage numeric,
    CONSTRAINT chk_meal_percentages_sum CHECK ((((breakfast_percentage IS NULL) AND (lunch_percentage IS NULL) AND (dinner_percentage IS NULL) AND (snacks_percentage IS NULL)) OR ((((breakfast_percentage + lunch_percentage) + dinner_percentage) + snacks_percentage) = (100)::numeric)))
);


--
-- Name: meal_foods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_foods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meal_id uuid NOT NULL,
    food_id uuid NOT NULL,
    variant_id uuid,
    quantity numeric NOT NULL,
    unit character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meal_plan_template_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_plan_template_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    meal_type character varying(50) NOT NULL,
    meal_id uuid,
    item_type character varying(50) DEFAULT 'meal'::character varying NOT NULL,
    food_id uuid,
    variant_id uuid,
    quantity numeric(10,2),
    unit character varying(50),
    CONSTRAINT chk_item_type_and_id CHECK (((((item_type)::text = 'meal'::text) AND (meal_id IS NOT NULL) AND (food_id IS NULL)) OR (((item_type)::text = 'food'::text) AND (food_id IS NOT NULL) AND (meal_id IS NULL))))
);


--
-- Name: meal_plan_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_plan_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_name character varying(255) NOT NULL,
    description text,
    start_date date NOT NULL,
    end_date date,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meal_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    meal_id uuid,
    food_id uuid,
    variant_id uuid,
    quantity numeric,
    unit character varying(50),
    plan_date date NOT NULL,
    meal_type character varying(50) NOT NULL,
    is_template boolean DEFAULT false,
    template_name character varying(255),
    day_of_week integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_meal_or_food CHECK ((((meal_id IS NOT NULL) AND (food_id IS NULL) AND (variant_id IS NULL) AND (quantity IS NULL) AND (unit IS NULL)) OR ((meal_id IS NULL) AND (food_id IS NOT NULL) AND (variant_id IS NOT NULL) AND (quantity IS NOT NULL) AND (unit IS NOT NULL))))
);


--
-- Name: meals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    shared_with_public boolean DEFAULT false,
    serving_size numeric DEFAULT 1.0 NOT NULL,
    serving_unit text DEFAULT 'serving'::text NOT NULL
);


--
-- Name: COLUMN meals.serving_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meals.serving_size IS 'Defines the reference serving size for this meal (e.g., 200 for 200g or 1000 for 1000ml)';


--
-- Name: COLUMN meals.serving_unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meals.serving_unit IS 'Unit of measurement for the serving size (e.g., g, ml, serving, oz, cup)';


--
-- Name: mood_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mood_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    mood_value integer NOT NULL,
    notes text,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: oidc_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oidc_providers (
    id integer NOT NULL,
    issuer_url text NOT NULL,
    client_id text NOT NULL,
    encrypted_client_secret text,
    client_secret_iv text,
    client_secret_tag text,
    redirect_uris text[] NOT NULL,
    scope text NOT NULL,
    token_endpoint_auth_method text DEFAULT 'client_secret_post'::text NOT NULL,
    response_types text[] DEFAULT ARRAY['code'::text] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_name text,
    logo_url text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    auto_register boolean DEFAULT false NOT NULL,
    signing_algorithm character varying(50) DEFAULT 'RS256'::character varying,
    profile_signing_algorithm character varying(50),
    timeout integer DEFAULT 3500
);


--
-- Name: oidc_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.oidc_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oidc_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oidc_providers_id_seq OWNED BY public.oidc_providers.id;


--
-- Name: onboarding_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    sex character varying(10),
    primary_goal character varying(20),
    current_weight numeric(5,2),
    height numeric(5,2),
    birth_date date,
    body_fat_range character varying(20),
    target_weight numeric(5,2),
    meals_per_day integer,
    activity_level character varying(20),
    add_burned_calories boolean,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: onboarding_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    full_name text,
    onboarding_complete boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    date_of_birth date,
    phone text,
    bio text,
    phone_number character varying(20),
    gender character varying(10)
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: sleep_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleep_entries (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date NOT NULL,
    bedtime timestamp with time zone NOT NULL,
    wake_time timestamp with time zone NOT NULL,
    duration_in_seconds integer NOT NULL,
    time_asleep_in_seconds integer,
    sleep_score numeric,
    source character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    deep_sleep_seconds integer,
    light_sleep_seconds integer,
    rem_sleep_seconds integer,
    awake_sleep_seconds integer,
    average_spo2_value numeric,
    lowest_spo2_value numeric,
    highest_spo2_value numeric,
    average_respiration_value numeric,
    lowest_respiration_value numeric,
    highest_respiration_value numeric,
    awake_count integer,
    avg_sleep_stress numeric,
    restless_moments_count integer,
    avg_overnight_hrv numeric,
    body_battery_change numeric,
    resting_heart_rate numeric
);


--
-- Name: sleep_entry_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleep_entry_stages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    entry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    stage_type character varying(50) NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    duration_in_seconds integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sparky_chat_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sparky_chat_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_type text NOT NULL,
    content text NOT NULL,
    image_url text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    message text,
    response text,
    CONSTRAINT sparky_chat_history_message_type_check CHECK ((message_type = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: user_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    api_key text NOT NULL,
    description text,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: user_custom_nutrients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_custom_nutrients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    goal_date date,
    calories numeric DEFAULT 2000,
    protein numeric DEFAULT 150,
    carbs numeric DEFAULT 250,
    fat numeric DEFAULT 67,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    saturated_fat numeric DEFAULT 20,
    polyunsaturated_fat numeric DEFAULT 10,
    monounsaturated_fat numeric DEFAULT 25,
    trans_fat numeric DEFAULT 0,
    cholesterol numeric DEFAULT 300,
    sodium numeric DEFAULT 2300,
    potassium numeric DEFAULT 3500,
    dietary_fiber numeric DEFAULT 25,
    sugars numeric DEFAULT 50,
    vitamin_a numeric DEFAULT 900,
    vitamin_c numeric DEFAULT 90,
    calcium numeric DEFAULT 1000,
    iron numeric DEFAULT 18,
    target_exercise_calories_burned numeric,
    target_exercise_duration_minutes integer,
    protein_percentage numeric,
    carbs_percentage numeric,
    fat_percentage numeric,
    breakfast_percentage numeric,
    lunch_percentage numeric,
    dinner_percentage numeric,
    snacks_percentage numeric,
    water_goal_ml numeric(10,3),
    CONSTRAINT chk_meal_percentages_sum CHECK ((((breakfast_percentage IS NULL) AND (lunch_percentage IS NULL) AND (dinner_percentage IS NULL) AND (snacks_percentage IS NULL)) OR ((((breakfast_percentage + lunch_percentage) + dinner_percentage) + snacks_percentage) = (100)::numeric)))
);


--
-- Name: user_ignored_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ignored_updates (
    user_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    ignored_at_timestamp timestamp with time zone NOT NULL
);


--
-- Name: user_nutrient_display_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_nutrient_display_preferences (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    view_group character varying(255) NOT NULL,
    platform character varying(50) NOT NULL,
    visible_nutrients jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_nutrient_display_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_nutrient_display_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_nutrient_display_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_nutrient_display_preferences_id_seq OWNED BY public.user_nutrient_display_preferences.id;


--
-- Name: user_oidc_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_oidc_links (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    oidc_provider_id integer NOT NULL,
    oidc_sub text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_oidc_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_oidc_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_oidc_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_oidc_links_id_seq OWNED BY public.user_oidc_links.id;


--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    date_format text DEFAULT 'MM/DD/YYYY'::text NOT NULL,
    default_weight_unit text DEFAULT 'kg'::text NOT NULL,
    default_measurement_unit text DEFAULT 'cm'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    system_prompt text DEFAULT 'You are Sparky, a helpful AI assistant for health and fitness tracking. Be friendly, encouraging, and provide accurate information about nutrition, exercise, and wellness.'::text,
    auto_clear_history text DEFAULT 'never'::text,
    logging_level text DEFAULT 'ERROR'::text,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    default_food_data_provider_id uuid,
    item_display_limit integer DEFAULT 10 NOT NULL,
    water_display_unit character varying(50) DEFAULT 'ml'::character varying,
    bmr_algorithm text DEFAULT 'Mifflin-St Jeor'::text NOT NULL,
    body_fat_algorithm text DEFAULT 'U.S. Navy'::text NOT NULL,
    include_bmr_in_net_calories boolean DEFAULT false NOT NULL,
    default_distance_unit character varying(20) DEFAULT 'km'::character varying NOT NULL,
    language character varying(10) DEFAULT 'en'::character varying,
    calorie_goal_adjustment_mode text DEFAULT 'dynamic'::text,
    energy_unit character varying(4) DEFAULT 'kcal'::character varying NOT NULL,
    fat_breakdown_algorithm text DEFAULT 'AHA_GUIDELINES'::text NOT NULL,
    mineral_calculation_algorithm text DEFAULT 'RDA_STANDARD'::text NOT NULL,
    vitamin_calculation_algorithm text DEFAULT 'RDA_STANDARD'::text NOT NULL,
    sugar_calculation_algorithm text DEFAULT 'WHO_GUIDELINES'::text NOT NULL,
    CONSTRAINT check_energy_unit CHECK (((energy_unit)::text = ANY ((ARRAY['kcal'::character varying, 'kJ'::character varying])::text[]))),
    CONSTRAINT logging_level_check CHECK ((logging_level = ANY (ARRAY['DEBUG'::text, 'INFO'::text, 'WARN'::text, 'ERROR'::text, 'SILENT'::text])))
);


--
-- Name: user_water_containers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_water_containers (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    volume numeric(10,3) NOT NULL,
    unit character varying(50) NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    servings_per_container integer DEFAULT 1 NOT NULL
);


--
-- Name: user_water_containers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_water_containers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_water_containers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_water_containers_id_seq OWNED BY public.user_water_containers.id;


--
-- Name: water_intake; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.water_intake (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    water_ml numeric(10,3),
    created_by_user_id uuid,
    updated_by_user_id uuid
);


--
-- Name: weekly_goal_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_goal_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_name character varying(255) NOT NULL,
    start_date date NOT NULL,
    end_date date,
    is_active boolean DEFAULT true NOT NULL,
    monday_preset_id uuid,
    tuesday_preset_id uuid,
    wednesday_preset_id uuid,
    thursday_preset_id uuid,
    friday_preset_id uuid,
    saturday_preset_id uuid,
    sunday_preset_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workout_plan_assignment_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plan_assignment_sets (
    id integer NOT NULL,
    assignment_id integer NOT NULL,
    set_number integer NOT NULL,
    set_type text DEFAULT 'Working Set'::text,
    reps integer,
    weight numeric(10,2),
    duration integer,
    rest_time integer,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: workout_plan_assignment_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_plan_assignment_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_plan_assignment_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_plan_assignment_sets_id_seq OWNED BY public.workout_plan_assignment_sets.id;


--
-- Name: workout_plan_template_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plan_template_assignments (
    id integer NOT NULL,
    template_id integer NOT NULL,
    day_of_week integer NOT NULL,
    workout_preset_id integer,
    exercise_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_workout_assignment_type CHECK ((((workout_preset_id IS NOT NULL) AND (exercise_id IS NULL)) OR ((workout_preset_id IS NULL) AND (exercise_id IS NOT NULL))))
);


--
-- Name: workout_plan_template_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_plan_template_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_plan_template_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_plan_template_assignments_id_seq OWNED BY public.workout_plan_template_assignments.id;


--
-- Name: workout_plan_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plan_templates (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    plan_name character varying(255) NOT NULL,
    description text,
    start_date date,
    end_date date,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: workout_plan_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_plan_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_plan_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_plan_templates_id_seq OWNED BY public.workout_plan_templates.id;


--
-- Name: workout_preset_exercise_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_preset_exercise_sets (
    id integer NOT NULL,
    workout_preset_exercise_id integer NOT NULL,
    set_number integer NOT NULL,
    set_type text DEFAULT 'Working Set'::text,
    reps integer,
    weight numeric(10,2),
    duration integer,
    rest_time integer,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: workout_preset_exercise_sets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_preset_exercise_sets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_preset_exercise_sets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_preset_exercise_sets_id_seq OWNED BY public.workout_preset_exercise_sets.id;


--
-- Name: workout_preset_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_preset_exercises (
    id integer NOT NULL,
    workout_preset_id integer NOT NULL,
    exercise_id uuid NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: workout_preset_exercises_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_preset_exercises_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_preset_exercises_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_preset_exercises_id_seq OWNED BY public.workout_preset_exercises.id;


--
-- Name: workout_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_presets (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    is_public boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: workout_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.workout_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.workout_presets_id_seq OWNED BY public.workout_presets.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: system; Owner: -
--

CREATE TABLE system.schema_migrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: system; Owner: -
--

CREATE SEQUENCE system.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: system; Owner: -
--

ALTER SEQUENCE system.schema_migrations_id_seq OWNED BY system.schema_migrations.id;


--
-- Name: backup_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_settings ALTER COLUMN id SET DEFAULT nextval('public.backup_settings_id_seq'::regclass);


--
-- Name: exercise_entry_sets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_sets ALTER COLUMN id SET DEFAULT nextval('public.exercise_entry_sets_id_seq'::regclass);


--
-- Name: oidc_providers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_providers ALTER COLUMN id SET DEFAULT nextval('public.oidc_providers_id_seq'::regclass);


--
-- Name: user_nutrient_display_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_nutrient_display_preferences ALTER COLUMN id SET DEFAULT nextval('public.user_nutrient_display_preferences_id_seq'::regclass);


--
-- Name: user_oidc_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oidc_links ALTER COLUMN id SET DEFAULT nextval('public.user_oidc_links_id_seq'::regclass);


--
-- Name: user_water_containers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_water_containers ALTER COLUMN id SET DEFAULT nextval('public.user_water_containers_id_seq'::regclass);


--
-- Name: workout_plan_assignment_sets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_assignment_sets ALTER COLUMN id SET DEFAULT nextval('public.workout_plan_assignment_sets_id_seq'::regclass);


--
-- Name: workout_plan_template_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_template_assignments ALTER COLUMN id SET DEFAULT nextval('public.workout_plan_template_assignments_id_seq'::regclass);


--
-- Name: workout_plan_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_templates ALTER COLUMN id SET DEFAULT nextval('public.workout_plan_templates_id_seq'::regclass);


--
-- Name: workout_preset_exercise_sets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_preset_exercise_sets ALTER COLUMN id SET DEFAULT nextval('public.workout_preset_exercise_sets_id_seq'::regclass);


--
-- Name: workout_preset_exercises id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_preset_exercises ALTER COLUMN id SET DEFAULT nextval('public.workout_preset_exercises_id_seq'::regclass);


--
-- Name: workout_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_presets ALTER COLUMN id SET DEFAULT nextval('public.workout_presets_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: system; Owner: -
--

ALTER TABLE ONLY system.schema_migrations ALTER COLUMN id SET DEFAULT nextval('system.schema_migrations_id_seq'::regclass);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admin_activity_logs admin_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_settings backup_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_settings
    ADD CONSTRAINT backup_settings_pkey PRIMARY KEY (id);


--
-- Name: exercise_entries exercise_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_pkey PRIMARY KEY (id);


--
-- Name: exercise_entry_activity_details exercise_entry_activity_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_activity_details
    ADD CONSTRAINT exercise_entry_activity_details_pkey PRIMARY KEY (id);


--
-- Name: exercise_entry_sets exercise_entry_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_sets
    ADD CONSTRAINT exercise_entry_sets_pkey PRIMARY KEY (id);


--
-- Name: exercise_preset_entries exercise_preset_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_preset_entries
    ADD CONSTRAINT exercise_preset_entries_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: fasting_logs fasting_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fasting_logs
    ADD CONSTRAINT fasting_logs_pkey PRIMARY KEY (id);


--
-- Name: food_entry_meals food_entry_meals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_pkey PRIMARY KEY (id);


--
-- Name: food_variants food_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_variants
    ADD CONSTRAINT food_variants_pkey PRIMARY KEY (id);


--
-- Name: foods foods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.foods
    ADD CONSTRAINT foods_pkey PRIMARY KEY (id);


--
-- Name: global_settings global_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_pkey PRIMARY KEY (id);


--
-- Name: goal_presets goal_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_presets
    ADD CONSTRAINT goal_presets_pkey PRIMARY KEY (id);


--
-- Name: goal_presets goal_presets_unique_name_per_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_presets
    ADD CONSTRAINT goal_presets_unique_name_per_user UNIQUE (user_id, preset_name);


--
-- Name: meal_foods meal_foods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_foods
    ADD CONSTRAINT meal_foods_pkey PRIMARY KEY (id);


--
-- Name: meal_plan_template_assignments meal_plan_template_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_template_assignments
    ADD CONSTRAINT meal_plan_template_assignments_pkey PRIMARY KEY (id);


--
-- Name: meal_plan_templates meal_plan_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_templates
    ADD CONSTRAINT meal_plan_templates_pkey PRIMARY KEY (id);


--
-- Name: meal_plans meal_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_pkey PRIMARY KEY (id);


--
-- Name: meals meals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meals
    ADD CONSTRAINT meals_pkey PRIMARY KEY (id);


--
-- Name: mood_entries mood_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT mood_entries_pkey PRIMARY KEY (id);


--
-- Name: oidc_providers oidc_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_providers
    ADD CONSTRAINT oidc_providers_pkey PRIMARY KEY (id);


--
-- Name: onboarding_data onboarding_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT onboarding_data_pkey PRIMARY KEY (id);


--
-- Name: onboarding_data onboarding_data_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT onboarding_data_user_id_key UNIQUE (user_id);


--
-- Name: onboarding_status onboarding_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_status
    ADD CONSTRAINT onboarding_status_pkey PRIMARY KEY (id);


--
-- Name: onboarding_status onboarding_status_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_status
    ADD CONSTRAINT onboarding_status_user_id_key UNIQUE (user_id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: sleep_entries sleep_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entries
    ADD CONSTRAINT sleep_entries_pkey PRIMARY KEY (id);


--
-- Name: sleep_entry_stages sleep_entry_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entry_stages
    ADD CONSTRAINT sleep_entry_stages_pkey PRIMARY KEY (id);


--
-- Name: mood_entries unique_user_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT unique_user_date UNIQUE (user_id, entry_date);


--
-- Name: user_custom_nutrients unique_user_nutrient_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_nutrients
    ADD CONSTRAINT unique_user_nutrient_name UNIQUE (user_id, name);


--
-- Name: external_data_providers unique_user_provider; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_data_providers
    ADD CONSTRAINT unique_user_provider UNIQUE (user_id, provider_name);


--
-- Name: user_custom_nutrients user_custom_nutrients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_nutrients
    ADD CONSTRAINT user_custom_nutrients_pkey PRIMARY KEY (id);


--
-- Name: user_ignored_updates user_ignored_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ignored_updates
    ADD CONSTRAINT user_ignored_updates_pkey PRIMARY KEY (user_id, variant_id);


--
-- Name: user_nutrient_display_preferences user_nutrient_display_preferenc_user_id_view_group_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_nutrient_display_preferences
    ADD CONSTRAINT user_nutrient_display_preferenc_user_id_view_group_platform_key UNIQUE (user_id, view_group, platform);


--
-- Name: user_nutrient_display_preferences user_nutrient_display_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_nutrient_display_preferences
    ADD CONSTRAINT user_nutrient_display_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_oidc_links user_oidc_links_oidc_provider_id_oidc_sub_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oidc_links
    ADD CONSTRAINT user_oidc_links_oidc_provider_id_oidc_sub_key UNIQUE (oidc_provider_id, oidc_sub);


--
-- Name: user_oidc_links user_oidc_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oidc_links
    ADD CONSTRAINT user_oidc_links_pkey PRIMARY KEY (id);


--
-- Name: user_preferences user_preferences_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_water_containers user_water_containers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_water_containers
    ADD CONSTRAINT user_water_containers_pkey PRIMARY KEY (id);


--
-- Name: weekly_goal_plans weekly_goal_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_pkey PRIMARY KEY (id);


--
-- Name: workout_plan_assignment_sets workout_plan_assignment_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_assignment_sets
    ADD CONSTRAINT workout_plan_assignment_sets_pkey PRIMARY KEY (id);


--
-- Name: workout_plan_template_assignments workout_plan_template_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_template_assignments
    ADD CONSTRAINT workout_plan_template_assignments_pkey PRIMARY KEY (id);


--
-- Name: workout_plan_templates workout_plan_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_templates
    ADD CONSTRAINT workout_plan_templates_pkey PRIMARY KEY (id);


--
-- Name: workout_preset_exercise_sets workout_preset_exercise_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_preset_exercise_sets
    ADD CONSTRAINT workout_preset_exercise_sets_pkey PRIMARY KEY (id);


--
-- Name: workout_preset_exercises workout_preset_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_preset_exercises
    ADD CONSTRAINT workout_preset_exercises_pkey PRIMARY KEY (id);


--
-- Name: workout_presets workout_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_presets
    ADD CONSTRAINT workout_presets_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_name_key; Type: CONSTRAINT; Schema: system; Owner: -
--

ALTER TABLE ONLY system.schema_migrations
    ADD CONSTRAINT schema_migrations_name_key UNIQUE (name);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: system; Owner: -
--

ALTER TABLE ONLY system.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: idx_magic_link_token; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_magic_link_token ON auth.users USING btree (magic_link_token);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: idx_ai_service_settings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_service_settings_active ON public.ai_service_settings USING btree (user_id, is_active);


--
-- Name: idx_ai_service_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_service_settings_user_id ON public.ai_service_settings USING btree (user_id);


--
-- Name: idx_assignment_sets_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_sets_assignment_id ON public.workout_plan_assignment_sets USING btree (assignment_id);


--
-- Name: idx_custom_categories_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_categories_user_id ON public.custom_categories USING btree (user_id);


--
-- Name: idx_custom_measurements_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_measurements_category_id ON public.custom_measurements USING btree (category_id);


--
-- Name: idx_custom_measurements_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_measurements_date ON public.custom_measurements USING btree (entry_date);


--
-- Name: idx_custom_measurements_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_measurements_user_id ON public.custom_measurements USING btree (user_id);


--
-- Name: idx_exercise_entries_exercise_preset_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_entries_exercise_preset_entry_id ON public.exercise_entries USING btree (exercise_preset_entry_id);


--
-- Name: idx_exercise_entry_activity_details_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_entry_activity_details_entry_id ON public.exercise_entry_activity_details USING btree (exercise_entry_id);


--
-- Name: idx_exercise_entry_activity_details_provider_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_entry_activity_details_provider_type ON public.exercise_entry_activity_details USING btree (provider_name, detail_type);


--
-- Name: idx_exercise_entry_sets_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_entry_sets_entry_id ON public.exercise_entry_sets USING btree (exercise_entry_id);


--
-- Name: idx_exercise_preset_entries_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_preset_entries_entry_date ON public.exercise_preset_entries USING btree (entry_date);


--
-- Name: idx_exercise_preset_entries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_preset_entries_user_id ON public.exercise_preset_entries USING btree (user_id);


--
-- Name: idx_exercises_is_quick_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_is_quick_exercise ON public.exercises USING btree (is_quick_exercise);


--
-- Name: idx_exercises_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_source ON public.exercises USING btree (source);


--
-- Name: idx_exercises_source_source_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_exercises_source_source_id_unique ON public.exercises USING btree (source, source_id) WHERE ((source IS NOT NULL) AND (source_id IS NOT NULL));


--
-- Name: idx_food_entries_food_entry_meal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_food_entries_food_entry_meal_id ON public.food_entries USING btree (food_entry_meal_id);


--
-- Name: idx_food_entry_meals_meal_template_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_food_entry_meals_meal_template_id ON public.food_entry_meals USING btree (meal_template_id);


--
-- Name: idx_food_entry_meals_user_id_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_food_entry_meals_user_id_entry_date ON public.food_entry_meals USING btree (user_id, entry_date);


--
-- Name: idx_foods_provider_external_id_provider_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foods_provider_external_id_provider_type ON public.foods USING btree (provider_external_id, provider_type);


--
-- Name: idx_sleep_entries_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleep_entries_entry_date ON public.sleep_entries USING btree (entry_date);


--
-- Name: idx_sleep_entries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleep_entries_user_id ON public.sleep_entries USING btree (user_id);


--
-- Name: idx_sleep_entry_stages_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleep_entry_stages_entry_id ON public.sleep_entry_stages USING btree (entry_id);


--
-- Name: idx_sleep_entry_stages_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleep_entry_stages_start_time ON public.sleep_entry_stages USING btree (start_time);


--
-- Name: idx_sleep_entry_stages_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleep_entry_stages_user_id ON public.sleep_entry_stages USING btree (user_id);


--
-- Name: idx_sparky_chat_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sparky_chat_history_created_at ON public.sparky_chat_history USING btree (user_id, created_at);


--
-- Name: idx_sparky_chat_history_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sparky_chat_history_session ON public.sparky_chat_history USING btree (user_id, session_id);


--
-- Name: idx_sparky_chat_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sparky_chat_history_user_id ON public.sparky_chat_history USING btree (user_id);


--
-- Name: idx_user_goals_unique_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_goals_unique_user_date ON public.user_goals USING btree (user_id, COALESCE(goal_date, '1900-01-01'::date));


--
-- Name: idx_user_goals_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_goals_user_date ON public.user_goals USING btree (user_id, goal_date);


--
-- Name: idx_user_goals_user_date_asc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_goals_user_date_asc ON public.user_goals USING btree (user_id, goal_date);


--
-- Name: idx_user_ignored_updates_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_ignored_updates_variant_id ON public.user_ignored_updates USING btree (variant_id);


--
-- Name: idx_workout_preset_exercise_sets_preset_exercise_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_preset_exercise_sets_preset_exercise_id ON public.workout_preset_exercise_sets USING btree (workout_preset_exercise_id);


--
-- Name: one_active_meal_plan_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_active_meal_plan_per_user ON public.meal_plan_templates USING btree (user_id) WHERE (is_active = true);


--
-- Name: unique_backup_settings_row; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_backup_settings_row ON public.backup_settings USING btree (((id IS NOT NULL)));


--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: profiles on_profile_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_user_preferences();


--
-- Name: mood_entries set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.mood_entries FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: user_nutrient_display_preferences set_user_nutrient_display_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_user_nutrient_display_preferences_updated_at BEFORE UPDATE ON public.user_nutrient_display_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();


--
-- Name: exercise_entry_sets update_exercise_entry_sets_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_exercise_entry_sets_timestamp BEFORE UPDATE ON public.exercise_entry_sets FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: external_data_providers update_external_data_providers_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_external_data_providers_updated_at_trigger BEFORE UPDATE ON public.external_data_providers FOR EACH ROW EXECUTE FUNCTION public.update_external_data_providers_updated_at();


--
-- Name: fasting_logs update_fasting_logs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fasting_logs_updated_at BEFORE UPDATE ON public.fasting_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: food_variants update_food_variants_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_food_variants_timestamp BEFORE UPDATE ON public.food_variants FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: global_settings update_global_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_global_settings_updated_at BEFORE UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: meal_foods update_meal_foods_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_meal_foods_timestamp BEFORE UPDATE ON public.meal_foods FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: oidc_providers update_oidc_providers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_oidc_providers_updated_at BEFORE UPDATE ON public.oidc_providers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_oidc_links update_user_oidc_links_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_oidc_links_updated_at BEFORE UPDATE ON public.user_oidc_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: workout_plan_assignment_sets update_workout_plan_assignment_sets_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_plan_assignment_sets_timestamp BEFORE UPDATE ON public.workout_plan_assignment_sets FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: workout_plan_template_assignments update_workout_plan_template_assignments_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_plan_template_assignments_timestamp BEFORE UPDATE ON public.workout_plan_template_assignments FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: workout_plan_templates update_workout_plan_templates_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_plan_templates_timestamp BEFORE UPDATE ON public.workout_plan_templates FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: workout_preset_exercise_sets update_workout_preset_exercise_sets_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_preset_exercise_sets_timestamp BEFORE UPDATE ON public.workout_preset_exercise_sets FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: workout_preset_exercises update_workout_preset_exercises_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_preset_exercises_timestamp BEFORE UPDATE ON public.workout_preset_exercises FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: workout_presets update_workout_presets_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workout_presets_timestamp BEFORE UPDATE ON public.workout_presets FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: admin_activity_logs admin_activity_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_activity_logs admin_activity_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: check_in_measurements check_in_measurements_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_measurements
    ADD CONSTRAINT check_in_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: check_in_measurements check_in_measurements_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_measurements
    ADD CONSTRAINT check_in_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: custom_categories custom_categories_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_categories
    ADD CONSTRAINT custom_categories_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: custom_categories custom_categories_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_categories
    ADD CONSTRAINT custom_categories_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: custom_measurements custom_measurements_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_measurements
    ADD CONSTRAINT custom_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: custom_measurements custom_measurements_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_measurements
    ADD CONSTRAINT custom_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: exercise_entries exercise_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: exercise_entries exercise_entries_exercise_preset_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_exercise_preset_entry_id_fkey FOREIGN KEY (exercise_preset_entry_id) REFERENCES public.exercise_preset_entries(id) ON DELETE CASCADE;


--
-- Name: exercise_entries exercise_entries_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: exercise_entries exercise_entries_workout_plan_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_workout_plan_assignment_id_fkey FOREIGN KEY (workout_plan_assignment_id) REFERENCES public.workout_plan_template_assignments(id) ON DELETE SET NULL;


--
-- Name: exercise_entry_activity_details exercise_entry_activity_details_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_activity_details
    ADD CONSTRAINT exercise_entry_activity_details_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: exercise_entry_activity_details exercise_entry_activity_details_exercise_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_activity_details
    ADD CONSTRAINT exercise_entry_activity_details_exercise_entry_id_fkey FOREIGN KEY (exercise_entry_id) REFERENCES public.exercise_entries(id) ON DELETE CASCADE;


--
-- Name: exercise_entry_activity_details exercise_entry_activity_details_exercise_preset_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_activity_details
    ADD CONSTRAINT exercise_entry_activity_details_exercise_preset_entry_id_fkey FOREIGN KEY (exercise_preset_entry_id) REFERENCES public.exercise_preset_entries(id) ON DELETE CASCADE;


--
-- Name: exercise_entry_activity_details exercise_entry_activity_details_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_activity_details
    ADD CONSTRAINT exercise_entry_activity_details_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: exercise_entry_sets exercise_entry_sets_exercise_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_sets
    ADD CONSTRAINT exercise_entry_sets_exercise_entry_id_fkey FOREIGN KEY (exercise_entry_id) REFERENCES public.exercise_entries(id) ON DELETE CASCADE;


--
-- Name: exercise_preset_entries exercise_preset_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_preset_entries
    ADD CONSTRAINT exercise_preset_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: exercise_preset_entries exercise_preset_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_preset_entries
    ADD CONSTRAINT exercise_preset_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: exercise_preset_entries exercise_preset_entries_workout_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_preset_entries
    ADD CONSTRAINT exercise_preset_entries_workout_preset_id_fkey FOREIGN KEY (workout_preset_id) REFERENCES public.workout_presets(id) ON DELETE SET NULL;


--
-- Name: fasting_logs fasting_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fasting_logs
    ADD CONSTRAINT fasting_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: exercise_entries fk_exercise_entries_exercise_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT fk_exercise_entries_exercise_id FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: meal_plan_template_assignments fk_food; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_template_assignments
    ADD CONSTRAINT fk_food FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: food_entries fk_food_entries_food_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT fk_food_entries_food_id FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: food_entries fk_food_entries_meal_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT fk_food_entries_meal_id FOREIGN KEY (meal_id) REFERENCES public.meals(id) ON DELETE CASCADE;


--
-- Name: meal_plan_template_assignments fk_food_variant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_template_assignments
    ADD CONSTRAINT fk_food_variant FOREIGN KEY (variant_id) REFERENCES public.food_variants(id) ON DELETE CASCADE;


--
-- Name: food_variants fk_food_variants_food_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_variants
    ADD CONSTRAINT fk_food_variants_food_id FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: food_entries food_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: food_entries food_entries_food_entry_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_food_entry_meal_id_fkey FOREIGN KEY (food_entry_meal_id) REFERENCES public.food_entry_meals(id) ON DELETE CASCADE;


--
-- Name: food_entries food_entries_meal_plan_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_meal_plan_template_id_fkey FOREIGN KEY (meal_plan_template_id) REFERENCES public.meal_plan_templates(id) ON DELETE SET NULL;


--
-- Name: food_entries food_entries_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: food_entries food_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: food_entry_meals food_entry_meals_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: food_entry_meals food_entry_meals_meal_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_meal_template_id_fkey FOREIGN KEY (meal_template_id) REFERENCES public.meals(id) ON DELETE SET NULL;


--
-- Name: food_entry_meals food_entry_meals_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: food_entry_meals food_entry_meals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: goal_presets goal_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_presets
    ADD CONSTRAINT goal_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: meal_foods meal_foods_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_foods
    ADD CONSTRAINT meal_foods_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: meal_foods meal_foods_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_foods
    ADD CONSTRAINT meal_foods_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals(id) ON DELETE CASCADE;


--
-- Name: meal_foods meal_foods_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_foods
    ADD CONSTRAINT meal_foods_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.food_variants(id) ON DELETE SET NULL;


--
-- Name: meal_plan_template_assignments meal_plan_template_assignments_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_template_assignments
    ADD CONSTRAINT meal_plan_template_assignments_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals(id) ON DELETE CASCADE;


--
-- Name: meal_plan_template_assignments meal_plan_template_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_template_assignments
    ADD CONSTRAINT meal_plan_template_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.meal_plan_templates(id) ON DELETE CASCADE;


--
-- Name: meal_plan_templates meal_plan_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_templates
    ADD CONSTRAINT meal_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: meal_plans meal_plans_food_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_food_id_fkey FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;


--
-- Name: meal_plans meal_plans_meal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES public.meals(id) ON DELETE CASCADE;


--
-- Name: meal_plans meal_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: meal_plans meal_plans_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.food_variants(id) ON DELETE SET NULL;


--
-- Name: meals meals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meals
    ADD CONSTRAINT meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mood_entries mood_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT mood_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: onboarding_data onboarding_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT onboarding_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: onboarding_status onboarding_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_status
    ADD CONSTRAINT onboarding_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sleep_entries sleep_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entries
    ADD CONSTRAINT sleep_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sleep_entry_stages sleep_entry_stages_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entry_stages
    ADD CONSTRAINT sleep_entry_stages_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.sleep_entries(id) ON DELETE CASCADE;


--
-- Name: sleep_entry_stages sleep_entry_stages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entry_stages
    ADD CONSTRAINT sleep_entry_stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_custom_nutrients user_custom_nutrients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_nutrients
    ADD CONSTRAINT user_custom_nutrients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_ignored_updates user_ignored_updates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ignored_updates
    ADD CONSTRAINT user_ignored_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_nutrient_display_preferences user_nutrient_display_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_nutrient_display_preferences
    ADD CONSTRAINT user_nutrient_display_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_oidc_links user_oidc_links_oidc_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oidc_links
    ADD CONSTRAINT user_oidc_links_oidc_provider_id_fkey FOREIGN KEY (oidc_provider_id) REFERENCES public.oidc_providers(id) ON DELETE CASCADE;


--
-- Name: user_oidc_links user_oidc_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oidc_links
    ADD CONSTRAINT user_oidc_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_water_containers user_water_containers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_water_containers
    ADD CONSTRAINT user_water_containers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: water_intake water_intake_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake
    ADD CONSTRAINT water_intake_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: water_intake water_intake_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake
    ADD CONSTRAINT water_intake_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: weekly_goal_plans weekly_goal_plans_friday_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_friday_fkey FOREIGN KEY (friday_preset_id) REFERENCES public.goal_presets(id) ON DELETE SET NULL;


--
-- Name: weekly_goal_plans weekly_goal_plans_monday_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_monday_fkey FOREIGN KEY (monday_preset_id) REFERENCES public.goal_presets(id) ON DELETE SET NULL;


--
-- Name: weekly_goal_plans weekly_goal_plans_saturday_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_saturday_fkey FOREIGN KEY (saturday_preset_id) REFERENCES public.goal_presets(id) ON DELETE SET NULL;


--
-- Name: weekly_goal_plans weekly_goal_plans_sunday_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_sunday_fkey FOREIGN KEY (sunday_preset_id) REFERENCES public.goal_presets(id) ON DELETE SET NULL;


--
-- Name: weekly_goal_plans weekly_goal_plans_thursday_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_thursday_fkey FOREIGN KEY (thursday_preset_id) REFERENCES public.goal_presets(id) ON DELETE SET NULL;


--
-- Name: weekly_goal_plans weekly_goal_plans_tuesday_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_tuesday_fkey FOREIGN KEY (tuesday_preset_id) REFERENCES public.goal_presets(id) ON DELETE SET NULL;


--
-- Name: weekly_goal_plans weekly_goal_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: weekly_goal_plans weekly_goal_plans_wednesday_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_goal_plans
    ADD CONSTRAINT weekly_goal_plans_wednesday_fkey FOREIGN KEY (wednesday_preset_id) REFERENCES public.goal_presets(id) ON DELETE SET NULL;


--
-- Name: workout_plan_assignment_sets workout_plan_assignment_sets_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_assignment_sets
    ADD CONSTRAINT workout_plan_assignment_sets_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.workout_plan_template_assignments(id) ON DELETE CASCADE;


--
-- Name: workout_plan_template_assignments workout_plan_template_assignments_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_template_assignments
    ADD CONSTRAINT workout_plan_template_assignments_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: workout_plan_template_assignments workout_plan_template_assignments_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_template_assignments
    ADD CONSTRAINT workout_plan_template_assignments_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.workout_plan_templates(id) ON DELETE CASCADE;


--
-- Name: workout_plan_template_assignments workout_plan_template_assignments_workout_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_template_assignments
    ADD CONSTRAINT workout_plan_template_assignments_workout_preset_id_fkey FOREIGN KEY (workout_preset_id) REFERENCES public.workout_presets(id) ON DELETE CASCADE;


--
-- Name: workout_plan_templates workout_plan_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plan_templates
    ADD CONSTRAINT workout_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workout_preset_exercise_sets workout_preset_exercise_sets_workout_preset_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_preset_exercise_sets
    ADD CONSTRAINT workout_preset_exercise_sets_workout_preset_exercise_id_fkey FOREIGN KEY (workout_preset_exercise_id) REFERENCES public.workout_preset_exercises(id) ON DELETE CASCADE;


--
-- Name: workout_preset_exercises workout_preset_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_preset_exercises
    ADD CONSTRAINT workout_preset_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;


--
-- Name: workout_preset_exercises workout_preset_exercises_workout_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_preset_exercises
    ADD CONSTRAINT workout_preset_exercises_workout_preset_id_fkey FOREIGN KEY (workout_preset_id) REFERENCES public.workout_presets(id) ON DELETE CASCADE;


--
-- Name: workout_presets workout_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_presets
    ADD CONSTRAINT workout_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ai_service_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_service_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: check_in_measurements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.check_in_measurements ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_measurements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_measurements ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_entry_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_entry_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: external_data_providers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_data_providers ENABLE ROW LEVEL SECURITY;

--
-- Name: family_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_access ENABLE ROW LEVEL SECURITY;

--
-- Name: fasting_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fasting_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: food_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.food_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: food_entry_meals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.food_entry_meals ENABLE ROW LEVEL SECURITY;

--
-- Name: food_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.food_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: foods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;

--
-- Name: goal_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goal_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: family_access insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_policy ON public.family_access FOR INSERT WITH CHECK ((public.current_user_id() = owner_user_id));


--
-- Name: food_entries insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_policy ON public.food_entries FOR INSERT WITH CHECK ((public.has_diary_access(user_id) AND (EXISTS ( SELECT 1
   FROM public.foods f
  WHERE (f.id = food_entries.food_id)))));


--
-- Name: meal_foods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_foods ENABLE ROW LEVEL SECURITY;

--
-- Name: meal_plan_template_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_plan_template_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: meal_plan_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_plan_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: meal_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: meals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

--
-- Name: check_in_measurements modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.check_in_measurements USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: custom_categories modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.custom_categories USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: custom_measurements modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.custom_measurements USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: exercise_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.exercise_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: exercise_entry_sets modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.exercise_entry_sets USING ((EXISTS ( SELECT 1
   FROM public.exercise_entries ee
  WHERE ((ee.id = exercise_entry_sets.exercise_entry_id) AND public.has_diary_access(ee.user_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.exercise_entries ee
  WHERE ((ee.id = exercise_entry_sets.exercise_entry_id) AND public.has_diary_access(ee.user_id)))));


--
-- Name: exercise_preset_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.exercise_preset_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: exercises modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.exercises USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: external_data_providers modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.external_data_providers USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: family_access modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.family_access USING ((public.current_user_id() = owner_user_id)) WITH CHECK ((public.current_user_id() = owner_user_id));


--
-- Name: food_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.food_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: food_entry_meals modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.food_entry_meals USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: foods modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.foods USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: meal_foods modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.meal_foods USING ((EXISTS ( SELECT 1
   FROM public.meals m
  WHERE ((m.id = meal_foods.meal_id) AND (public.current_user_id() = m.user_id) AND (EXISTS ( SELECT 1
           FROM public.foods f
          WHERE (f.id = meal_foods.food_id))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.meals m
  WHERE ((m.id = meal_foods.meal_id) AND (public.current_user_id() = m.user_id) AND (EXISTS ( SELECT 1
           FROM public.foods f
          WHERE (f.id = meal_foods.food_id)))))));


--
-- Name: meal_plan_templates modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.meal_plan_templates USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: meals modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.meals USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: sleep_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.sleep_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: sleep_entry_stages modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.sleep_entry_stages USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: water_intake modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.water_intake USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: workout_plan_templates modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.workout_plan_templates USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: workout_presets modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.workout_presets USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: mood_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_service_settings owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.ai_service_settings USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: fasting_logs owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.fasting_logs USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: goal_presets owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.goal_presets USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: meal_plan_template_assignments owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.meal_plan_template_assignments USING (((EXISTS ( SELECT 1
   FROM public.meal_plan_templates mpt
  WHERE ((mpt.id = meal_plan_template_assignments.template_id) AND (public.current_user_id() = mpt.user_id)))) AND ((((item_type)::text = 'food'::text) AND (EXISTS ( SELECT 1
   FROM public.foods f
  WHERE (f.id = meal_plan_template_assignments.food_id)))) OR (((item_type)::text = 'meal'::text) AND (EXISTS ( SELECT 1
   FROM public.meals m
  WHERE (m.id = meal_plan_template_assignments.meal_id))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.meal_plan_templates mpt
  WHERE ((mpt.id = meal_plan_template_assignments.template_id) AND (public.current_user_id() = mpt.user_id)))) AND ((((item_type)::text = 'food'::text) AND (EXISTS ( SELECT 1
   FROM public.foods f
  WHERE (f.id = meal_plan_template_assignments.food_id)))) OR (((item_type)::text = 'meal'::text) AND (EXISTS ( SELECT 1
   FROM public.meals m
  WHERE (m.id = meal_plan_template_assignments.meal_id)))))));


--
-- Name: meal_plans owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.meal_plans USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: mood_entries owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.mood_entries USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: profiles owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.profiles USING ((id = public.current_user_id())) WITH CHECK ((id = public.current_user_id()));


--
-- Name: sparky_chat_history owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.sparky_chat_history USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_api_keys owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_api_keys USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_custom_nutrients owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_custom_nutrients USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_goals owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_goals USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_ignored_updates owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_ignored_updates USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_nutrient_display_preferences owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_nutrient_display_preferences USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_oidc_links owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_oidc_links USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_preferences owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_preferences USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_water_containers owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_water_containers USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: weekly_goal_plans owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.weekly_goal_plans USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: workout_plan_assignment_sets owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.workout_plan_assignment_sets USING ((EXISTS ( SELECT 1
   FROM public.workout_plan_template_assignments wpta
  WHERE (wpta.id = workout_plan_assignment_sets.assignment_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workout_plan_template_assignments wpta
  WHERE (wpta.id = workout_plan_assignment_sets.assignment_id))));


--
-- Name: workout_plan_template_assignments owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.workout_plan_template_assignments USING ((EXISTS ( SELECT 1
   FROM public.workout_plan_templates wpt
  WHERE ((wpt.id = workout_plan_template_assignments.template_id) AND (public.current_user_id() = wpt.user_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workout_plan_templates wpt
  WHERE ((wpt.id = workout_plan_template_assignments.template_id) AND (public.current_user_id() = wpt.user_id)))));


--
-- Name: workout_preset_exercise_sets owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.workout_preset_exercise_sets USING ((EXISTS ( SELECT 1
   FROM public.workout_preset_exercises wpe
  WHERE (wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workout_preset_exercises wpe
  WHERE (wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id))));


--
-- Name: workout_preset_exercises owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.workout_preset_exercises USING ((EXISTS ( SELECT 1
   FROM public.workout_presets wp
  WHERE (wp.id = workout_preset_exercises.workout_preset_id)))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workout_presets wp
  WHERE (wp.id = workout_preset_exercises.workout_preset_id))));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: food_variants select_and_modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_and_modify_policy ON public.food_variants USING ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_variants.food_id) AND public.has_library_access_with_public(f.user_id, f.shared_with_public, ARRAY['can_view_food_library'::text, 'can_manage_diary'::text]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_variants.food_id) AND public.has_diary_access(f.user_id)))));


--
-- Name: exercise_entries select_exercise_preset_entry_linked_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_exercise_preset_entry_linked_policy ON public.exercise_entries FOR SELECT USING (((exercise_preset_entry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.exercise_preset_entries epe
  WHERE ((epe.id = exercise_entries.exercise_preset_entry_id) AND public.has_diary_access(epe.user_id))))));


--
-- Name: check_in_measurements select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.check_in_measurements FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: custom_categories select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.custom_categories FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: custom_measurements select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.custom_measurements FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: exercise_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.exercise_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: exercise_entry_sets select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.exercise_entry_sets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.exercise_entries ee
  WHERE ((ee.id = exercise_entry_sets.exercise_entry_id) AND public.has_diary_access(ee.user_id)))));


--
-- Name: exercise_preset_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.exercise_preset_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: exercises select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.exercises FOR SELECT USING (public.has_library_access_with_public(user_id, shared_with_public, ARRAY['can_view_exercise_library'::text, 'can_manage_diary'::text]));


--
-- Name: external_data_providers select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.external_data_providers FOR SELECT USING (((public.current_user_id() = user_id) OR ((provider_type <> 'garmin'::text) AND (shared_with_public OR public.has_family_access_or(user_id, ARRAY['can_view_food_library'::text, 'can_view_exercise_library'::text])))));


--
-- Name: family_access select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.family_access FOR SELECT USING (((public.current_user_id() = owner_user_id) OR (public.current_user_id() = family_user_id)));


--
-- Name: food_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.food_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: food_entry_meals select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.food_entry_meals FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: foods select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.foods FOR SELECT USING (public.has_library_access_with_public(user_id, shared_with_public, ARRAY['can_view_food_library'::text, 'can_manage_diary'::text]));


--
-- Name: meal_foods select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.meal_foods FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meals m
  WHERE ((m.id = meal_foods.meal_id) AND public.has_library_access_with_public(m.user_id, m.is_public, ARRAY['can_view_food_library'::text, 'can_manage_diary'::text])))));


--
-- Name: meal_plan_templates select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.meal_plan_templates FOR SELECT USING (public.has_library_access_with_public(user_id, false, ARRAY['can_view_food_library'::text]));


--
-- Name: meals select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.meals FOR SELECT USING (public.has_library_access_with_public(user_id, is_public, ARRAY['can_view_food_library'::text, 'can_manage_diary'::text]));


--
-- Name: sleep_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.sleep_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: sleep_entry_stages select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.sleep_entry_stages FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: water_intake select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.water_intake FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: workout_plan_templates select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.workout_plan_templates FOR SELECT USING (public.has_library_access_with_public(user_id, false, ARRAY['can_view_exercise_library'::text]));


--
-- Name: workout_presets select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.workout_presets FOR SELECT USING (public.has_library_access_with_public(user_id, false, ARRAY['can_view_exercise_library'::text]));


--
-- Name: sparky_chat_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sparky_chat_history ENABLE ROW LEVEL SECURITY;

--
-- Name: user_api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: user_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ignored_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ignored_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: user_nutrient_display_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_nutrient_display_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_oidc_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_oidc_links ENABLE ROW LEVEL SECURITY;

--
-- Name: user_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_water_containers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_water_containers ENABLE ROW LEVEL SECURITY;

--
-- Name: water_intake; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.water_intake ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_goal_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_goal_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_plan_assignment_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_plan_assignment_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_plan_template_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_plan_template_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_plan_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_plan_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_preset_exercise_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_preset_exercise_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_preset_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_preset_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA auth TO sparky_app;
GRANT USAGE ON SCHEMA auth TO sparky_test;
GRANT USAGE ON SCHEMA auth TO sparky_uat;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO sparky_app;
GRANT USAGE ON SCHEMA public TO sparky_test;
GRANT USAGE ON SCHEMA public TO sparky;
GRANT USAGE ON SCHEMA public TO sparky_uat;


--
-- Name: SCHEMA system; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA system TO sparky_app;
GRANT USAGE ON SCHEMA system TO sparky_test;
GRANT USAGE ON SCHEMA system TO sparky_uat;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.users TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.users TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.users TO sparky_uat;


--
-- Name: TABLE admin_activity_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.admin_activity_logs TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.admin_activity_logs TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.admin_activity_logs TO sparky_uat;


--
-- Name: TABLE ai_service_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_service_settings TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_service_settings TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_service_settings TO sparky_uat;


--
-- Name: TABLE backup_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.backup_settings TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.backup_settings TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.backup_settings TO sparky_uat;


--
-- Name: SEQUENCE backup_settings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.backup_settings_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.backup_settings_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.backup_settings_id_seq TO sparky_uat;


--
-- Name: TABLE check_in_measurements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_measurements TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_measurements TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_measurements TO sparky_uat;


--
-- Name: TABLE custom_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_categories TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_categories TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_categories TO sparky_uat;


--
-- Name: TABLE custom_measurements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_measurements TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_measurements TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_measurements TO sparky_uat;


--
-- Name: TABLE exercise_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entries TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entries TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entries TO sparky_uat;


--
-- Name: TABLE exercise_entry_activity_details; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_activity_details TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_activity_details TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_activity_details TO sparky_uat;


--
-- Name: TABLE exercise_entry_sets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_sets TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_sets TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_sets TO sparky_uat;


--
-- Name: SEQUENCE exercise_entry_sets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.exercise_entry_sets_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.exercise_entry_sets_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.exercise_entry_sets_id_seq TO sparky_uat;


--
-- Name: TABLE exercise_preset_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_preset_entries TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_preset_entries TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_preset_entries TO sparky_uat;


--
-- Name: TABLE exercises; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercises TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercises TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercises TO sparky_uat;


--
-- Name: TABLE external_data_providers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_data_providers TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_data_providers TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_data_providers TO sparky_uat;


--
-- Name: TABLE family_access; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.family_access TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.family_access TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.family_access TO sparky_uat;


--
-- Name: TABLE fasting_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.fasting_logs TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fasting_logs TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fasting_logs TO sparky_uat;


--
-- Name: TABLE food_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entries TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entries TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entries TO sparky_uat;


--
-- Name: TABLE food_entry_meals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entry_meals TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entry_meals TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entry_meals TO sparky_uat;


--
-- Name: TABLE food_variants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_variants TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_variants TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_variants TO sparky_uat;


--
-- Name: TABLE foods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.foods TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.foods TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.foods TO sparky_uat;


--
-- Name: TABLE global_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.global_settings TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.global_settings TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.global_settings TO sparky_uat;


--
-- Name: TABLE goal_presets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_presets TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_presets TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_presets TO sparky_uat;


--
-- Name: TABLE meal_foods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_foods TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_foods TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_foods TO sparky_uat;


--
-- Name: TABLE meal_plan_template_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_template_assignments TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_template_assignments TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_template_assignments TO sparky_uat;


--
-- Name: TABLE meal_plan_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_templates TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_templates TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_templates TO sparky_uat;


--
-- Name: TABLE meal_plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plans TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plans TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plans TO sparky_uat;


--
-- Name: TABLE meals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meals TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meals TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meals TO sparky_uat;


--
-- Name: TABLE mood_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mood_entries TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mood_entries TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mood_entries TO sparky_uat;


--
-- Name: TABLE oidc_providers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oidc_providers TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oidc_providers TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oidc_providers TO sparky_uat;


--
-- Name: SEQUENCE oidc_providers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.oidc_providers_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.oidc_providers_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.oidc_providers_id_seq TO sparky_uat;


--
-- Name: TABLE onboarding_data; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_data TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_data TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_data TO sparky_uat;


--
-- Name: TABLE onboarding_status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_status TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_status TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_status TO sparky_uat;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pg_stat_statements TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pg_stat_statements TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pg_stat_statements TO sparky_uat;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pg_stat_statements_info TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pg_stat_statements_info TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.pg_stat_statements_info TO sparky_uat;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO sparky_uat;


--
-- Name: TABLE session; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO sparky_uat;


--
-- Name: TABLE sleep_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entries TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entries TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entries TO sparky_uat;


--
-- Name: TABLE sleep_entry_stages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entry_stages TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entry_stages TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entry_stages TO sparky_uat;


--
-- Name: TABLE sparky_chat_history; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sparky_chat_history TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sparky_chat_history TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sparky_chat_history TO sparky_uat;


--
-- Name: TABLE user_api_keys; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_api_keys TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_api_keys TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_api_keys TO sparky_uat;


--
-- Name: TABLE user_custom_nutrients; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_nutrients TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_nutrients TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_nutrients TO sparky_uat;


--
-- Name: TABLE user_goals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_goals TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_goals TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_goals TO sparky_uat;


--
-- Name: TABLE user_ignored_updates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_ignored_updates TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_ignored_updates TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_ignored_updates TO sparky_uat;


--
-- Name: TABLE user_nutrient_display_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_nutrient_display_preferences TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_nutrient_display_preferences TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_nutrient_display_preferences TO sparky_uat;


--
-- Name: SEQUENCE user_nutrient_display_preferences_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_nutrient_display_preferences_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.user_nutrient_display_preferences_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.user_nutrient_display_preferences_id_seq TO sparky_uat;


--
-- Name: TABLE user_oidc_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_oidc_links TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_oidc_links TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_oidc_links TO sparky_uat;


--
-- Name: SEQUENCE user_oidc_links_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_oidc_links_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.user_oidc_links_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.user_oidc_links_id_seq TO sparky_uat;


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_preferences TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_preferences TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_preferences TO sparky_uat;


--
-- Name: TABLE user_water_containers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_water_containers TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_water_containers TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_water_containers TO sparky_uat;


--
-- Name: SEQUENCE user_water_containers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_water_containers_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.user_water_containers_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.user_water_containers_id_seq TO sparky_uat;


--
-- Name: TABLE water_intake; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake TO sparky_uat;


--
-- Name: TABLE weekly_goal_plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.weekly_goal_plans TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.weekly_goal_plans TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.weekly_goal_plans TO sparky_uat;


--
-- Name: TABLE workout_plan_assignment_sets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_assignment_sets TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_assignment_sets TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_assignment_sets TO sparky_uat;


--
-- Name: SEQUENCE workout_plan_assignment_sets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_assignment_sets_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_assignment_sets_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_assignment_sets_id_seq TO sparky_uat;


--
-- Name: TABLE workout_plan_template_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_template_assignments TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_template_assignments TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_template_assignments TO sparky_uat;


--
-- Name: SEQUENCE workout_plan_template_assignments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_template_assignments_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_template_assignments_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_template_assignments_id_seq TO sparky_uat;


--
-- Name: TABLE workout_plan_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_templates TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_templates TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_templates TO sparky_uat;


--
-- Name: SEQUENCE workout_plan_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_templates_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_templates_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_templates_id_seq TO sparky_uat;


--
-- Name: TABLE workout_preset_exercise_sets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercise_sets TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercise_sets TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercise_sets TO sparky_uat;


--
-- Name: SEQUENCE workout_preset_exercise_sets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercise_sets_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercise_sets_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercise_sets_id_seq TO sparky_uat;


--
-- Name: TABLE workout_preset_exercises; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercises TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercises TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercises TO sparky_uat;


--
-- Name: SEQUENCE workout_preset_exercises_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercises_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercises_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercises_id_seq TO sparky_uat;


--
-- Name: TABLE workout_presets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_presets TO sparky_app;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_presets TO sparky_test;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_presets TO sparky_uat;


--
-- Name: SEQUENCE workout_presets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_presets_id_seq TO sparky_app;
GRANT SELECT,USAGE ON SEQUENCE public.workout_presets_id_seq TO sparky_test;
GRANT SELECT,USAGE ON SEQUENCE public.workout_presets_id_seq TO sparky_uat;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: system; Owner: -
--

GRANT SELECT ON TABLE system.schema_migrations TO sparky_app;
GRANT SELECT ON TABLE system.schema_migrations TO sparky_test;
GRANT SELECT ON TABLE system.schema_migrations TO sparky_uat;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_test;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_uat;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sparky;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sparky_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sparky_test;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sparky_uat;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_app;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_test;
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_uat;


--
-- PostgreSQL database dump complete
--

\unrestrict Hb9PePndvFR0vQvRT7LibJs74ogZtZW4BjX9ezkShB8cbvZsnfAY1d8Oj2PNNme

