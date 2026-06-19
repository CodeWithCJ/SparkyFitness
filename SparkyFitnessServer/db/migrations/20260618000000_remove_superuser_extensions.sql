-- Migration: Remove superuser-required extensions
--
-- Background (GitHub issue #165):
--   The initial migration installed pg_stat_statements, pgcrypto, and uuid-ossp.
--   All three require superuser to CREATE, which broke deployments on managed
--   PostgreSQL clusters (CloudNativePG, RDS, Azure Flexible Server, etc.).
--
--   For NEW installs those extensions were already removed from InitialDB.sql.
--   This migration handles EXISTING installs in three steps.
--
-- Table scope:
--   All ALTER TABLE statements target ONLY the specific (schema, table, column)
--   tuples sourced directly from db_schema_backup.sql. IF EXISTS guards ensure
--   each statement is a no-op when a table does not yet exist (fresh installs
--   where InitialDB.sql already used gen_random_uuid(), or optional migrations
--   the user never ran).
--
-- Safety notes:
--   • ALTER TABLE ... SET DEFAULT is a metadata-only change. No rows are
--     rewritten; the ACCESS EXCLUSIVE lock is released almost instantly.
--   • gen_random_uuid() and uuid_generate_v4() produce identical UUID v4 output.
--   • Existing UUID values stored in the database are never touched.
--   • All DO blocks are independent; a failure in one does not roll back others.

-- ============================================================
-- Step 1: Fix columns still using uuid_generate_v4() as DEFAULT
--
-- Source: db_schema_backup.sql — tables with DEFAULT public.uuid_generate_v4()
--   886   public.admin_activity_logs.id
--  1188   public.exercise_entry_activity_details.id
--  1254   public.exercise_preset_entries.id
--  1303   public.external_data_providers.id
--  1391   public.fasting_logs.id
--  1460   public.food_entry_meals.id
--  1995   public.sleep_entries.id
--  2032   public.sleep_entry_stages.id
-- ============================================================
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (
        SELECT schema_name, table_name, col_name FROM (VALUES
            ('public'::text, 'admin_activity_logs'::text,             'id'::text),
            ('public'::text, 'exercise_entry_activity_details'::text, 'id'::text),
            ('public'::text, 'exercise_preset_entries'::text,         'id'::text),
            ('public'::text, 'external_data_providers'::text,         'id'::text),
            ('public'::text, 'fasting_logs'::text,                    'id'::text),
            ('public'::text, 'food_entry_meals'::text,                'id'::text),
            ('public'::text, 'sleep_entries'::text,                   'id'::text),
            ('public'::text, 'sleep_entry_stages'::text,              'id'::text)
        ) AS cols(schema_name, table_name, col_name)
    )
    LOOP
        -- Skip if table does not exist (fresh installs, optional migrations)
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = t.schema_name AND c.relname = t.table_name
        ) THEN
            RAISE NOTICE '[Step 1] Table %.% does not exist — skipping.', t.schema_name, t.table_name;
            CONTINUE;
        END IF;

        -- Skip if already using gen_random_uuid (idempotent)
        IF NOT EXISTS (
            SELECT 1 FROM pg_attrdef d
            JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
            JOIN pg_class     c ON c.oid = d.adrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = t.schema_name
              AND c.relname  = t.table_name
              AND a.attname  = t.col_name
              AND pg_get_expr(d.adbin, d.adrelid) LIKE '%uuid_generate_v4%'
        ) THEN
            RAISE NOTICE '[Step 1] %.%(%) already uses gen_random_uuid() — skipping.', t.schema_name, t.table_name, t.col_name;
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT gen_random_uuid()',
            t.schema_name, t.table_name, t.col_name
        );
        RAISE NOTICE '[Step 1] Updated %.%(%) default: uuid_generate_v4() -> gen_random_uuid()', t.schema_name, t.table_name, t.col_name;
    END LOOP;

    RAISE NOTICE '[Step 1] Complete.';
END $$;

-- ============================================================
-- Step 2: Re-bind gen_random_uuid() defaults to pg_catalog built-in
--         BEFORE dropping pgcrypto (prevents OID-dangling on old PG installs)
--
-- pgcrypto also ships gen_random_uuid(). On installs originally on PG < 13,
-- PostgreSQL may have stored pgcrypto's OID in pg_attrdef. Dropping pgcrypto
-- would then silently break new inserts on those columns. Explicitly setting
-- DEFAULT pg_catalog.gen_random_uuid() rebinds the OID to the built-in first.
--
-- Source: db_schema_backup.sql — tables with DEFAULT gen_random_uuid()
--   858   public.account.id
--   900   public.ai_service_settings.id
--  1012   public.check_in_measurements.id
--  1034   public.custom_categories.id
--  1061   public.custom_measurements.id
--  1082   public.daily_sleep_need.id
--  1110   public.day_classification_cache.id
--  1142   public.exercise_entries.id
--  1273   public.exercises.id
--  1371   public.family_access.id
--  1410   public.food_entries.id
--  1503   public.food_variants.id
--  1544   public.foods.id
--  1579   public.goal_presets.id
--  1621   public.meal_foods.id
--  1658   public.meal_plan_template_assignments.id
--  1677   public.meal_plan_templates.id
--  1694   public.meal_plans.id
--  1717   public.meal_types.id
--  1732   public.meals.id
--  1772   public.mood_entries.id
--  1836   public.onboarding_data.id
--  1857   public.onboarding_status.id
--  1972   public.session.id
--  2051   public.sleep_need_calculations.id
--  2084   public.sparky_chat_history.id  (also session_id)
--  2111   public.sso_provider.id
--  2149   public."user".id
--  2189   public.user_allergen_preferences.id
--  2201   public.user_custom_nutrients.id
--  2215   public.user_goals.id
--  2350   public.user_preferences.id
--  2550   public.verification.id
--  2571   public.water_intake.id
--  2588   public.water_intake_entries.id
--  2606   public.weekly_goal_plans.id
-- ============================================================
DO $$
DECLARE
    t RECORD;
BEGIN
    -- Only needed if pgcrypto is installed
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        RAISE NOTICE '[Step 2] pgcrypto is not installed — no OID re-binding needed.';
        RETURN;
    END IF;

    FOR t IN (
        SELECT schema_name, table_name, col_name FROM (VALUES
            ('public'::text, 'account'::text,                        'id'::text),
            ('public'::text, 'ai_service_settings'::text,            'id'::text),
            ('public'::text, 'check_in_measurements'::text,          'id'::text),
            ('public'::text, 'custom_categories'::text,              'id'::text),
            ('public'::text, 'custom_measurements'::text,            'id'::text),
            ('public'::text, 'daily_sleep_need'::text,               'id'::text),
            ('public'::text, 'day_classification_cache'::text,       'id'::text),
            ('public'::text, 'exercise_entries'::text,               'id'::text),
            ('public'::text, 'exercises'::text,                      'id'::text),
            ('public'::text, 'family_access'::text,                  'id'::text),
            ('public'::text, 'food_entries'::text,                   'id'::text),
            ('public'::text, 'food_variants'::text,                  'id'::text),
            ('public'::text, 'foods'::text,                          'id'::text),
            ('public'::text, 'goal_presets'::text,                   'id'::text),
            ('public'::text, 'meal_foods'::text,                     'id'::text),
            ('public'::text, 'meal_plan_template_assignments'::text, 'id'::text),
            ('public'::text, 'meal_plan_templates'::text,            'id'::text),
            ('public'::text, 'meal_plans'::text,                     'id'::text),
            ('public'::text, 'meal_types'::text,                     'id'::text),
            ('public'::text, 'meals'::text,                          'id'::text),
            ('public'::text, 'mood_entries'::text,                   'id'::text),
            ('public'::text, 'onboarding_data'::text,                'id'::text),
            ('public'::text, 'onboarding_status'::text,              'id'::text),
            ('public'::text, 'session'::text,                        'id'::text),
            ('public'::text, 'sleep_need_calculations'::text,        'id'::text),
            ('public'::text, 'sparky_chat_history'::text,            'id'::text),
            ('public'::text, 'sparky_chat_history'::text,            'session_id'::text),
            ('public'::text, 'sso_provider'::text,                   'id'::text),
            ('public'::text, 'user'::text,                           'id'::text),
            ('public'::text, 'user_allergen_preferences'::text,      'id'::text),
            ('public'::text, 'user_custom_nutrients'::text,          'id'::text),
            ('public'::text, 'user_goals'::text,                     'id'::text),
            ('public'::text, 'user_preferences'::text,               'id'::text),
            ('public'::text, 'verification'::text,                   'id'::text),
            ('public'::text, 'water_intake'::text,                   'id'::text),
            ('public'::text, 'water_intake_entries'::text,           'id'::text),
            ('public'::text, 'weekly_goal_plans'::text,              'id'::text)
        ) AS cols(schema_name, table_name, col_name)
    )
    LOOP
        -- Skip if table does not exist
        IF NOT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = t.schema_name AND c.relname = t.table_name
        ) THEN
            RAISE NOTICE '[Step 2] Table %.% does not exist — skipping.', t.schema_name, t.table_name;
            CONTINUE;
        END IF;

        -- Skip if this column has no gen_random_uuid default
        IF NOT EXISTS (
            SELECT 1 FROM pg_attrdef d
            JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
            JOIN pg_class     c ON c.oid = d.adrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = t.schema_name
              AND c.relname  = t.table_name
              AND a.attname  = t.col_name
              AND pg_get_expr(d.adbin, d.adrelid) LIKE '%gen_random_uuid%'
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT pg_catalog.gen_random_uuid()',
            t.schema_name, t.table_name, t.col_name
        );
        RAISE NOTICE '[Step 2] Re-bound %.%(%) to pg_catalog.gen_random_uuid()', t.schema_name, t.table_name, t.col_name;
    END LOOP;

    RAISE NOTICE '[Step 2] OID re-binding complete.';
END $$;

-- ============================================================
-- Step 3: Drop the three legacy extensions
--         Checks pg_extension first (no privilege needed).
--         Catches insufficient_privilege for non-superuser deployments.
-- ============================================================

-- pg_stat_statements
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') THEN
        RAISE NOTICE '[Step 3] pg_stat_statements is not installed — nothing to drop.';
        RETURN;
    END IF;
    DROP EXTENSION "pg_stat_statements";
    RAISE NOTICE '[Step 3] Dropped extension: pg_stat_statements';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[Step 3] Skipped dropping pg_stat_statements: insufficient privilege (superuser required). Extension is unused and harmless.';
END $$;

-- uuid-ossp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
        RAISE NOTICE '[Step 3] uuid-ossp is not installed — nothing to drop.';
        RETURN;
    END IF;
    DROP EXTENSION "uuid-ossp";
    RAISE NOTICE '[Step 3] Dropped extension: uuid-ossp. All column defaults migrated to gen_random_uuid().';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[Step 3] Skipped dropping uuid-ossp: insufficient privilege (superuser required). Column defaults were migrated to gen_random_uuid() in Step 1 — extension is now unused.';
END $$;

-- pgcrypto
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        RAISE NOTICE '[Step 3] pgcrypto is not installed — nothing to drop.';
        RETURN;
    END IF;
    DROP EXTENSION "pgcrypto";
    RAISE NOTICE '[Step 3] Dropped extension: pgcrypto. All defaults re-bound to pg_catalog built-in in Step 2.';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '[Step 3] Skipped dropping pgcrypto: insufficient privilege (superuser required). Column defaults were re-bound to pg_catalog.gen_random_uuid() in Step 2 — extension is now unused by the application.';
END $$;
