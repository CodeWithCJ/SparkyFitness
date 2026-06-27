--
-- PostgreSQL database dump
--

\restrict dhGmLySjFGTRowxkdoNsugMJvJLlJnLFKqaQcs0DG614jCZILkcwuzPSKJ6l1bT

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.4 (Homebrew)

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
-- Name: authenticated_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authenticated_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.authenticated_user_id', true), '')::uuid;
$$;


--
-- Name: calculate_mid_sleep(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_mid_sleep(sleep_start_ts bigint, sleep_end_ts bigint) RETURNS time without time zone
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    mid_ts BIGINT;
    mid_time TIMESTAMP WITH TIME ZONE;
BEGIN
    IF sleep_start_ts IS NULL OR sleep_end_ts IS NULL THEN
        RETURN NULL;
    END IF;

    mid_ts := sleep_start_ts + (sleep_end_ts - sleep_start_ts) / 2;
    mid_time := TO_TIMESTAMP(mid_ts / 1000.0);

    RETURN mid_time::TIME;
END;
$$;


--
-- Name: FUNCTION calculate_mid_sleep(sleep_start_ts bigint, sleep_end_ts bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calculate_mid_sleep(sleep_start_ts bigint, sleep_end_ts bigint) IS 'Calculates mid-sleep point from timestamps (milliseconds)';


--
-- Name: can_access_user_data(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_user_data(target_user_id uuid, permission_type text, auth_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  -- Self access
  IF target_user_id = auth_user_id THEN
    RETURN TRUE;
  END IF;

  -- Family access check
  RETURN EXISTS (
    SELECT 1
    FROM public.family_access fa
    WHERE fa.family_user_id = auth_user_id
      AND fa.owner_user_id = target_user_id
      AND fa.is_active = TRUE
      AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())
      AND (
        (fa.access_permissions->>permission_type)::BOOLEAN = TRUE
        OR
        -- Mapping for common permission names
        (permission_type = 'diary' AND (fa.access_permissions->>'can_manage_diary')::BOOLEAN = TRUE)
        OR
        (permission_type = 'checkin' AND (fa.access_permissions->>'can_manage_checkin')::BOOLEAN = TRUE)
        OR
        (permission_type = 'reports' AND (fa.access_permissions->>'can_view_reports')::BOOLEAN = TRUE)
        OR
        -- Inheritance: reports permission grants read access to others
        (permission_type IN ('calorie', 'diary', 'mood', 'sleep', 'exercise', 'water', 'checkin')
         AND (COALESCE((fa.access_permissions->>'reports')::BOOLEAN, FALSE)
              OR COALESCE((fa.access_permissions->>'can_view_reports')::BOOLEAN, FALSE)))
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
  -- No-op: default providers are now instance-level global records (is_public = TRUE).
  -- See create_global_default_providers() for the one-time seeding logic.
  NULL;
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
-- Name: create_global_default_providers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_global_default_providers(p_admin_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Free Exercise DB
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Free Exercise DB', 'free-exercise-db', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Wger
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Wger', 'wger', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Open Food Facts
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Open Food Facts', 'openfoodfacts', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;

  -- Swiss Food Database
  INSERT INTO public.external_data_providers (
    user_id, provider_name, provider_type, is_active, is_public, created_at, updated_at
  ) VALUES (
    p_admin_user_id, 'Swiss Food Database', 'swissfood', TRUE, TRUE, now(), now()
  ) ON CONFLICT (user_id, provider_name) DO UPDATE SET is_public = TRUE;
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
        TO PUBLIC
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
        TO PUBLIC
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
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
    DECLARE
        v_user_id UUID;
    BEGIN
        SELECT id INTO v_user_id
        FROM public."user"
        WHERE LOWER(email) = LOWER(p_email)
        LIMIT 1;

        RETURN v_user_id;
    END;
    $$;


--
-- Name: fn_sync_mfa_totp_flag(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_mfa_totp_flag() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE "user" SET mfa_totp_enabled = TRUE WHERE id = NEW.user_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE "user" SET mfa_totp_enabled = FALSE WHERE id = OLD.user_id;
    END IF;
    RETURN NULL;
END;
$$;


--
-- Name: fn_sync_user_mfa_global(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_user_mfa_global() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If global 2FA is turned off, force our custom flags to false
    IF (NEW.two_factor_enabled = FALSE AND OLD.two_factor_enabled = TRUE) THEN
        NEW.mfa_totp_enabled := FALSE;
        NEW.mfa_email_enabled := FALSE;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: get_accessible_users(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_accessible_users(p_user_id uuid) RETURNS TABLE(user_id uuid, full_name text, email text, permissions jsonb, access_end_date timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
    BEGIN
      RETURN QUERY
      SELECT
        fa.owner_user_id,
        p.full_name,
        u.email::TEXT,
        fa.access_permissions,
        fa.access_end_date
      FROM public.family_access fa
      JOIN public.profiles p ON p.id = fa.owner_user_id
      JOIN public."user" u ON u.id = fa.owner_user_id
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
  -- Ensure onboarding_status exists
  INSERT INTO public.onboarding_status (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- NOTE: default external data providers are now global (is_public = TRUE).
  -- They are seeded once when the first admin is created; no per-user rows needed.

  RETURN new;
END;
$$;


--
-- Name: has_diary_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_diary_access(owner_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT authenticated_user_id() = owner_uuid OR has_family_access(owner_uuid, 'can_manage_diary');
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
    AND fa.family_user_id = authenticated_user_id()
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
    AND fa.family_user_id = authenticated_user_id()
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
  SELECT authenticated_user_id() = owner_uuid OR is_shared OR has_family_access_or(owner_uuid, perms);
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public."user" u
    WHERE u.id = authenticated_user_id()
    AND u.role = 'admin'
  );
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
-- Name: seed_global_providers_for_first_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_global_providers_for_first_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Only seed if this user is the admin (first ever user)
  IF NEW.role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.external_data_providers WHERE is_public = TRUE LIMIT 1
  ) THEN
    PERFORM public.create_global_default_providers(NEW.id);
    RAISE NOTICE 'Global default providers seeded for first admin: %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_app_context(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_app_context(p_user_id uuid, p_authenticated_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- app.user_id is used by RLS to determine whose data is being accessed
  PERFORM set_config('app.user_id', p_user_id::text, false);
  
  -- app.authenticated_user_id is the actual logged-in user
  PERFORM set_config('app.authenticated_user_id', p_authenticated_user_id::text, false);
END;
$$;


--
-- Name: set_first_user_as_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_first_user_as_admin() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If there are no users in the table yet, this is the first user
    IF NOT EXISTS (SELECT 1 FROM "user") THEN
        NEW.role := 'admin';
        RAISE NOTICE 'First user detected: %, assigning admin role.', NEW.id;
    END IF;
    RETURN NEW;
END;
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
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    access_token text,
    refresh_token text,
    id_token text,
    access_token_expires_at timestamp without time zone,
    refresh_token_expires_at timestamp without time zone,
    scope text,
    password text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: TABLE account; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.account IS 'Better Auth account table - stores credentials and OIDC links';


--
-- Name: admin_activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    user_id uuid,
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
    api_key_tag text,
    is_public boolean DEFAULT false NOT NULL,
    chat_tool_profile text DEFAULT 'full'::text NOT NULL,
    CONSTRAINT ai_service_settings_chat_tool_profile_check CHECK ((chat_tool_profile = ANY (ARRAY['full'::text, 'core'::text]))),
    CONSTRAINT check_public_settings_user_id_null CHECK ((((is_public = true) AND (user_id IS NULL)) OR ((is_public = false) AND (user_id IS NOT NULL))))
);


--
-- Name: api_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_key (
    id text NOT NULL,
    name text,
    key text NOT NULL,
    reference_id uuid NOT NULL,
    metadata text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    start text,
    prefix text,
    refill_interval integer,
    refill_amount integer,
    last_refill_at timestamp with time zone,
    enabled boolean DEFAULT true,
    rate_limit_enabled boolean DEFAULT true,
    rate_limit_time_window integer DEFAULT 60000,
    rate_limit_max integer DEFAULT 100,
    request_count integer DEFAULT 0,
    remaining integer,
    last_request timestamp with time zone,
    permissions text,
    config_id text
);


--
-- Name: TABLE api_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.api_key IS 'Better Auth API key table - replaces legacy user_api_keys';


--
-- Name: COLUMN api_key.reference_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_key.reference_id IS 'Renamed from user_id to match Better Auth 1.5 API Key plugin requirement';


--
-- Name: COLUMN api_key.config_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.api_key.config_id IS 'Added for Better Auth 1.5 multi-config support';


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
-- Name: check_in_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.check_in_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    check_in_measurement_id uuid,
    entry_date date NOT NULL,
    photo_type character varying(5) NOT NULL,
    file_path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_in_photos_type_check CHECK (((photo_type)::text = ANY ((ARRAY['front'::character varying, 'back'::character varying, 'side'::character varying])::text[])))
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
-- Name: daily_sleep_need; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_sleep_need (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_date date NOT NULL,
    calculated_at timestamp with time zone DEFAULT now(),
    baseline_need numeric(4,2) NOT NULL,
    strain_addition numeric(4,2) DEFAULT 0,
    debt_addition numeric(4,2) DEFAULT 0,
    nap_subtraction numeric(4,2) DEFAULT 0,
    total_need numeric(4,2) NOT NULL,
    training_load_score numeric(5,2),
    current_debt_hours numeric(4,2),
    nap_minutes integer DEFAULT 0,
    recovery_score_yesterday integer
);


--
-- Name: TABLE daily_sleep_need; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.daily_sleep_need IS 'Daily sleep need cache with WHOOP-style decomposition';


--
-- Name: day_classification_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.day_classification_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    classified_as character varying(10) NOT NULL,
    mean_wake_hour numeric(5,2),
    variance_minutes numeric(6,2),
    sample_count integer,
    last_updated timestamp with time zone DEFAULT now(),
    CONSTRAINT day_classification_cache_classified_as_check CHECK (((classified_as)::text = ANY (ARRAY[('workday'::character varying)::text, ('freeday'::character varying)::text]))),
    CONSTRAINT day_classification_cache_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


--
-- Name: TABLE day_classification_cache; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.day_classification_cache IS 'Automatic weekday classification cache';


--
-- Name: COLUMN day_classification_cache.day_of_week; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.day_classification_cache.day_of_week IS '0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat';


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
    exercise_preset_entry_id uuid,
    sort_order integer DEFAULT 0,
    steps integer,
    water_estimated integer
);


--
-- Name: COLUMN exercise_entries.steps; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercise_entries.steps IS 'Number of steps recorded during this activity, sourced from Garmin or other providers.';


--
-- Name: exercise_entry_activity_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_entry_activity_details (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    rpe numeric(3,1)
);


--
-- Name: COLUMN exercise_entry_sets.rpe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercise_entry_sets.rpe IS 'Rate of Perceived Exertion (usually 1-10 scale)';


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
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
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
    encrypted_access_token text,
    access_token_iv text,
    access_token_tag text,
    encrypted_refresh_token text,
    refresh_token_iv text,
    refresh_token_tag text,
    scope text,
    last_sync_at timestamp with time zone,
    sync_frequency text DEFAULT 'manual'::text,
    oauth_state text,
    sort_order integer,
    is_public boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN external_data_providers.provider_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.external_data_providers.provider_type IS 'References the external_provider_types table. Refactored from a CHECK constraint to a lookup table.';


--
-- Name: COLUMN external_data_providers.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.external_data_providers.sort_order IS 'Manual display order for provider selection UI (lower value appears first).';


--
-- Name: external_provider_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_provider_types (
    id character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_strictly_private boolean DEFAULT true,
    categories character varying(50)[],
    required_fields character varying(50)[],
    field_labels jsonb,
    supports_barcode boolean DEFAULT false NOT NULL
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
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone,
    target_end_time timestamp with time zone,
    duration_minutes integer,
    fasting_type character varying(50),
    status character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fasting_logs_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('COMPLETED'::character varying)::text, ('CANCELLED'::character varying)::text])))
);


--
-- Name: food_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    food_id uuid,
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
    meal_type_id uuid NOT NULL,
    allergens text[],
    traces text[],
    source character varying(50),
    source_id character varying(255),
    CONSTRAINT chk_food_or_meal_id CHECK ((((food_id IS NOT NULL) AND (meal_id IS NULL)) OR ((food_id IS NULL) AND (meal_id IS NOT NULL))))
);


--
-- Name: COLUMN food_entries.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.food_entries.source IS 'Provider that produced this entry (e.g. ''health_connect''). NULL for manual/web entries.';


--
-- Name: COLUMN food_entries.source_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.food_entries.source_id IS 'Provider-stable record id for idempotent re-sync. NULL for manual/web entries.';


--
-- Name: food_entry_meals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.food_entry_meals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    meal_template_id uuid,
    entry_date date NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id uuid NOT NULL,
    updated_by_user_id uuid NOT NULL,
    quantity numeric DEFAULT 1.0 NOT NULL,
    unit text DEFAULT 'serving'::text,
    meal_type_id uuid NOT NULL,
    legacy_serving_unit_math boolean DEFAULT false NOT NULL
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
-- Name: COLUMN food_entry_meals.legacy_serving_unit_math; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.food_entry_meals.legacy_serving_unit_math IS 'TRUE for diary entries logged before the serving-model migration where unit=''serving'' had special-case multiplier semantics. Read by foodEntryService recompute/unscale paths.';


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
    source text DEFAULT 'manual'::text NOT NULL,
    ai_confidence text,
    allergens text[],
    traces text[],
    CONSTRAINT food_variants_ai_confidence_check CHECK (((ai_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])) OR (ai_confidence IS NULL))),
    CONSTRAINT food_variants_glycemic_index_check CHECK ((glycemic_index = ANY (ARRAY['None'::text, 'Very Low'::text, 'Low'::text, 'Medium'::text, 'High'::text, 'Very High'::text]))),
    CONSTRAINT food_variants_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'ai_estimate'::text, 'imported'::text])))
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
    allow_user_ai_config boolean DEFAULT true NOT NULL,
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
    water_goal numeric(10,3),
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
    custom_nutrients jsonb DEFAULT '{}'::jsonb,
    custom_meal_percentages jsonb DEFAULT '{}'::jsonb
);


--
-- Name: injection_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.injection_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    medication_id uuid,
    user_id uuid NOT NULL,
    pen_id uuid,
    injected_at timestamp with time zone DEFAULT now() NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    site character varying(40),
    dose_mg numeric,
    notes text,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
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
    custom_nutrients jsonb
);


--
-- Name: meal_plan_template_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_plan_template_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    meal_id uuid,
    item_type character varying(50) DEFAULT 'meal'::character varying NOT NULL,
    food_id uuid,
    variant_id uuid,
    quantity numeric(10,2),
    unit character varying(50),
    meal_type_id uuid NOT NULL,
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
    is_template boolean DEFAULT false,
    template_name character varying(255),
    day_of_week integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    meal_type_id uuid NOT NULL,
    CONSTRAINT chk_meal_or_food CHECK ((((meal_id IS NOT NULL) AND (food_id IS NULL) AND (variant_id IS NULL) AND (quantity IS NULL) AND (unit IS NULL)) OR ((meal_id IS NULL) AND (food_id IS NOT NULL) AND (variant_id IS NOT NULL) AND (quantity IS NOT NULL) AND (unit IS NOT NULL))))
);


--
-- Name: meal_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meal_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    user_id uuid,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    is_visible boolean DEFAULT true NOT NULL,
    show_in_quick_log boolean DEFAULT true
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
    serving_unit text DEFAULT 'serving'::text NOT NULL,
    total_servings numeric DEFAULT 1.0 NOT NULL
);


--
-- Name: COLUMN meals.serving_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meals.serving_size IS 'Quantity of one serving in serving_unit (e.g. 250 for a 250 ml serving, or 1 when serving_unit = ''serving''). Same semantic as food_variants.serving_size.';


--
-- Name: COLUMN meals.serving_unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meals.serving_unit IS 'Unit of measurement for the serving size (e.g., g, ml, serving, oz, cup)';


--
-- Name: COLUMN meals.total_servings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.meals.total_servings IS 'How many servings the recipe yields. Full recipe quantity = serving_size × total_servings.';


--
-- Name: medication_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    medication_id uuid,
    schedule_id uuid,
    user_id uuid NOT NULL,
    status character varying(20) DEFAULT 'taken'::character varying NOT NULL,
    taken_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_for timestamp with time zone,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    med_name_snapshot text,
    dose_amount_snapshot numeric,
    dose_unit_snapshot character varying(20),
    notes text,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medication_pens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_pens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    medication_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kind character varying(10) DEFAULT 'pen'::character varying NOT NULL,
    label text,
    dose_mg numeric,
    concentration_mg_ml numeric,
    volume_ml numeric,
    doses_total integer,
    doses_used integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'sealed'::character varying NOT NULL,
    opened_at date,
    expiry_date date,
    bud_date date,
    reorder_flag boolean DEFAULT false NOT NULL,
    reorder_threshold integer,
    notes text,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medication_route_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_route_types (
    id character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medication_schedule_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_schedule_types (
    id character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medication_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    medication_id uuid NOT NULL,
    user_id uuid NOT NULL,
    schedule_type_id character varying(50) NOT NULL,
    time_of_day time without time zone,
    dose_amount numeric,
    days_of_week integer[],
    interval_days integer,
    day_of_month integer,
    cycle_on_days integer,
    cycle_off_days integer,
    with_meal character varying(20),
    prn_reason text,
    prn_max_per_day integer,
    start_date date,
    end_date date,
    active boolean DEFAULT true NOT NULL,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medication_titration_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_titration_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    medication_id uuid NOT NULL,
    user_id uuid NOT NULL,
    dose_mg numeric NOT NULL,
    dose_unit character varying(20) DEFAULT 'mg'::character varying NOT NULL,
    start_date date,
    planned_weeks integer,
    step_order integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'planned'::character varying NOT NULL,
    is_taper boolean DEFAULT false NOT NULL,
    note text,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medication_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medication_types (
    id character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    is_injectable boolean DEFAULT false NOT NULL,
    counting_unit_default character varying(20),
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: medications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    display_name text,
    type_id character varying(50),
    route_id character varying(50),
    strength_value numeric,
    strength_unit character varying(20),
    dose_amount numeric,
    dose_unit character varying(20),
    rxnorm_rxcui character varying(20),
    ndc character varying(20),
    prescriber text,
    pharmacy text,
    rx_number text,
    reason_text text,
    effectiveness_rating smallint,
    color character varying(20),
    icon character varying(50),
    photo_path text,
    is_active boolean DEFAULT true NOT NULL,
    is_quick boolean DEFAULT false NOT NULL,
    is_glp1 boolean DEFAULT false NOT NULL,
    notes text,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


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
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    updated_by_user_id uuid
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
    auto_register boolean DEFAULT false NOT NULL,
    display_name text,
    logo_url text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
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
-- Name: passkey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkey (
    id text NOT NULL,
    name text,
    public_key text NOT NULL,
    user_id uuid NOT NULL,
    credential_id text NOT NULL,
    counter integer NOT NULL,
    device_type text NOT NULL,
    backed_up boolean NOT NULL,
    transports text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    aaguid text
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
    gender character varying(10),
    sleep_need_method character varying(30) DEFAULT 'mctq_corrected'::character varying,
    sleep_need_confidence character varying(10) DEFAULT 'low'::character varying,
    sleep_need_based_on_days integer DEFAULT 0,
    sleep_need_last_calculated timestamp with time zone,
    sd_workday_hours numeric(4,2),
    sd_freeday_hours numeric(4,2),
    baseline_sleep_need numeric(4,2) DEFAULT 8.25,
    social_jetlag_hours numeric(4,2)
);


--
-- Name: COLUMN profiles.sleep_need_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sleep_need_method IS 'Method used: mctq_corrected, rise_percentile, satiation_point, manual, default';


--
-- Name: COLUMN profiles.sleep_need_confidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sleep_need_confidence IS 'Calculation confidence: low, medium, high';


--
-- Name: COLUMN profiles.sleep_need_based_on_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sleep_need_based_on_days IS 'Number of days used in last calculation';


--
-- Name: COLUMN profiles.sleep_need_last_calculated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sleep_need_last_calculated IS 'Timestamp of last sleep need calculation';


--
-- Name: COLUMN profiles.sd_workday_hours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sd_workday_hours IS 'Average sleep on workdays (SD_W)';


--
-- Name: COLUMN profiles.sd_freeday_hours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.sd_freeday_hours IS 'Average sleep on free days (SD_F)';


--
-- Name: COLUMN profiles.baseline_sleep_need; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.baseline_sleep_need IS 'Calculated baseline need (without dynamic adjustments)';


--
-- Name: COLUMN profiles.social_jetlag_hours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.social_jetlag_hours IS 'Calculated Social Jetlag (|MSF - MSW|)';


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    token text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_address text,
    user_agent text,
    user_id uuid NOT NULL
);


--
-- Name: TABLE session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session IS 'Better Auth session table';


--
-- Name: sleep_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleep_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
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
    resting_heart_rate numeric,
    created_by_user_id uuid,
    updated_by_user_id uuid
);


--
-- Name: sleep_entry_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleep_entry_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_id uuid NOT NULL,
    user_id uuid NOT NULL,
    stage_type character varying(50) NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    duration_in_seconds integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id uuid,
    updated_by_user_id uuid
);


--
-- Name: sleep_need_calculations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sleep_need_calculations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    calculated_at timestamp with time zone DEFAULT now(),
    method character varying(30) NOT NULL,
    calculated_need numeric(4,2) NOT NULL,
    confidence character varying(10) NOT NULL,
    based_on_days integer NOT NULL,
    sd_workday numeric(4,2),
    sd_freeday numeric(4,2),
    sd_week numeric(4,2),
    social_jetlag_hours numeric(4,2),
    mid_sleep_workday time without time zone,
    mid_sleep_freeday time without time zone,
    mid_sleep_corrected time without time zone,
    workdays_count integer,
    freedays_count integer,
    data_start_date date,
    data_end_date date
);


--
-- Name: TABLE sleep_need_calculations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sleep_need_calculations IS 'History of sleep need calculations with MCTQ parameters';


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
    parts jsonb,
    CONSTRAINT sparky_chat_history_message_type_check CHECK ((message_type = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: COLUMN sparky_chat_history.parts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sparky_chat_history.parts IS 'Stores multimodal message parts (text, image, etc.) as an array of objects. Compatible with Vercel AI SDK CoreMessage parts.';


--
-- Name: sso_provider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sso_provider (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id text NOT NULL,
    issuer text NOT NULL,
    client_id text NOT NULL,
    client_secret text,
    discovery_endpoint text,
    authorization_endpoint text,
    token_endpoint text,
    jwks_endpoint text,
    userinfo_endpoint text,
    scopes text,
    additional_config text,
    domain text DEFAULT 'default.internal'::text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    oidc_config jsonb
);


--
-- Name: symptom_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.symptom_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    medication_id uuid,
    symptom_id uuid,
    symptom_name_snapshot text NOT NULL,
    severity numeric,
    severity_label character varying(40),
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    body_location character varying(60),
    context_text text,
    bristol_type smallint,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    custom_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: two_factor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.two_factor (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    secret text,
    backup_codes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    name text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    two_factor_enabled boolean DEFAULT false,
    banned boolean DEFAULT false,
    ban_reason text,
    ban_expires timestamp with time zone,
    role text DEFAULT 'user'::text,
    mfa_email_enabled boolean DEFAULT false,
    mfa_enforced boolean DEFAULT false,
    magic_link_token text,
    magic_link_expires timestamp with time zone,
    mfa_totp_enabled boolean DEFAULT false,
    image text,
    last_login_at timestamp with time zone
);


--
-- Name: TABLE "user"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."user" IS 'Better Auth user table - migrated from auth.users';


--
-- Name: COLUMN "user".image; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."user".image IS 'Profile image URL synced from Better Auth / OIDC providers';


--
-- Name: user_allergen_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_allergen_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    allergen_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
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
-- Name: user_custom_symptom_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_custom_symptom_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_custom_symptoms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_custom_symptoms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    display_name text,
    scale_type character varying(20) DEFAULT '1-10'::character varying NOT NULL,
    unit character varying(20),
    is_glp1_flagged boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_dashboard_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_dashboard_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    page_key text NOT NULL,
    layout jsonb NOT NULL,
    hidden jsonb DEFAULT '[]'::jsonb NOT NULL,
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
    custom_nutrients jsonb DEFAULT '{}'::jsonb,
    custom_meal_percentages jsonb DEFAULT '{}'::jsonb
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
-- Name: user_meal_visibilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_meal_visibilities (
    user_id uuid NOT NULL,
    meal_type_id uuid NOT NULL,
    is_visible boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    show_in_quick_log boolean DEFAULT true
);


--
-- Name: user_medication_display_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_medication_display_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    view_group character varying(255) NOT NULL,
    platform character varying(50) DEFAULT 'web'::character varying NOT NULL,
    visible_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
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
    timezone text,
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
    auto_scale_open_food_facts_imports boolean DEFAULT false,
    exercise_calorie_percentage integer DEFAULT 100,
    activity_level character varying(20) DEFAULT 'not_much'::character varying,
    tdee_allow_negative_adjustment boolean DEFAULT false,
    default_barcode_provider_id uuid,
    auto_scale_online_imports boolean DEFAULT true,
    first_day_of_week smallint DEFAULT 0,
    barcode_fallback_open_food_facts boolean DEFAULT true,
    show_net_carbs boolean DEFAULT false NOT NULL,
    ai_assisted_conversions boolean DEFAULT true NOT NULL,
    goal_mode character varying(50) DEFAULT 'maintain'::character varying NOT NULL,
    goal_mode_calculation_method character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    goal_mode_custom_percentage integer DEFAULT 0 NOT NULL,
    use_external_bmr boolean DEFAULT false NOT NULL,
    active_ai_service_id uuid,
    add_exercise_water_to_goal boolean DEFAULT false NOT NULL,
    measurement_decimal_places integer DEFAULT 0 NOT NULL,
    CONSTRAINT check_energy_unit CHECK (((energy_unit)::text = ANY (ARRAY[('kcal'::character varying)::text, ('kJ'::character varying)::text]))),
    CONSTRAINT logging_level_check CHECK ((logging_level = ANY (ARRAY['DEBUG'::text, 'INFO'::text, 'WARN'::text, 'ERROR'::text, 'SILENT'::text]))),
    CONSTRAINT user_preferences_timezone_not_empty CHECK (((timezone IS NULL) OR (timezone <> ''::text)))
);


--
-- Name: COLUMN user_preferences.auto_scale_open_food_facts_imports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.auto_scale_open_food_facts_imports IS 'When enabled, OpenFoodFacts imports will automatically scale nutrition values from per-100g to the serving size provided by the product';


--
-- Name: COLUMN user_preferences.auto_scale_online_imports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.auto_scale_online_imports IS 'When enabled, nutrition values from all online database imports will auto-scale when the serving size is changed in the Edit Food Details dialog';


--
-- Name: COLUMN user_preferences.first_day_of_week; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_preferences.first_day_of_week IS 'Start day of the week: 0 for Sunday (USA standard), 1 for Monday (ISO 8601).';


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
-- Name: v_mctq_analysis; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_mctq_analysis AS
 SELECT se.user_id,
    se.entry_date AS date,
    EXTRACT(dow FROM se.entry_date) AS day_of_week,
        CASE
            WHEN (dcc.classified_as IS NOT NULL) THEN dcc.classified_as
            WHEN (EXTRACT(dow FROM se.entry_date) = ANY (ARRAY[(0)::numeric, (6)::numeric])) THEN 'freeday'::character varying
            ELSE 'workday'::character varying
        END AS day_type,
    ((se.duration_in_seconds)::numeric / 3600.0) AS tst_hours,
        CASE
            WHEN ((se.bedtime IS NOT NULL) AND (se.wake_time IS NOT NULL)) THEN ((se.bedtime + ((se.wake_time - se.bedtime) / (2)::double precision)))::time without time zone
            ELSE NULL::time without time zone
        END AS mid_sleep,
    se.bedtime,
    se.wake_time,
        CASE
            WHEN (se.wake_time IS NOT NULL) THEN (EXTRACT(hour FROM se.wake_time) + (EXTRACT(minute FROM se.wake_time) / 60.0))
            ELSE NULL::numeric
        END AS wake_hour
   FROM (public.sleep_entries se
     LEFT JOIN public.day_classification_cache dcc ON (((se.user_id = dcc.user_id) AND (EXTRACT(dow FROM se.entry_date) = (dcc.day_of_week)::numeric))))
  WHERE ((se.bedtime IS NOT NULL) AND (se.wake_time IS NOT NULL) AND (se.duration_in_seconds > 0));


--
-- Name: VIEW v_mctq_analysis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_mctq_analysis IS 'View for MCTQ analysis with day classification and TST';


--
-- Name: v_mctq_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_mctq_stats AS
 WITH recent_data AS (
         SELECT v_mctq_analysis.user_id,
            v_mctq_analysis.day_type,
            v_mctq_analysis.tst_hours,
            v_mctq_analysis.mid_sleep,
            v_mctq_analysis.wake_hour
           FROM public.v_mctq_analysis
          WHERE ((v_mctq_analysis.date >= (CURRENT_DATE - '90 days'::interval)) AND (v_mctq_analysis.tst_hours IS NOT NULL) AND ((v_mctq_analysis.tst_hours >= (3)::numeric) AND (v_mctq_analysis.tst_hours <= (14)::numeric)))
        ), workday_stats AS (
         SELECT recent_data.user_id,
            avg(recent_data.tst_hours) AS sd_workday,
            avg((EXTRACT(hour FROM recent_data.mid_sleep) + (EXTRACT(minute FROM recent_data.mid_sleep) / 60.0))) AS msw_hour,
            count(*) AS workday_count
           FROM recent_data
          WHERE ((recent_data.day_type)::text = 'workday'::text)
          GROUP BY recent_data.user_id
        ), freeday_stats AS (
         SELECT recent_data.user_id,
            avg(recent_data.tst_hours) AS sd_freeday,
            avg((EXTRACT(hour FROM recent_data.mid_sleep) + (EXTRACT(minute FROM recent_data.mid_sleep) / 60.0))) AS msf_hour,
            count(*) AS freeday_count
           FROM recent_data
          WHERE ((recent_data.day_type)::text = 'freeday'::text)
          GROUP BY recent_data.user_id
        )
 SELECT COALESCE(w.user_id, f.user_id) AS user_id,
    round(w.sd_workday, 2) AS sd_workday,
    round(f.sd_freeday, 2) AS sd_freeday,
    round(((((5)::numeric * COALESCE(w.sd_workday, (7)::numeric)) + ((2)::numeric * COALESCE(f.sd_freeday, (8)::numeric))) / (7)::numeric), 2) AS sd_week,
        CASE
            WHEN (f.sd_freeday > w.sd_workday) THEN round((f.sd_freeday - ((f.sd_freeday - ((((5)::numeric * w.sd_workday) + ((2)::numeric * f.sd_freeday)) / (7)::numeric)) / (2)::numeric)), 2)
            ELSE round(((((5)::numeric * COALESCE(w.sd_workday, (7)::numeric)) + ((2)::numeric * COALESCE(f.sd_freeday, (8)::numeric))) / (7)::numeric), 2)
        END AS sleep_need_ideal,
    round(abs((COALESCE(f.msf_hour, (4)::numeric) - COALESCE(w.msw_hour, (3)::numeric))), 2) AS social_jetlag_hours,
    w.workday_count,
    f.freeday_count,
        CASE
            WHEN ((COALESCE(w.workday_count, (0)::bigint) >= 40) AND (COALESCE(f.freeday_count, (0)::bigint) >= 16)) THEN 'high'::text
            WHEN ((COALESCE(w.workday_count, (0)::bigint) >= 20) AND (COALESCE(f.freeday_count, (0)::bigint) >= 8)) THEN 'medium'::text
            ELSE 'low'::text
        END AS confidence
   FROM (workday_stats w
     FULL JOIN freeday_stats f ON ((w.user_id = f.user_id)));


--
-- Name: VIEW v_mctq_stats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_mctq_stats IS 'Aggregated MCTQ stats per user with ideal Sleep Need calculation';


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: TABLE verification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.verification IS 'Better Auth verification table';


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
    updated_by_user_id uuid,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL
);


--
-- Name: water_intake_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.water_intake_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    water_ml numeric(10,3) NOT NULL,
    container_id integer,
    container_name character varying(255),
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    logged_at timestamp with time zone DEFAULT now() NOT NULL
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
    sort_order integer DEFAULT 0,
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
    workout_preset_exercise_id integer CONSTRAINT workout_preset_exercise_set_workout_preset_exercise_id_not_null NOT NULL,
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
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    sort_order integer DEFAULT 0
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
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: admin_activity_logs admin_activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_service_settings ai_service_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_service_settings
    ADD CONSTRAINT ai_service_settings_pkey PRIMARY KEY (id);


--
-- Name: api_key api_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key
    ADD CONSTRAINT api_key_pkey PRIMARY KEY (id);


--
-- Name: backup_settings backup_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_settings
    ADD CONSTRAINT backup_settings_pkey PRIMARY KEY (id);


--
-- Name: check_in_measurements check_in_measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_measurements
    ADD CONSTRAINT check_in_measurements_pkey PRIMARY KEY (id);


--
-- Name: check_in_photos check_in_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_photos
    ADD CONSTRAINT check_in_photos_pkey PRIMARY KEY (id);


--
-- Name: check_in_photos check_in_photos_user_date_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_photos
    ADD CONSTRAINT check_in_photos_user_date_type_unique UNIQUE (user_id, entry_date, photo_type);


--
-- Name: daily_sleep_need daily_sleep_need_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_sleep_need
    ADD CONSTRAINT daily_sleep_need_pkey PRIMARY KEY (id);


--
-- Name: daily_sleep_need daily_sleep_need_user_id_target_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_sleep_need
    ADD CONSTRAINT daily_sleep_need_user_id_target_date_key UNIQUE (user_id, target_date);


--
-- Name: day_classification_cache day_classification_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_classification_cache
    ADD CONSTRAINT day_classification_cache_pkey PRIMARY KEY (id);


--
-- Name: day_classification_cache day_classification_cache_user_id_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_classification_cache
    ADD CONSTRAINT day_classification_cache_user_id_day_of_week_key UNIQUE (user_id, day_of_week);


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
-- Name: external_data_providers external_data_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_data_providers
    ADD CONSTRAINT external_data_providers_pkey PRIMARY KEY (id);


--
-- Name: external_provider_types external_provider_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_provider_types
    ADD CONSTRAINT external_provider_types_pkey PRIMARY KEY (id);


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
-- Name: injection_entries injection_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.injection_entries
    ADD CONSTRAINT injection_entries_pkey PRIMARY KEY (id);


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
-- Name: meal_types meal_types_name_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_types
    ADD CONSTRAINT meal_types_name_user_unique UNIQUE NULLS NOT DISTINCT (name, user_id);


--
-- Name: meal_types meal_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_types
    ADD CONSTRAINT meal_types_pkey PRIMARY KEY (id);


--
-- Name: meals meals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meals
    ADD CONSTRAINT meals_pkey PRIMARY KEY (id);


--
-- Name: medication_entries medication_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_entries
    ADD CONSTRAINT medication_entries_pkey PRIMARY KEY (id);


--
-- Name: medication_pens medication_pens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_pens
    ADD CONSTRAINT medication_pens_pkey PRIMARY KEY (id);


--
-- Name: medication_route_types medication_route_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_route_types
    ADD CONSTRAINT medication_route_types_pkey PRIMARY KEY (id);


--
-- Name: medication_schedule_types medication_schedule_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_schedule_types
    ADD CONSTRAINT medication_schedule_types_pkey PRIMARY KEY (id);


--
-- Name: medication_schedules medication_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_schedules
    ADD CONSTRAINT medication_schedules_pkey PRIMARY KEY (id);


--
-- Name: medication_titration_steps medication_titration_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_titration_steps
    ADD CONSTRAINT medication_titration_steps_pkey PRIMARY KEY (id);


--
-- Name: medication_types medication_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_types
    ADD CONSTRAINT medication_types_pkey PRIMARY KEY (id);


--
-- Name: medications medications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medications
    ADD CONSTRAINT medications_pkey PRIMARY KEY (id);


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
-- Name: passkey passkey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey
    ADD CONSTRAINT passkey_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


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
-- Name: sleep_need_calculations sleep_need_calculations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_need_calculations
    ADD CONSTRAINT sleep_need_calculations_pkey PRIMARY KEY (id);


--
-- Name: sso_provider sso_provider_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_provider
    ADD CONSTRAINT sso_provider_pkey PRIMARY KEY (id);


--
-- Name: sso_provider sso_provider_provider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sso_provider
    ADD CONSTRAINT sso_provider_provider_id_key UNIQUE (provider_id);


--
-- Name: symptom_entries symptom_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_pkey PRIMARY KEY (id);


--
-- Name: two_factor two_factor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor
    ADD CONSTRAINT two_factor_pkey PRIMARY KEY (id);


--
-- Name: two_factor two_factor_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor
    ADD CONSTRAINT two_factor_user_id_key UNIQUE (user_id);


--
-- Name: mood_entries unique_user_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT unique_user_date UNIQUE (user_id, entry_date);


--
-- Name: user_medication_display_preferences unique_user_med_display; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_medication_display_preferences
    ADD CONSTRAINT unique_user_med_display UNIQUE (user_id, view_group, platform);


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
-- Name: user_custom_symptom_locations unique_user_symptom_location_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_symptom_locations
    ADD CONSTRAINT unique_user_symptom_location_name UNIQUE (user_id, name);


--
-- Name: user_custom_symptoms unique_user_symptom_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_symptoms
    ADD CONSTRAINT unique_user_symptom_name UNIQUE (user_id, name);


--
-- Name: user_allergen_preferences user_allergen_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_allergen_preferences
    ADD CONSTRAINT user_allergen_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_allergen_preferences user_allergen_preferences_user_id_allergen_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_allergen_preferences
    ADD CONSTRAINT user_allergen_preferences_user_id_allergen_name_key UNIQUE (user_id, allergen_name);


--
-- Name: user_custom_nutrients user_custom_nutrients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_nutrients
    ADD CONSTRAINT user_custom_nutrients_pkey PRIMARY KEY (id);


--
-- Name: user_custom_symptom_locations user_custom_symptom_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_symptom_locations
    ADD CONSTRAINT user_custom_symptom_locations_pkey PRIMARY KEY (id);


--
-- Name: user_custom_symptoms user_custom_symptoms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_symptoms
    ADD CONSTRAINT user_custom_symptoms_pkey PRIMARY KEY (id);


--
-- Name: user_dashboard_layouts user_dashboard_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_dashboard_layouts
    ADD CONSTRAINT user_dashboard_layouts_pkey PRIMARY KEY (id);


--
-- Name: user_dashboard_layouts user_dashboard_layouts_user_page_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_dashboard_layouts
    ADD CONSTRAINT user_dashboard_layouts_user_page_unique UNIQUE (user_id, page_key);


--
-- Name: user user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user_ignored_updates user_ignored_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ignored_updates
    ADD CONSTRAINT user_ignored_updates_pkey PRIMARY KEY (user_id, variant_id);


--
-- Name: user_meal_visibilities user_meal_visibilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_meal_visibilities
    ADD CONSTRAINT user_meal_visibilities_pkey PRIMARY KEY (user_id, meal_type_id);


--
-- Name: user_medication_display_preferences user_medication_display_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_medication_display_preferences
    ADD CONSTRAINT user_medication_display_preferences_pkey PRIMARY KEY (id);


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
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


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
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: water_intake_entries water_intake_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake_entries
    ADD CONSTRAINT water_intake_entries_pkey PRIMARY KEY (id);


--
-- Name: water_intake water_intake_user_date_source_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake
    ADD CONSTRAINT water_intake_user_date_source_unique UNIQUE (user_id, entry_date, source);


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
-- Name: check_in_measurements_user_date_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX check_in_measurements_user_date_unique ON public.check_in_measurements USING btree (user_id, entry_date);


--
-- Name: idx_account_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_account_user_id ON public.account USING btree (user_id);


--
-- Name: idx_ai_service_settings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_service_settings_active ON public.ai_service_settings USING btree (user_id, is_active);


--
-- Name: idx_ai_service_settings_active_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_service_settings_active_public ON public.ai_service_settings USING btree (is_active, is_public) WHERE ((is_active = true) AND (is_public = true));


--
-- Name: idx_ai_service_settings_is_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_service_settings_is_public ON public.ai_service_settings USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_ai_service_settings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_service_settings_user_id ON public.ai_service_settings USING btree (user_id);


--
-- Name: idx_api_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_key ON public.api_key USING btree (key);


--
-- Name: idx_api_key_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_prefix ON public.api_key USING btree (prefix);


--
-- Name: idx_api_key_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_key_user_id ON public.api_key USING btree (reference_id);


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
-- Name: idx_daily_sleep_need_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_daily_sleep_need_lookup ON public.daily_sleep_need USING btree (user_id, target_date DESC);


--
-- Name: idx_day_classification_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_day_classification_user ON public.day_classification_cache USING btree (user_id);


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
-- Name: idx_exercises_user_source_source_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_exercises_user_source_source_id_unique ON public.exercises USING btree (user_id, source, source_id) WHERE ((source IS NOT NULL) AND (source_id IS NOT NULL));


--
-- Name: idx_external_data_providers_is_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_external_data_providers_is_public ON public.external_data_providers USING btree (is_public);


--
-- Name: idx_food_entries_food_entry_meal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_food_entries_food_entry_meal_id ON public.food_entries USING btree (food_entry_meal_id);


--
-- Name: idx_food_entries_user_source_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_food_entries_user_source_source_id ON public.food_entries USING btree (user_id, source, source_id) WHERE ((source IS NOT NULL) AND (source_id IS NOT NULL));


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
-- Name: idx_foods_provider_type_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_foods_provider_type_user_id ON public.foods USING btree (provider_type, user_id) WHERE (provider_type IS NOT NULL);


--
-- Name: idx_injection_entries_injected_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_injection_entries_injected_at ON public.injection_entries USING btree (user_id, injected_at);


--
-- Name: idx_injection_entries_medication_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_injection_entries_medication_id ON public.injection_entries USING btree (medication_id);


--
-- Name: idx_injection_entries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_injection_entries_user_id ON public.injection_entries USING btree (user_id);


--
-- Name: idx_medication_entries_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_entries_entry_date ON public.medication_entries USING btree (user_id, entry_date);


--
-- Name: idx_medication_entries_medication_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_entries_medication_id ON public.medication_entries USING btree (medication_id);


--
-- Name: idx_medication_entries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_entries_user_id ON public.medication_entries USING btree (user_id);


--
-- Name: idx_medication_pens_medication_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_pens_medication_id ON public.medication_pens USING btree (medication_id);


--
-- Name: idx_medication_pens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_pens_user_id ON public.medication_pens USING btree (user_id);


--
-- Name: idx_medication_schedules_medication_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_schedules_medication_id ON public.medication_schedules USING btree (medication_id);


--
-- Name: idx_medication_schedules_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_schedules_user_id ON public.medication_schedules USING btree (user_id);


--
-- Name: idx_medication_titration_steps_medication_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_titration_steps_medication_id ON public.medication_titration_steps USING btree (medication_id);


--
-- Name: idx_medication_titration_steps_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medication_titration_steps_user_id ON public.medication_titration_steps USING btree (user_id);


--
-- Name: idx_medications_is_glp1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medications_is_glp1 ON public.medications USING btree (user_id, is_glp1) WHERE is_glp1;


--
-- Name: idx_medications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medications_user_id ON public.medications USING btree (user_id);


--
-- Name: idx_session_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_token ON public.session USING btree (token);


--
-- Name: idx_session_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_user_id ON public.session USING btree (user_id);


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
-- Name: idx_sleep_need_calc_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sleep_need_calc_user ON public.sleep_need_calculations USING btree (user_id, calculated_at DESC);


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
-- Name: idx_symptom_entries_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_entry_date ON public.symptom_entries USING btree (user_id, entry_date);


--
-- Name: idx_symptom_entries_medication_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_medication_id ON public.symptom_entries USING btree (medication_id);


--
-- Name: idx_symptom_entries_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_symptom_entries_user_id ON public.symptom_entries USING btree (user_id);


--
-- Name: idx_user_custom_symptom_locations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_custom_symptom_locations_user_id ON public.user_custom_symptom_locations USING btree (user_id);


--
-- Name: idx_user_custom_symptoms_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_custom_symptoms_user_id ON public.user_custom_symptoms USING btree (user_id);


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
-- Name: idx_user_medication_display_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_medication_display_preferences_user_id ON public.user_medication_display_preferences USING btree (user_id);


--
-- Name: idx_verification_identifier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_identifier ON public.verification USING btree (identifier);


--
-- Name: idx_water_intake_entries_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_water_intake_entries_user_date ON public.water_intake_entries USING btree (user_id, entry_date);


--
-- Name: idx_workout_preset_exercise_sets_preset_exercise_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_preset_exercise_sets_preset_exercise_id ON public.workout_preset_exercise_sets USING btree (workout_preset_exercise_id);


--
-- Name: one_active_meal_plan_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_active_meal_plan_per_user ON public.meal_plan_templates USING btree (user_id) WHERE (is_active = true);


--
-- Name: sleep_entry_stages_entry_natural_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sleep_entry_stages_entry_natural_key_idx ON public.sleep_entry_stages USING btree (entry_id, start_time, end_time);


--
-- Name: unique_backup_settings_row; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_backup_settings_row ON public.backup_settings USING btree (((id IS NOT NULL)));


--
-- Name: unique_global_provider_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_global_provider_type ON public.external_data_providers USING btree (provider_type) WHERE (is_public = true);


--
-- Name: user ensure_first_user_is_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ensure_first_user_is_admin BEFORE INSERT ON public."user" FOR EACH ROW EXECUTE FUNCTION public.set_first_user_as_admin();


--
-- Name: profiles on_profile_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_profile_created AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.create_user_preferences();


--
-- Name: user on_public_user_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_public_user_created AFTER INSERT ON public."user" FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: TRIGGER on_public_user_created ON "user"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER on_public_user_created ON public."user" IS 'Initializes onboarding status and default external providers for new users created via Better Auth.';


--
-- Name: user seed_global_providers_on_first_admin; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER seed_global_providers_on_first_admin AFTER INSERT OR UPDATE OF role ON public."user" FOR EACH ROW EXECUTE FUNCTION public.seed_global_providers_for_first_admin();


--
-- Name: injection_entries set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.injection_entries FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: medication_entries set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.medication_entries FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: medication_pens set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.medication_pens FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: medication_schedules set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.medication_schedules FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: medication_titration_steps set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.medication_titration_steps FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: medications set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.medications FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: mood_entries set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.mood_entries FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: symptom_entries set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.symptom_entries FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: user_custom_nutrients set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.user_custom_nutrients FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: user_custom_symptom_locations set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.user_custom_symptom_locations FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: user_custom_symptoms set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.user_custom_symptoms FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: user_medication_display_preferences set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.user_medication_display_preferences FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: user_nutrient_display_preferences set_user_nutrient_display_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_user_nutrient_display_preferences_updated_at BEFORE UPDATE ON public.user_nutrient_display_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();


--
-- Name: two_factor trg_sync_mfa_totp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_mfa_totp AFTER INSERT OR DELETE ON public.two_factor FOR EACH ROW EXECUTE FUNCTION public.fn_sync_mfa_totp_flag();


--
-- Name: user trg_sync_user_mfa_global; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_user_mfa_global BEFORE UPDATE OF two_factor_enabled ON public."user" FOR EACH ROW EXECUTE FUNCTION public.fn_sync_user_mfa_global();


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
-- Name: account account_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: admin_activity_logs admin_activity_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: admin_activity_logs admin_activity_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity_logs
    ADD CONSTRAINT admin_activity_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: api_key api_key_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_key
    ADD CONSTRAINT api_key_user_id_fkey FOREIGN KEY (reference_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: check_in_measurements check_in_measurements_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_measurements
    ADD CONSTRAINT check_in_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: check_in_measurements check_in_measurements_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_measurements
    ADD CONSTRAINT check_in_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: check_in_photos check_in_photos_check_in_measurement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_photos
    ADD CONSTRAINT check_in_photos_check_in_measurement_id_fkey FOREIGN KEY (check_in_measurement_id) REFERENCES public.check_in_measurements(id) ON DELETE SET NULL;


--
-- Name: check_in_photos check_in_photos_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.check_in_photos
    ADD CONSTRAINT check_in_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: custom_categories custom_categories_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_categories
    ADD CONSTRAINT custom_categories_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: custom_categories custom_categories_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_categories
    ADD CONSTRAINT custom_categories_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: custom_measurements custom_measurements_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_measurements
    ADD CONSTRAINT custom_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: custom_measurements custom_measurements_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_measurements
    ADD CONSTRAINT custom_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: daily_sleep_need daily_sleep_need_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_sleep_need
    ADD CONSTRAINT daily_sleep_need_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: day_classification_cache day_classification_cache_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.day_classification_cache
    ADD CONSTRAINT day_classification_cache_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: exercise_entries exercise_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: exercise_entries exercise_entries_exercise_preset_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_exercise_preset_entry_id_fkey FOREIGN KEY (exercise_preset_entry_id) REFERENCES public.exercise_preset_entries(id) ON DELETE CASCADE;


--
-- Name: exercise_entries exercise_entries_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: exercise_entries exercise_entries_workout_plan_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entries
    ADD CONSTRAINT exercise_entries_workout_plan_assignment_id_fkey FOREIGN KEY (workout_plan_assignment_id) REFERENCES public.workout_plan_template_assignments(id) ON DELETE SET NULL;


--
-- Name: exercise_entry_activity_details exercise_entry_activity_details_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_activity_details
    ADD CONSTRAINT exercise_entry_activity_details_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT exercise_entry_activity_details_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: exercise_entry_sets exercise_entry_sets_exercise_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_entry_sets
    ADD CONSTRAINT exercise_entry_sets_exercise_entry_id_fkey FOREIGN KEY (exercise_entry_id) REFERENCES public.exercise_entries(id) ON DELETE CASCADE;


--
-- Name: exercise_preset_entries exercise_preset_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_preset_entries
    ADD CONSTRAINT exercise_preset_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: exercise_preset_entries exercise_preset_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_preset_entries
    ADD CONSTRAINT exercise_preset_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: exercise_preset_entries exercise_preset_entries_workout_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_preset_entries
    ADD CONSTRAINT exercise_preset_entries_workout_preset_id_fkey FOREIGN KEY (workout_preset_id) REFERENCES public.workout_presets(id) ON DELETE SET NULL;


--
-- Name: external_data_providers external_data_providers_provider_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_data_providers
    ADD CONSTRAINT external_data_providers_provider_type_fkey FOREIGN KEY (provider_type) REFERENCES public.external_provider_types(id);


--
-- Name: family_access family_access_family_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_access
    ADD CONSTRAINT family_access_family_user_id_fkey FOREIGN KEY (family_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: family_access family_access_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_access
    ADD CONSTRAINT family_access_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: fasting_logs fasting_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fasting_logs
    ADD CONSTRAINT fasting_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_preferences fk_default_barcode_provider; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT fk_default_barcode_provider FOREIGN KEY (default_barcode_provider_id) REFERENCES public.external_data_providers(id) ON DELETE SET NULL;


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
    ADD CONSTRAINT food_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


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
-- Name: food_entries food_entries_meal_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_meal_type_id_fkey FOREIGN KEY (meal_type_id) REFERENCES public.meal_types(id) ON DELETE RESTRICT;


--
-- Name: food_entries food_entries_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: food_entries food_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entries
    ADD CONSTRAINT food_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: food_entry_meals food_entry_meals_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: food_entry_meals food_entry_meals_meal_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_meal_template_id_fkey FOREIGN KEY (meal_template_id) REFERENCES public.meals(id) ON DELETE SET NULL;


--
-- Name: food_entry_meals food_entry_meals_meal_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_meal_type_id_fkey FOREIGN KEY (meal_type_id) REFERENCES public.meal_types(id) ON DELETE RESTRICT;


--
-- Name: food_entry_meals food_entry_meals_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: food_entry_meals food_entry_meals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.food_entry_meals
    ADD CONSTRAINT food_entry_meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: goal_presets goal_presets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goal_presets
    ADD CONSTRAINT goal_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: injection_entries injection_entries_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.injection_entries
    ADD CONSTRAINT injection_entries_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE SET NULL;


--
-- Name: injection_entries injection_entries_pen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.injection_entries
    ADD CONSTRAINT injection_entries_pen_id_fkey FOREIGN KEY (pen_id) REFERENCES public.medication_pens(id) ON DELETE SET NULL;


--
-- Name: injection_entries injection_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.injection_entries
    ADD CONSTRAINT injection_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT meal_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


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
-- Name: meal_plans meal_plans_meal_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_meal_type_id_fkey FOREIGN KEY (meal_type_id) REFERENCES public.meal_types(id) ON DELETE RESTRICT;


--
-- Name: meal_plans meal_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: meal_plans meal_plans_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plans
    ADD CONSTRAINT meal_plans_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.food_variants(id) ON DELETE SET NULL;


--
-- Name: meal_types meal_types_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_types
    ADD CONSTRAINT meal_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: meals meals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meals
    ADD CONSTRAINT meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: medication_entries medication_entries_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_entries
    ADD CONSTRAINT medication_entries_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE SET NULL;


--
-- Name: medication_entries medication_entries_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_entries
    ADD CONSTRAINT medication_entries_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.medication_schedules(id) ON DELETE SET NULL;


--
-- Name: medication_entries medication_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_entries
    ADD CONSTRAINT medication_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: medication_pens medication_pens_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_pens
    ADD CONSTRAINT medication_pens_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE CASCADE;


--
-- Name: medication_pens medication_pens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_pens
    ADD CONSTRAINT medication_pens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: medication_schedules medication_schedules_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_schedules
    ADD CONSTRAINT medication_schedules_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE CASCADE;


--
-- Name: medication_schedules medication_schedules_schedule_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_schedules
    ADD CONSTRAINT medication_schedules_schedule_type_id_fkey FOREIGN KEY (schedule_type_id) REFERENCES public.medication_schedule_types(id);


--
-- Name: medication_schedules medication_schedules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_schedules
    ADD CONSTRAINT medication_schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: medication_titration_steps medication_titration_steps_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_titration_steps
    ADD CONSTRAINT medication_titration_steps_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE CASCADE;


--
-- Name: medication_titration_steps medication_titration_steps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medication_titration_steps
    ADD CONSTRAINT medication_titration_steps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: medications medications_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medications
    ADD CONSTRAINT medications_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.medication_route_types(id);


--
-- Name: medications medications_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medications
    ADD CONSTRAINT medications_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.medication_types(id);


--
-- Name: medications medications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medications
    ADD CONSTRAINT medications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: mood_entries mood_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT mood_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id);


--
-- Name: mood_entries mood_entries_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT mood_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id);


--
-- Name: mood_entries mood_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mood_entries
    ADD CONSTRAINT mood_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: meal_plan_template_assignments mpta_meal_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meal_plan_template_assignments
    ADD CONSTRAINT mpta_meal_type_id_fkey FOREIGN KEY (meal_type_id) REFERENCES public.meal_types(id) ON DELETE RESTRICT;


--
-- Name: onboarding_data onboarding_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_data
    ADD CONSTRAINT onboarding_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: onboarding_status onboarding_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_status
    ADD CONSTRAINT onboarding_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: passkey passkey_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey
    ADD CONSTRAINT passkey_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: session session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: sleep_entries sleep_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entries
    ADD CONSTRAINT sleep_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id);


--
-- Name: sleep_entries sleep_entries_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entries
    ADD CONSTRAINT sleep_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id);


--
-- Name: sleep_entries sleep_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entries
    ADD CONSTRAINT sleep_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: sleep_entry_stages sleep_entry_stages_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entry_stages
    ADD CONSTRAINT sleep_entry_stages_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id);


--
-- Name: sleep_entry_stages sleep_entry_stages_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entry_stages
    ADD CONSTRAINT sleep_entry_stages_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES public.sleep_entries(id) ON DELETE CASCADE;


--
-- Name: sleep_entry_stages sleep_entry_stages_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entry_stages
    ADD CONSTRAINT sleep_entry_stages_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id);


--
-- Name: sleep_entry_stages sleep_entry_stages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_entry_stages
    ADD CONSTRAINT sleep_entry_stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: sleep_need_calculations sleep_need_calculations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sleep_need_calculations
    ADD CONSTRAINT sleep_need_calculations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: symptom_entries symptom_entries_medication_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_medication_id_fkey FOREIGN KEY (medication_id) REFERENCES public.medications(id) ON DELETE SET NULL;


--
-- Name: symptom_entries symptom_entries_symptom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_symptom_id_fkey FOREIGN KEY (symptom_id) REFERENCES public.user_custom_symptoms(id) ON DELETE SET NULL;


--
-- Name: symptom_entries symptom_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symptom_entries
    ADD CONSTRAINT symptom_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: two_factor two_factor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.two_factor
    ADD CONSTRAINT two_factor_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_allergen_preferences user_allergen_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_allergen_preferences
    ADD CONSTRAINT user_allergen_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_custom_nutrients user_custom_nutrients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_nutrients
    ADD CONSTRAINT user_custom_nutrients_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_custom_symptom_locations user_custom_symptom_locations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_symptom_locations
    ADD CONSTRAINT user_custom_symptom_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_custom_symptoms user_custom_symptoms_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_custom_symptoms
    ADD CONSTRAINT user_custom_symptoms_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_dashboard_layouts user_dashboard_layouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_dashboard_layouts
    ADD CONSTRAINT user_dashboard_layouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_ignored_updates user_ignored_updates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ignored_updates
    ADD CONSTRAINT user_ignored_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_meal_visibilities user_meal_visibilities_meal_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_meal_visibilities
    ADD CONSTRAINT user_meal_visibilities_meal_type_id_fkey FOREIGN KEY (meal_type_id) REFERENCES public.meal_types(id) ON DELETE CASCADE;


--
-- Name: user_meal_visibilities user_meal_visibilities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_meal_visibilities
    ADD CONSTRAINT user_meal_visibilities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_medication_display_preferences user_medication_display_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_medication_display_preferences
    ADD CONSTRAINT user_medication_display_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_nutrient_display_preferences user_nutrient_display_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_nutrient_display_preferences
    ADD CONSTRAINT user_nutrient_display_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_oidc_links user_oidc_links_oidc_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oidc_links
    ADD CONSTRAINT user_oidc_links_oidc_provider_id_fkey FOREIGN KEY (oidc_provider_id) REFERENCES public.oidc_providers(id) ON DELETE CASCADE;


--
-- Name: user_oidc_links user_oidc_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_oidc_links
    ADD CONSTRAINT user_oidc_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_active_ai_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_active_ai_service_id_fkey FOREIGN KEY (active_ai_service_id) REFERENCES public.ai_service_settings(id) ON DELETE SET NULL;


--
-- Name: user_water_containers user_water_containers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_water_containers
    ADD CONSTRAINT user_water_containers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: water_intake water_intake_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake
    ADD CONSTRAINT water_intake_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: water_intake_entries water_intake_entries_container_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake_entries
    ADD CONSTRAINT water_intake_entries_container_id_fkey FOREIGN KEY (container_id) REFERENCES public.user_water_containers(id) ON DELETE SET NULL;


--
-- Name: water_intake_entries water_intake_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake_entries
    ADD CONSTRAINT water_intake_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public."user"(id);


--
-- Name: water_intake_entries water_intake_entries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake_entries
    ADD CONSTRAINT water_intake_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: water_intake water_intake_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.water_intake
    ADD CONSTRAINT water_intake_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public."user"(id) ON DELETE SET NULL;


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
    ADD CONSTRAINT weekly_goal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT workout_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT workout_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: admin_activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_activity_logs admin_only_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only_insert ON public.admin_activity_logs FOR INSERT WITH CHECK (((admin_user_id = public.current_user_id()) AND public.is_admin()));


--
-- Name: admin_activity_logs admin_only_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only_select ON public.admin_activity_logs FOR SELECT USING (((admin_user_id = public.current_user_id()) OR public.is_admin()));


--
-- Name: ai_service_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_service_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_service_settings ai_service_settings_delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_service_settings_delete_policy ON public.ai_service_settings FOR DELETE USING ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin())));


--
-- Name: ai_service_settings ai_service_settings_insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_service_settings_insert_policy ON public.ai_service_settings FOR INSERT WITH CHECK ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin())));


--
-- Name: ai_service_settings ai_service_settings_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_service_settings_select_policy ON public.ai_service_settings FOR SELECT USING ((((is_public = true) AND (public.authenticated_user_id() IS NOT NULL)) OR ((is_public = false) AND (user_id = public.current_user_id()))));


--
-- Name: ai_service_settings ai_service_settings_update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_service_settings_update_policy ON public.ai_service_settings FOR UPDATE USING ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin()))) WITH CHECK ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin())));


--
-- Name: api_key; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_key ENABLE ROW LEVEL SECURITY;

--
-- Name: check_in_measurements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.check_in_measurements ENABLE ROW LEVEL SECURITY;

--
-- Name: check_in_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.check_in_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_measurements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_measurements ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_sleep_need; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_sleep_need ENABLE ROW LEVEL SECURITY;

--
-- Name: day_classification_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.day_classification_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: external_data_providers delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_policy ON public.external_data_providers FOR DELETE USING ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin())));


--
-- Name: food_entries delete_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY delete_policy ON public.food_entries FOR DELETE USING (public.has_diary_access(user_id));


--
-- Name: exercise_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_entry_activity_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_entry_activity_details ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_entry_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_entry_sets ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_preset_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_preset_entries ENABLE ROW LEVEL SECURITY;

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
-- Name: injection_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.injection_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: external_data_providers insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_policy ON public.external_data_providers FOR INSERT WITH CHECK ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin())));


--
-- Name: family_access insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_policy ON public.family_access FOR INSERT WITH CHECK ((public.current_user_id() = owner_user_id));


--
-- Name: food_entries insert_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY insert_policy ON public.food_entries FOR INSERT WITH CHECK ((public.has_diary_access(user_id) AND (((food_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.foods f
  WHERE (f.id = food_entries.food_id)))) OR ((meal_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.meals m
  WHERE (m.id = food_entries.meal_id)))))));


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
-- Name: meal_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meal_types ENABLE ROW LEVEL SECURITY;

--
-- Name: meals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meals ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_pens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_pens ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: medication_titration_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medication_titration_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: medications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

--
-- Name: check_in_measurements modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.check_in_measurements USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: check_in_photos modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.check_in_photos USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


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
-- Name: exercise_entry_activity_details modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.exercise_entry_activity_details USING ((((exercise_entry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.exercise_entries ee
  WHERE ((ee.id = exercise_entry_activity_details.exercise_entry_id) AND (public.current_user_id() = ee.user_id))))) OR ((exercise_preset_entry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.exercise_preset_entries epe
  WHERE ((epe.id = exercise_entry_activity_details.exercise_preset_entry_id) AND (public.current_user_id() = epe.user_id))))))) WITH CHECK ((((exercise_entry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.exercise_entries ee
  WHERE ((ee.id = exercise_entry_activity_details.exercise_entry_id) AND (public.current_user_id() = ee.user_id))))) OR ((exercise_preset_entry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.exercise_preset_entries epe
  WHERE ((epe.id = exercise_entry_activity_details.exercise_preset_entry_id) AND (public.current_user_id() = epe.user_id)))))));


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
-- Name: family_access modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.family_access USING ((public.current_user_id() = owner_user_id)) WITH CHECK ((public.current_user_id() = owner_user_id));


--
-- Name: food_entry_meals modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.food_entry_meals USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: food_variants modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.food_variants USING ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_variants.food_id) AND public.has_diary_access(f.user_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_variants.food_id) AND public.has_diary_access(f.user_id)))));


--
-- Name: foods modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.foods USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: injection_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.injection_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


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
-- Name: meal_types modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.meal_types USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: meals modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.meals USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: medication_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.medication_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: medication_pens modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.medication_pens USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: medication_schedules modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.medication_schedules USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: medication_titration_steps modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.medication_titration_steps USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: medications modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.medications USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: sleep_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.sleep_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: sleep_entry_stages modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.sleep_entry_stages USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: symptom_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.symptom_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: user_custom_symptom_locations modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.user_custom_symptom_locations USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: user_custom_symptoms modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.user_custom_symptoms USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: water_intake modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.water_intake USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: water_intake_entries modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.water_intake_entries USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: workout_plan_templates modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.workout_plan_templates USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: workout_preset_exercise_sets modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.workout_preset_exercise_sets USING ((EXISTS ( SELECT 1
   FROM (public.workout_preset_exercises wpe
     JOIN public.workout_presets wp ON ((wp.id = wpe.workout_preset_id)))
  WHERE ((wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id) AND (public.current_user_id() = wp.user_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workout_preset_exercises wpe
     JOIN public.workout_presets wp ON ((wp.id = wpe.workout_preset_id)))
  WHERE ((wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id) AND (public.current_user_id() = wp.user_id)))));


--
-- Name: workout_preset_exercises modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.workout_preset_exercises USING ((EXISTS ( SELECT 1
   FROM public.workout_presets wp
  WHERE ((wp.id = workout_preset_exercises.workout_preset_id) AND (public.current_user_id() = wp.user_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workout_presets wp
  WHERE ((wp.id = workout_preset_exercises.workout_preset_id) AND (public.current_user_id() = wp.user_id)))));


--
-- Name: workout_presets modify_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY modify_policy ON public.workout_presets USING ((public.current_user_id() = user_id)) WITH CHECK ((public.current_user_id() = user_id));


--
-- Name: mood_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_data ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_status ENABLE ROW LEVEL SECURITY;

--
-- Name: api_key owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.api_key USING ((reference_id = public.current_user_id())) WITH CHECK ((reference_id = public.current_user_id()));


--
-- Name: daily_sleep_need owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.daily_sleep_need USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: day_classification_cache owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.day_classification_cache USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


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
-- Name: onboarding_data owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.onboarding_data USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: onboarding_status owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.onboarding_status USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: profiles owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.profiles USING ((id = public.current_user_id())) WITH CHECK ((id = public.current_user_id()));


--
-- Name: sleep_need_calculations owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.sleep_need_calculations USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: sparky_chat_history owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.sparky_chat_history USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_allergen_preferences owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_allergen_preferences USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_custom_nutrients owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_custom_nutrients USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_dashboard_layouts owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_dashboard_layouts USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_goals owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_goals USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_ignored_updates owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_ignored_updates USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_meal_visibilities owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_meal_visibilities USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


--
-- Name: user_medication_display_preferences owner_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_policy ON public.user_medication_display_preferences USING ((user_id = public.current_user_id())) WITH CHECK ((user_id = public.current_user_id()));


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
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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
-- Name: check_in_photos select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.check_in_photos FOR SELECT USING (public.has_diary_access(user_id));


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
-- Name: exercise_entry_activity_details select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.exercise_entry_activity_details FOR SELECT USING ((((exercise_entry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.exercise_entries ee
  WHERE ((ee.id = exercise_entry_activity_details.exercise_entry_id) AND public.has_diary_access(ee.user_id))))) OR ((exercise_preset_entry_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.exercise_preset_entries epe
  WHERE ((epe.id = exercise_entry_activity_details.exercise_preset_entry_id) AND public.has_diary_access(epe.user_id)))))));


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

CREATE POLICY select_policy ON public.external_data_providers FOR SELECT USING ((((is_public = true) AND (is_active = true) AND (public.authenticated_user_id() IS NOT NULL)) OR ((is_public = false) AND (public.current_user_id() = user_id)) OR ((is_public = false) AND (is_active = true) AND public.has_family_access(user_id, 'share_external_providers'::text) AND (EXISTS ( SELECT 1
   FROM public.external_provider_types ept
  WHERE (((ept.id)::text = external_data_providers.provider_type) AND (ept.is_strictly_private = false)))))));


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
-- Name: food_variants select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.food_variants FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.foods f
  WHERE ((f.id = food_variants.food_id) AND public.has_library_access_with_public(f.user_id, f.shared_with_public, ARRAY['can_view_food_library'::text, 'can_manage_diary'::text])))));


--
-- Name: foods select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.foods FOR SELECT USING (public.has_library_access_with_public(user_id, shared_with_public, ARRAY['can_view_food_library'::text, 'can_manage_diary'::text]));


--
-- Name: injection_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.injection_entries FOR SELECT USING (public.has_diary_access(user_id));


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
-- Name: meal_types select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.meal_types FOR SELECT USING (((user_id IS NULL) OR public.has_diary_access(user_id)));


--
-- Name: meals select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.meals FOR SELECT USING (public.has_library_access_with_public(user_id, is_public, ARRAY['can_view_food_library'::text, 'can_manage_diary'::text]));


--
-- Name: medication_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.medication_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: medication_pens select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.medication_pens FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: medication_schedules select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.medication_schedules FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: medication_titration_steps select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.medication_titration_steps FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: medications select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.medications FOR SELECT USING (public.has_library_access_with_public(user_id, false, ARRAY['can_manage_diary'::text]));


--
-- Name: sleep_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.sleep_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: sleep_entry_stages select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.sleep_entry_stages FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: symptom_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.symptom_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: user_custom_symptom_locations select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.user_custom_symptom_locations FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: user_custom_symptoms select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.user_custom_symptoms FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: water_intake select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.water_intake FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: water_intake_entries select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.water_intake_entries FOR SELECT USING (public.has_diary_access(user_id));


--
-- Name: workout_plan_templates select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.workout_plan_templates FOR SELECT USING (public.has_library_access_with_public(user_id, false, ARRAY['can_view_exercise_library'::text]));


--
-- Name: workout_preset_exercise_sets select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.workout_preset_exercise_sets FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.workout_preset_exercises wpe
  WHERE (wpe.id = workout_preset_exercise_sets.workout_preset_exercise_id))));


--
-- Name: workout_preset_exercises select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.workout_preset_exercises FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.workout_presets wp
  WHERE (wp.id = workout_preset_exercises.workout_preset_id))));


--
-- Name: workout_presets select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY select_policy ON public.workout_presets FOR SELECT USING (public.has_library_access_with_public(user_id, is_public, ARRAY['can_view_exercise_library'::text]));


--
-- Name: sleep_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sleep_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: sleep_entry_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sleep_entry_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: sleep_need_calculations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sleep_need_calculations ENABLE ROW LEVEL SECURITY;

--
-- Name: sparky_chat_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sparky_chat_history ENABLE ROW LEVEL SECURITY;

--
-- Name: symptom_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.symptom_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: external_data_providers update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_policy ON public.external_data_providers FOR UPDATE USING ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin()))) WITH CHECK ((((is_public = false) AND (user_id = public.current_user_id())) OR ((is_public = true) AND public.is_admin())));


--
-- Name: food_entries update_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY update_policy ON public.food_entries FOR UPDATE USING (public.has_diary_access(user_id)) WITH CHECK (public.has_diary_access(user_id));


--
-- Name: user_allergen_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_allergen_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: user_custom_nutrients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_custom_nutrients ENABLE ROW LEVEL SECURITY;

--
-- Name: user_custom_symptom_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_custom_symptom_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: user_custom_symptoms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_custom_symptoms ENABLE ROW LEVEL SECURITY;

--
-- Name: user_dashboard_layouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ignored_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ignored_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: user_meal_visibilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_meal_visibilities ENABLE ROW LEVEL SECURITY;

--
-- Name: user_medication_display_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_medication_display_preferences ENABLE ROW LEVEL SECURITY;

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
-- Name: water_intake_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.water_intake_entries ENABLE ROW LEVEL SECURITY;

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

GRANT USAGE ON SCHEMA auth TO sparky_uat;
GRANT USAGE ON SCHEMA auth TO "sparky-uat";
GRANT USAGE ON SCHEMA auth TO "sparky uat";


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO sparky_uat;
GRANT USAGE ON SCHEMA public TO "sparky-uat";
GRANT USAGE ON SCHEMA public TO "sparky uat";


--
-- Name: SCHEMA system; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA system TO sparky_uat;
GRANT USAGE ON SCHEMA system TO "sparky-uat";
GRANT USAGE ON SCHEMA system TO "sparky uat";


--
-- Name: FUNCTION authenticated_user_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.authenticated_user_id() TO sparky_uat;
GRANT ALL ON FUNCTION public.authenticated_user_id() TO "sparky-uat";
GRANT ALL ON FUNCTION public.authenticated_user_id() TO "sparky uat";


--
-- Name: FUNCTION calculate_mid_sleep(sleep_start_ts bigint, sleep_end_ts bigint); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.calculate_mid_sleep(sleep_start_ts bigint, sleep_end_ts bigint) TO sparky_uat;
GRANT ALL ON FUNCTION public.calculate_mid_sleep(sleep_start_ts bigint, sleep_end_ts bigint) TO "sparky-uat";
GRANT ALL ON FUNCTION public.calculate_mid_sleep(sleep_start_ts bigint, sleep_end_ts bigint) TO "sparky uat";


--
-- Name: FUNCTION can_access_user_data(target_user_id uuid, permission_type text, auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_access_user_data(target_user_id uuid, permission_type text, auth_user_id uuid) TO "sparky uat";
GRANT ALL ON FUNCTION public.can_access_user_data(target_user_id uuid, permission_type text, auth_user_id uuid) TO "sparky-uat";
GRANT ALL ON FUNCTION public.can_access_user_data(target_user_id uuid, permission_type text, auth_user_id uuid) TO sparky_uat;


--
-- Name: FUNCTION check_family_access(p_family_user_id uuid, p_owner_user_id uuid, p_permission text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_family_access(p_family_user_id uuid, p_owner_user_id uuid, p_permission text) TO sparky_uat;
GRANT ALL ON FUNCTION public.check_family_access(p_family_user_id uuid, p_owner_user_id uuid, p_permission text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.check_family_access(p_family_user_id uuid, p_owner_user_id uuid, p_permission text) TO "sparky uat";


--
-- Name: FUNCTION clear_old_chat_history(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.clear_old_chat_history() TO sparky_uat;
GRANT ALL ON FUNCTION public.clear_old_chat_history() TO "sparky-uat";
GRANT ALL ON FUNCTION public.clear_old_chat_history() TO "sparky uat";


--
-- Name: FUNCTION create_default_external_data_providers(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_default_external_data_providers(p_user_id uuid) TO sparky_uat;
GRANT ALL ON FUNCTION public.create_default_external_data_providers(p_user_id uuid) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_default_external_data_providers(p_user_id uuid) TO "sparky uat";


--
-- Name: FUNCTION create_diary_policy(table_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_diary_policy(table_name text) TO sparky_uat;
GRANT ALL ON FUNCTION public.create_diary_policy(table_name text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_diary_policy(table_name text) TO "sparky uat";


--
-- Name: FUNCTION create_global_default_providers(p_admin_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_global_default_providers(p_admin_user_id uuid) TO "sparky uat";
GRANT ALL ON FUNCTION public.create_global_default_providers(p_admin_user_id uuid) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_global_default_providers(p_admin_user_id uuid) TO sparky_uat;


--
-- Name: FUNCTION create_library_policy(table_name text, shared_column text, permissions text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_library_policy(table_name text, shared_column text, permissions text[]) TO sparky_uat;
GRANT ALL ON FUNCTION public.create_library_policy(table_name text, shared_column text, permissions text[]) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_library_policy(table_name text, shared_column text, permissions text[]) TO "sparky uat";


--
-- Name: FUNCTION create_owner_centric_all_policy(table_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_owner_centric_all_policy(table_name text) TO sparky_uat;
GRANT ALL ON FUNCTION public.create_owner_centric_all_policy(table_name text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_owner_centric_all_policy(table_name text) TO "sparky uat";


--
-- Name: FUNCTION create_owner_centric_id_policy(table_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_owner_centric_id_policy(table_name text) TO sparky_uat;
GRANT ALL ON FUNCTION public.create_owner_centric_id_policy(table_name text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_owner_centric_id_policy(table_name text) TO "sparky uat";


--
-- Name: FUNCTION create_owner_policy(table_name text, id_column text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_owner_policy(table_name text, id_column text) TO sparky_uat;
GRANT ALL ON FUNCTION public.create_owner_policy(table_name text, id_column text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_owner_policy(table_name text, id_column text) TO "sparky uat";


--
-- Name: FUNCTION create_user_centric_policy(table_name text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_user_centric_policy(table_name text) TO sparky_uat;
GRANT ALL ON FUNCTION public.create_user_centric_policy(table_name text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_user_centric_policy(table_name text) TO "sparky uat";


--
-- Name: FUNCTION create_user_preferences(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.create_user_preferences() TO sparky_uat;
GRANT ALL ON FUNCTION public.create_user_preferences() TO "sparky-uat";
GRANT ALL ON FUNCTION public.create_user_preferences() TO "sparky uat";


--
-- Name: FUNCTION current_user_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_user_id() TO sparky_uat;
GRANT ALL ON FUNCTION public.current_user_id() TO "sparky-uat";
GRANT ALL ON FUNCTION public.current_user_id() TO "sparky uat";


--
-- Name: FUNCTION find_user_by_email(p_email text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.find_user_by_email(p_email text) TO sparky_uat;
GRANT ALL ON FUNCTION public.find_user_by_email(p_email text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.find_user_by_email(p_email text) TO "sparky uat";


--
-- Name: FUNCTION fn_sync_mfa_totp_flag(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_sync_mfa_totp_flag() TO "sparky uat";
GRANT ALL ON FUNCTION public.fn_sync_mfa_totp_flag() TO "sparky-uat";
GRANT ALL ON FUNCTION public.fn_sync_mfa_totp_flag() TO sparky_uat;


--
-- Name: FUNCTION fn_sync_user_mfa_global(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_sync_user_mfa_global() TO "sparky uat";
GRANT ALL ON FUNCTION public.fn_sync_user_mfa_global() TO "sparky-uat";
GRANT ALL ON FUNCTION public.fn_sync_user_mfa_global() TO sparky_uat;


--
-- Name: FUNCTION get_accessible_users(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_accessible_users(p_user_id uuid) TO sparky_uat;
GRANT ALL ON FUNCTION public.get_accessible_users(p_user_id uuid) TO "sparky-uat";
GRANT ALL ON FUNCTION public.get_accessible_users(p_user_id uuid) TO "sparky uat";


--
-- Name: FUNCTION get_goals_for_date(p_user_id uuid, p_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_goals_for_date(p_user_id uuid, p_date date) TO sparky_uat;
GRANT ALL ON FUNCTION public.get_goals_for_date(p_user_id uuid, p_date date) TO "sparky-uat";
GRANT ALL ON FUNCTION public.get_goals_for_date(p_user_id uuid, p_date date) TO "sparky uat";


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO sparky_uat;
GRANT ALL ON FUNCTION public.handle_new_user() TO "sparky-uat";
GRANT ALL ON FUNCTION public.handle_new_user() TO "sparky uat";


--
-- Name: FUNCTION has_diary_access(owner_uuid uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_diary_access(owner_uuid uuid) TO sparky_uat;
GRANT ALL ON FUNCTION public.has_diary_access(owner_uuid uuid) TO "sparky-uat";
GRANT ALL ON FUNCTION public.has_diary_access(owner_uuid uuid) TO "sparky uat";


--
-- Name: FUNCTION has_family_access(owner_uuid uuid, perm text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_family_access(owner_uuid uuid, perm text) TO sparky_uat;
GRANT ALL ON FUNCTION public.has_family_access(owner_uuid uuid, perm text) TO "sparky-uat";
GRANT ALL ON FUNCTION public.has_family_access(owner_uuid uuid, perm text) TO "sparky uat";


--
-- Name: FUNCTION has_family_access_or(owner_uuid uuid, perms text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_family_access_or(owner_uuid uuid, perms text[]) TO sparky_uat;
GRANT ALL ON FUNCTION public.has_family_access_or(owner_uuid uuid, perms text[]) TO "sparky-uat";
GRANT ALL ON FUNCTION public.has_family_access_or(owner_uuid uuid, perms text[]) TO "sparky uat";


--
-- Name: FUNCTION has_library_access_with_public(owner_uuid uuid, is_shared boolean, perms text[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_library_access_with_public(owner_uuid uuid, is_shared boolean, perms text[]) TO sparky_uat;
GRANT ALL ON FUNCTION public.has_library_access_with_public(owner_uuid uuid, is_shared boolean, perms text[]) TO "sparky-uat";
GRANT ALL ON FUNCTION public.has_library_access_with_public(owner_uuid uuid, is_shared boolean, perms text[]) TO "sparky uat";


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO sparky_uat;
GRANT ALL ON FUNCTION public.is_admin() TO "sparky-uat";
GRANT ALL ON FUNCTION public.is_admin() TO "sparky uat";


--
-- Name: FUNCTION manage_goal_timeline(p_user_id uuid, p_start_date date, p_calories numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_water_goal integer, p_saturated_fat numeric, p_polyunsaturated_fat numeric, p_monounsaturated_fat numeric, p_trans_fat numeric, p_cholesterol numeric, p_sodium numeric, p_potassium numeric, p_dietary_fiber numeric, p_sugars numeric, p_vitamin_a numeric, p_vitamin_c numeric, p_calcium numeric, p_iron numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.manage_goal_timeline(p_user_id uuid, p_start_date date, p_calories numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_water_goal integer, p_saturated_fat numeric, p_polyunsaturated_fat numeric, p_monounsaturated_fat numeric, p_trans_fat numeric, p_cholesterol numeric, p_sodium numeric, p_potassium numeric, p_dietary_fiber numeric, p_sugars numeric, p_vitamin_a numeric, p_vitamin_c numeric, p_calcium numeric, p_iron numeric) TO sparky_uat;
GRANT ALL ON FUNCTION public.manage_goal_timeline(p_user_id uuid, p_start_date date, p_calories numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_water_goal integer, p_saturated_fat numeric, p_polyunsaturated_fat numeric, p_monounsaturated_fat numeric, p_trans_fat numeric, p_cholesterol numeric, p_sodium numeric, p_potassium numeric, p_dietary_fiber numeric, p_sugars numeric, p_vitamin_a numeric, p_vitamin_c numeric, p_calcium numeric, p_iron numeric) TO "sparky-uat";
GRANT ALL ON FUNCTION public.manage_goal_timeline(p_user_id uuid, p_start_date date, p_calories numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_water_goal integer, p_saturated_fat numeric, p_polyunsaturated_fat numeric, p_monounsaturated_fat numeric, p_trans_fat numeric, p_cholesterol numeric, p_sodium numeric, p_potassium numeric, p_dietary_fiber numeric, p_sugars numeric, p_vitamin_a numeric, p_vitamin_c numeric, p_calcium numeric, p_iron numeric) TO "sparky uat";


--
-- Name: FUNCTION seed_global_providers_for_first_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.seed_global_providers_for_first_admin() TO "sparky uat";
GRANT ALL ON FUNCTION public.seed_global_providers_for_first_admin() TO "sparky-uat";
GRANT ALL ON FUNCTION public.seed_global_providers_for_first_admin() TO sparky_uat;


--
-- Name: FUNCTION set_app_context(p_user_id uuid, p_authenticated_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_app_context(p_user_id uuid, p_authenticated_user_id uuid) TO sparky_uat;
GRANT ALL ON FUNCTION public.set_app_context(p_user_id uuid, p_authenticated_user_id uuid) TO "sparky-uat";
GRANT ALL ON FUNCTION public.set_app_context(p_user_id uuid, p_authenticated_user_id uuid) TO "sparky uat";


--
-- Name: FUNCTION set_first_user_as_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_first_user_as_admin() TO sparky_uat;
GRANT ALL ON FUNCTION public.set_first_user_as_admin() TO "sparky-uat";
GRANT ALL ON FUNCTION public.set_first_user_as_admin() TO "sparky uat";


--
-- Name: FUNCTION set_updated_at_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at_timestamp() TO sparky_uat;
GRANT ALL ON FUNCTION public.set_updated_at_timestamp() TO "sparky-uat";
GRANT ALL ON FUNCTION public.set_updated_at_timestamp() TO "sparky uat";


--
-- Name: FUNCTION set_user_id(user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_user_id(user_id uuid) TO sparky_uat;
GRANT ALL ON FUNCTION public.set_user_id(user_id uuid) TO "sparky-uat";
GRANT ALL ON FUNCTION public.set_user_id(user_id uuid) TO "sparky uat";


--
-- Name: FUNCTION trigger_set_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.trigger_set_timestamp() TO sparky_uat;
GRANT ALL ON FUNCTION public.trigger_set_timestamp() TO "sparky-uat";
GRANT ALL ON FUNCTION public.trigger_set_timestamp() TO "sparky uat";


--
-- Name: FUNCTION update_external_data_providers_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_external_data_providers_updated_at() TO sparky_uat;
GRANT ALL ON FUNCTION public.update_external_data_providers_updated_at() TO "sparky-uat";
GRANT ALL ON FUNCTION public.update_external_data_providers_updated_at() TO "sparky uat";


--
-- Name: FUNCTION update_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_timestamp() TO sparky_uat;
GRANT ALL ON FUNCTION public.update_timestamp() TO "sparky-uat";
GRANT ALL ON FUNCTION public.update_timestamp() TO "sparky uat";


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO sparky_uat;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO "sparky-uat";
GRANT ALL ON FUNCTION public.update_updated_at_column() TO "sparky uat";


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.users TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.users TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE auth.users TO "sparky uat";


--
-- Name: TABLE account; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.account TO "sparky uat";


--
-- Name: TABLE admin_activity_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.admin_activity_logs TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.admin_activity_logs TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.admin_activity_logs TO "sparky uat";


--
-- Name: TABLE ai_service_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_service_settings TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_service_settings TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.ai_service_settings TO "sparky uat";


--
-- Name: TABLE api_key; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.api_key TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.api_key TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.api_key TO "sparky uat";


--
-- Name: TABLE backup_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.backup_settings TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.backup_settings TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.backup_settings TO "sparky uat";


--
-- Name: SEQUENCE backup_settings_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.backup_settings_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.backup_settings_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.backup_settings_id_seq TO "sparky uat";


--
-- Name: TABLE check_in_measurements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_measurements TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_measurements TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_measurements TO "sparky uat";


--
-- Name: TABLE check_in_photos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_photos TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_photos TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.check_in_photos TO sparky_uat;


--
-- Name: TABLE custom_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_categories TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_categories TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_categories TO "sparky uat";


--
-- Name: TABLE custom_measurements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_measurements TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_measurements TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.custom_measurements TO "sparky uat";


--
-- Name: TABLE daily_sleep_need; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.daily_sleep_need TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.daily_sleep_need TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.daily_sleep_need TO "sparky uat";


--
-- Name: TABLE day_classification_cache; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.day_classification_cache TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.day_classification_cache TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.day_classification_cache TO "sparky uat";


--
-- Name: TABLE exercise_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entries TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entries TO "sparky uat";


--
-- Name: TABLE exercise_entry_activity_details; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_activity_details TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_activity_details TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_activity_details TO "sparky uat";


--
-- Name: TABLE exercise_entry_sets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_sets TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_sets TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_entry_sets TO "sparky uat";


--
-- Name: SEQUENCE exercise_entry_sets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.exercise_entry_sets_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.exercise_entry_sets_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.exercise_entry_sets_id_seq TO "sparky uat";


--
-- Name: TABLE exercise_preset_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_preset_entries TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_preset_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercise_preset_entries TO "sparky uat";


--
-- Name: TABLE exercises; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercises TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercises TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.exercises TO "sparky uat";


--
-- Name: TABLE external_data_providers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_data_providers TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_data_providers TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_data_providers TO "sparky uat";


--
-- Name: TABLE external_provider_types; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_provider_types TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_provider_types TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.external_provider_types TO "sparky uat";


--
-- Name: TABLE family_access; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.family_access TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.family_access TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.family_access TO "sparky uat";


--
-- Name: TABLE fasting_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fasting_logs TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fasting_logs TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.fasting_logs TO "sparky uat";


--
-- Name: TABLE food_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entries TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entries TO "sparky uat";


--
-- Name: TABLE food_entry_meals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entry_meals TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entry_meals TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_entry_meals TO "sparky uat";


--
-- Name: TABLE food_variants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_variants TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_variants TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.food_variants TO "sparky uat";


--
-- Name: TABLE foods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.foods TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.foods TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.foods TO "sparky uat";


--
-- Name: TABLE global_settings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.global_settings TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.global_settings TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.global_settings TO "sparky uat";


--
-- Name: TABLE goal_presets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_presets TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_presets TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.goal_presets TO "sparky uat";


--
-- Name: TABLE injection_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.injection_entries TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.injection_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.injection_entries TO sparky_uat;


--
-- Name: TABLE meal_foods; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_foods TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_foods TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_foods TO "sparky uat";


--
-- Name: TABLE meal_plan_template_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_template_assignments TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_template_assignments TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_template_assignments TO "sparky uat";


--
-- Name: TABLE meal_plan_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_templates TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_templates TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plan_templates TO "sparky uat";


--
-- Name: TABLE meal_plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plans TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plans TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_plans TO "sparky uat";


--
-- Name: TABLE meal_types; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_types TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_types TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meal_types TO "sparky uat";


--
-- Name: TABLE meals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meals TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meals TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.meals TO "sparky uat";


--
-- Name: TABLE medication_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_entries TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_entries TO sparky_uat;


--
-- Name: TABLE medication_pens; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_pens TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_pens TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_pens TO sparky_uat;


--
-- Name: TABLE medication_route_types; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_route_types TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_route_types TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_route_types TO sparky_uat;


--
-- Name: TABLE medication_schedule_types; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_schedule_types TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_schedule_types TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_schedule_types TO sparky_uat;


--
-- Name: TABLE medication_schedules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_schedules TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_schedules TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_schedules TO sparky_uat;


--
-- Name: TABLE medication_titration_steps; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_titration_steps TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_titration_steps TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_titration_steps TO sparky_uat;


--
-- Name: TABLE medication_types; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_types TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_types TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medication_types TO sparky_uat;


--
-- Name: TABLE medications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medications TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medications TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.medications TO sparky_uat;


--
-- Name: TABLE mood_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mood_entries TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mood_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mood_entries TO "sparky uat";


--
-- Name: TABLE oidc_providers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oidc_providers TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oidc_providers TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.oidc_providers TO "sparky uat";


--
-- Name: SEQUENCE oidc_providers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.oidc_providers_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.oidc_providers_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.oidc_providers_id_seq TO "sparky uat";


--
-- Name: TABLE onboarding_data; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_data TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_data TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_data TO "sparky uat";


--
-- Name: TABLE onboarding_status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_status TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_status TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.onboarding_status TO "sparky uat";


--
-- Name: TABLE passkey; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.passkey TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.passkey TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.passkey TO "sparky uat";


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.profiles TO "sparky uat";


--
-- Name: TABLE session; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.session TO "sparky uat";


--
-- Name: TABLE sleep_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entries TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entries TO "sparky uat";


--
-- Name: TABLE sleep_entry_stages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entry_stages TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entry_stages TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_entry_stages TO "sparky uat";


--
-- Name: TABLE sleep_need_calculations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_need_calculations TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_need_calculations TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sleep_need_calculations TO "sparky uat";


--
-- Name: TABLE sparky_chat_history; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sparky_chat_history TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sparky_chat_history TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sparky_chat_history TO "sparky uat";


--
-- Name: TABLE sso_provider; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sso_provider TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sso_provider TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.sso_provider TO "sparky uat";


--
-- Name: TABLE symptom_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.symptom_entries TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.symptom_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.symptom_entries TO sparky_uat;


--
-- Name: TABLE two_factor; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.two_factor TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.two_factor TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.two_factor TO "sparky uat";


--
-- Name: TABLE "user"; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."user" TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."user" TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public."user" TO "sparky uat";


--
-- Name: TABLE user_allergen_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_allergen_preferences TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_allergen_preferences TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_allergen_preferences TO sparky_uat;


--
-- Name: TABLE user_custom_nutrients; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_nutrients TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_nutrients TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_nutrients TO "sparky uat";


--
-- Name: TABLE user_custom_symptom_locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_symptom_locations TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_symptom_locations TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_symptom_locations TO sparky_uat;


--
-- Name: TABLE user_custom_symptoms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_symptoms TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_symptoms TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_custom_symptoms TO sparky_uat;


--
-- Name: TABLE user_dashboard_layouts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_dashboard_layouts TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_dashboard_layouts TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_dashboard_layouts TO sparky_uat;


--
-- Name: TABLE user_goals; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_goals TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_goals TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_goals TO "sparky uat";


--
-- Name: TABLE user_ignored_updates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_ignored_updates TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_ignored_updates TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_ignored_updates TO "sparky uat";


--
-- Name: TABLE user_meal_visibilities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_meal_visibilities TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_meal_visibilities TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_meal_visibilities TO "sparky uat";


--
-- Name: TABLE user_medication_display_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_medication_display_preferences TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_medication_display_preferences TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_medication_display_preferences TO sparky_uat;


--
-- Name: TABLE user_nutrient_display_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_nutrient_display_preferences TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_nutrient_display_preferences TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_nutrient_display_preferences TO "sparky uat";


--
-- Name: SEQUENCE user_nutrient_display_preferences_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_nutrient_display_preferences_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.user_nutrient_display_preferences_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.user_nutrient_display_preferences_id_seq TO "sparky uat";


--
-- Name: TABLE user_oidc_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_oidc_links TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_oidc_links TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_oidc_links TO "sparky uat";


--
-- Name: SEQUENCE user_oidc_links_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_oidc_links_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.user_oidc_links_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.user_oidc_links_id_seq TO "sparky uat";


--
-- Name: TABLE user_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_preferences TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_preferences TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_preferences TO "sparky uat";


--
-- Name: TABLE user_water_containers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_water_containers TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_water_containers TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.user_water_containers TO "sparky uat";


--
-- Name: SEQUENCE user_water_containers_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.user_water_containers_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.user_water_containers_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.user_water_containers_id_seq TO "sparky uat";


--
-- Name: TABLE v_mctq_analysis; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_mctq_analysis TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_mctq_analysis TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_mctq_analysis TO "sparky uat";


--
-- Name: TABLE v_mctq_stats; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_mctq_stats TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_mctq_stats TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_mctq_stats TO "sparky uat";


--
-- Name: TABLE verification; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.verification TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.verification TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.verification TO "sparky uat";


--
-- Name: TABLE water_intake; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake TO "sparky uat";


--
-- Name: TABLE water_intake_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake_entries TO "sparky uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake_entries TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.water_intake_entries TO sparky_uat;


--
-- Name: TABLE weekly_goal_plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.weekly_goal_plans TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.weekly_goal_plans TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.weekly_goal_plans TO "sparky uat";


--
-- Name: TABLE workout_plan_assignment_sets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_assignment_sets TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_assignment_sets TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_assignment_sets TO "sparky uat";


--
-- Name: SEQUENCE workout_plan_assignment_sets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_assignment_sets_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_assignment_sets_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_assignment_sets_id_seq TO "sparky uat";


--
-- Name: TABLE workout_plan_template_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_template_assignments TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_template_assignments TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_template_assignments TO "sparky uat";


--
-- Name: SEQUENCE workout_plan_template_assignments_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_template_assignments_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_template_assignments_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_template_assignments_id_seq TO "sparky uat";


--
-- Name: TABLE workout_plan_templates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_templates TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_templates TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plan_templates TO "sparky uat";


--
-- Name: SEQUENCE workout_plan_templates_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_templates_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_templates_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.workout_plan_templates_id_seq TO "sparky uat";


--
-- Name: TABLE workout_preset_exercise_sets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercise_sets TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercise_sets TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercise_sets TO "sparky uat";


--
-- Name: SEQUENCE workout_preset_exercise_sets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercise_sets_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercise_sets_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercise_sets_id_seq TO "sparky uat";


--
-- Name: TABLE workout_preset_exercises; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercises TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercises TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_preset_exercises TO "sparky uat";


--
-- Name: SEQUENCE workout_preset_exercises_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercises_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercises_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.workout_preset_exercises_id_seq TO "sparky uat";


--
-- Name: TABLE workout_presets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_presets TO sparky_uat;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_presets TO "sparky-uat";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_presets TO "sparky uat";


--
-- Name: SEQUENCE workout_presets_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.workout_presets_id_seq TO sparky_uat;
GRANT SELECT,USAGE ON SEQUENCE public.workout_presets_id_seq TO "sparky-uat";
GRANT SELECT,USAGE ON SEQUENCE public.workout_presets_id_seq TO "sparky uat";


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: system; Owner: -
--

GRANT SELECT ON TABLE system.schema_migrations TO sparky_uat;
GRANT SELECT ON TABLE system.schema_migrations TO "sparky-uat";
GRANT SELECT ON TABLE system.schema_migrations TO "sparky uat";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT ALL ON FUNCTIONS TO "sparky uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT ALL ON FUNCTIONS TO "sparky-uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT ALL ON FUNCTIONS TO sparky_uat;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "sparky uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "sparky-uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA auth GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_uat;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO "sparky uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO "sparky-uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO sparky_uat;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT ALL ON FUNCTIONS TO "sparky uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT ALL ON FUNCTIONS TO "sparky-uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT ALL ON FUNCTIONS TO sparky_uat;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "sparky uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO "sparky-uat";
ALTER DEFAULT PRIVILEGES FOR ROLE sparky IN SCHEMA public GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES TO sparky_uat;


--
-- PostgreSQL database dump complete
--

\unrestrict dhGmLySjFGTRowxkdoNsugMJvJLlJnLFKqaQcs0DG614jCZILkcwuzPSKJ6l1bT

