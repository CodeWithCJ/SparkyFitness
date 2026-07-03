-- Better Auth Database Migration
-- This script creates the Better Auth tables and migrates data from existing tables

-- Step 0: Handle table name conflicts
-- Drop existing "session" table (express-session) if it has the old structure
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'session'
        AND NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'session' AND column_name = 'user_id'
        )
    ) THEN
        DROP TABLE public."session";
    END IF;
END $$;

-- Step 1: Create Better Auth tables
-- Using UUID for all IDs for consistency with existing SparkyFitness schema
CREATE TABLE IF NOT EXISTS "user" (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    name TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    ban_expires TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS "session" (
    id UUID PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
    id UUID PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at TIMESTAMP,
    refresh_token_expires_at TIMESTAMP,
    scope TEXT,
    password TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "verification" (
    id UUID PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "two_factor" (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    secret TEXT,
    backup_codes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);



-- Step 1: Create the native Better Auth SSO table (using snake_case)
CREATE TABLE IF NOT EXISTS "sso_provider" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id TEXT NOT NULL UNIQUE,
    issuer TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_secret TEXT,
    discovery_endpoint TEXT,
    authorization_endpoint TEXT,
    token_endpoint TEXT,
    jwks_endpoint TEXT,
    userinfo_endpoint TEXT,
    scopes TEXT, -- Added missing column
    additional_config TEXT, -- Stores extra fields like logo_url, display_name as JSON
    domain TEXT NOT NULL DEFAULT 'default.internal', -- Added domain column with default
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    oidc_config TEXT
);




-- Description: Adds the passkey table required for WebAuthn/Passkey support.
CREATE TABLE IF NOT EXISTS "passkey" (
    id TEXT PRIMARY KEY,
    name TEXT,
    public_key TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL,
    counter INTEGER NOT NULL,
    device_type TEXT NOT NULL,
    backed_up BOOLEAN NOT NULL,
    transports TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    aaguid TEXT
);



-- Step 2: Migrate data from auth.users to "user" table
-- Join with profiles to get the full_name
INSERT INTO "user" (id, email, email_verified, name, created_at, updated_at)
SELECT 
    u.id,
    u.email,
    FALSE, -- auth.users doesn't have email_verified, defaulting to false
    p.full_name,
    COALESCE(u.created_at, NOW()),
    COALESCE(u.updated_at, NOW())
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ON CONFLICT (id) DO NOTHING;

-- Step 3: Migrate password hashes to "account" table (for email/password auth)
INSERT INTO "account" (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    u.email,
    'credential',
    u.id,
    u.password_hash,
    COALESCE(u.created_at, NOW()),
    COALESCE(u.updated_at, NOW())
FROM auth.users u
WHERE u.password_hash IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 4: Migrate OIDC links to "account" table
INSERT INTO "account" (id, account_id, provider_id, user_id, created_at, updated_at)
SELECT 
    gen_random_uuid(),
    uol.oidc_sub,
    'oidc-' || uol.oidc_provider_id::TEXT,
    uol.user_id,
    uol.created_at,
    uol.updated_at
FROM public.user_oidc_links uol
ON CONFLICT DO NOTHING;

-- Create indexes for Better Auth (after data is migrated)
CREATE INDEX IF NOT EXISTS idx_session_user_id ON "session"(user_id);
CREATE INDEX IF NOT EXISTS idx_session_token ON "session"(token);
CREATE INDEX IF NOT EXISTS idx_account_user_id ON "account"(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"(identifier);

-- Step 5: Update foreign keys in dependent tables to point to new "user" table
-- Note: This assumes the UUIDs are preserved (which they are in the migration above)

-- Update profiles table
ALTER TABLE IF EXISTS public.profiles 
    DROP CONSTRAINT IF EXISTS profiles_user_id_fkey,
    ADD CONSTRAINT profiles_user_id_fkey 
    FOREIGN KEY (id) REFERENCES "user"(id) ON DELETE CASCADE;

-- Update user_api_keys table
ALTER TABLE IF EXISTS public.user_api_keys 
    DROP CONSTRAINT IF EXISTS user_api_keys_user_id_fkey,
    ADD CONSTRAINT user_api_keys_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

-- Update family_access table
ALTER TABLE IF EXISTS public.family_access 
    DROP CONSTRAINT IF EXISTS family_access_owner_user_id_fkey,
    ADD CONSTRAINT family_access_owner_user_id_fkey 
    FOREIGN KEY (owner_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.family_access 
    DROP CONSTRAINT IF EXISTS family_access_family_user_id_fkey,
    ADD CONSTRAINT family_access_family_user_id_fkey 
    FOREIGN KEY (family_user_id) REFERENCES "user"(id) ON DELETE CASCADE;


-- Step 7: Add role column to "user" table (for admin functionality)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Migrate roles from auth.users
UPDATE "user" u
SET role = au.role
FROM auth.users au
WHERE u.id = au.id AND au.role IS NOT NULL;

COMMENT ON TABLE "user" IS 'Better Auth user table - migrated from auth.users';
COMMENT ON TABLE "session" IS 'Better Auth session table';
COMMENT ON TABLE "account" IS 'Better Auth account table - stores credentials and OIDC links';
COMMENT ON TABLE "verification" IS 'Better Auth verification table';


-- Add default UUID generation to Better Auth tables
-- This ensures that if the application doesn't provide an ID, the database will generate one.

ALTER TABLE "user" ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE "session" ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE "account" ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE "verification" ALTER COLUMN id SET DEFAULT gen_random_uuid();



-- Step 2: Migrate data from oidc_providers to sso_provider
-- We pack display_name and logo_url into additional_config JSON
INSERT INTO "sso_provider" (
    provider_id,
    issuer,
    client_id,
    client_secret,
    scopes,
    additional_config,
    domain, -- Added domain column
    created_at,
    updated_at
)
SELECT
    'oidc-' || id::TEXT, -- Match the provider_id used in the previous account migration
    issuer_url,
    client_id,
    -- Note: Secrets are already encrypted in our DB, we'll need to ensure auth.js can handle them
    -- For now, we move them as-is.
    CASE
        WHEN encrypted_client_secret IS NOT NULL THEN encrypted_client_secret
        ELSE NULL
    END,
    scope,
    jsonb_strip_nulls(jsonb_build_object(
        'display_name', display_name,
        'logo_url', logo_url,
        'auto_register', auto_register,
        'signing_algorithm', signing_algorithm
    ))::TEXT,
    'oidc-' || id::TEXT || '.internal', -- Set domain during insert
    created_at,
    updated_at
FROM public.oidc_providers
ON CONFLICT (provider_id) DO NOTHING;

-- 1. Add missing specialized columns to "user" table
ALTER TABLE "user"
ADD COLUMN IF NOT EXISTS mfa_email_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_enforced BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS email_mfa_code TEXT,
ADD COLUMN IF NOT EXISTS email_mfa_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS magic_link_token TEXT,
ADD COLUMN IF NOT EXISTS magic_link_expires TIMESTAMP WITH TIME ZONE;

-- 2. Backfill data from auth.users (if it exists) to custom Better Auth columns
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        UPDATE "user" u
        SET two_factor_enabled = COALESCE(au.mfa_totp_enabled, u.two_factor_enabled),
            mfa_email_enabled = au.mfa_email_enabled,
            mfa_enforced = au.mfa_enforced,
            email_mfa_code = au.email_mfa_code,
            email_mfa_expires_at = au.email_mfa_expires_at,
            magic_link_token = au.magic_link_token,
            magic_link_expires = au.magic_link_expires
        FROM auth.users au
        WHERE u.id = au.id;
    END IF;
END $$;

-- 3. Backfill two_factor data from auth.users to the new two_factor table
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
        INSERT INTO "two_factor" (id, user_id, secret, backup_codes, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            au.id,
            au.mfa_secret,
            au.mfa_recovery_codes::text,
            COALESCE(au.created_at, NOW()),
            COALESCE(au.updated_at, NOW())
        FROM auth.users au
        WHERE au.mfa_secret IS NOT NULL OR au.mfa_recovery_codes IS NOT NULL
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;



-- Description: Updates all identified foreign key constraints to point to the new public."user" table.
-- Includes cleanup of orphaned records and SAFER backfilling of missing profiles/goals.


DO $$
BEGIN
    -- STEP 0: Backfill missing profiles and goals for ANY user in "user" table
    -- Using WHERE NOT EXISTS instead of ON CONFLICT for maximum compatibility
    
    INSERT INTO profiles (id, full_name, created_at, updated_at)
    SELECT u.id, u.name, u.created_at, u.updated_at 
    FROM "user" u
    WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

    INSERT INTO user_goals (user_id, created_at, updated_at)
    SELECT u.id, u.created_at, u.updated_at 
    FROM "user" u
    WHERE NOT EXISTS (SELECT 1 FROM user_goals ug WHERE ug.user_id = u.id AND ug.goal_date IS NULL);

    INSERT INTO onboarding_status (user_id, onboarding_complete, created_at, updated_at)
    SELECT u.id, FALSE, u.created_at, u.updated_at 
    FROM "user" u
    WHERE NOT EXISTS (SELECT 1 FROM onboarding_status os WHERE os.user_id = u.id);

    -- STEP 1: Process each table - Delete orphans then apply constraint
    
    -- 1. meal_plan_templates
    DELETE FROM meal_plan_templates WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE meal_plan_templates DROP CONSTRAINT IF EXISTS meal_plan_templates_user_id_fkey;
    ALTER TABLE meal_plan_templates ADD CONSTRAINT meal_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 2. goal_presets
    DELETE FROM goal_presets WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE goal_presets DROP CONSTRAINT IF EXISTS goal_presets_user_id_fkey;
    ALTER TABLE goal_presets ADD CONSTRAINT goal_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 3. weekly_goal_plans
    DELETE FROM weekly_goal_plans WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE weekly_goal_plans DROP CONSTRAINT IF EXISTS weekly_goal_plans_user_id_fkey;
    ALTER TABLE weekly_goal_plans ADD CONSTRAINT weekly_goal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 4. meals
    DELETE FROM meals WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE meals DROP CONSTRAINT IF EXISTS meals_user_id_fkey;
    ALTER TABLE meals ADD CONSTRAINT meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 5. meal_plans
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'meal_plans') THEN
        DELETE FROM meal_plans WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
        ALTER TABLE meal_plans DROP CONSTRAINT IF EXISTS meal_plans_user_id_fkey;
        ALTER TABLE meal_plans ADD CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    END IF;

    -- 6. sleep_entries
    DELETE FROM sleep_entries WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE sleep_entries DROP CONSTRAINT IF EXISTS sleep_entries_user_id_fkey;
    ALTER TABLE sleep_entries ADD CONSTRAINT sleep_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 7. sleep_entry_stages
    DELETE FROM sleep_entry_stages WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE sleep_entry_stages DROP CONSTRAINT IF EXISTS sleep_entry_stages_user_id_fkey;
    ALTER TABLE sleep_entry_stages ADD CONSTRAINT sleep_entry_stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 8. user_nutrient_display_preferences
    DELETE FROM user_nutrient_display_preferences WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE user_nutrient_display_preferences DROP CONSTRAINT IF EXISTS user_nutrient_display_preferences_user_id_fkey;
    ALTER TABLE user_nutrient_display_preferences ADD CONSTRAINT user_nutrient_display_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 9. user_water_containers
    DELETE FROM user_water_containers WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE user_water_containers DROP CONSTRAINT IF EXISTS user_water_containers_user_id_fkey;
    ALTER TABLE user_water_containers ADD CONSTRAINT user_water_containers_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 10. mood_entries
    DELETE FROM mood_entries WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE mood_entries DROP CONSTRAINT IF EXISTS mood_entries_user_id_fkey;
    ALTER TABLE mood_entries ADD CONSTRAINT mood_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 11. user_oidc_links
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_oidc_links') THEN
        DELETE FROM user_oidc_links WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
        ALTER TABLE user_oidc_links DROP CONSTRAINT IF EXISTS user_oidc_links_user_id_fkey;
        ALTER TABLE user_oidc_links ADD CONSTRAINT user_oidc_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    END IF;

    -- 12. food_entries (multiple keys)
    DELETE FROM food_entries WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE food_entries DROP CONSTRAINT IF EXISTS food_entries_created_by_user_id_fkey;
    ALTER TABLE food_entries ADD CONSTRAINT food_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM food_entries WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE food_entries DROP CONSTRAINT IF EXISTS food_entries_updated_by_user_id_fkey;
    ALTER TABLE food_entries ADD CONSTRAINT food_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM food_entries WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE food_entries DROP CONSTRAINT IF EXISTS food_entries_user_id_fkey;
    ALTER TABLE food_entries ADD CONSTRAINT food_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 13. exercise_entries
    DELETE FROM exercise_entries WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE exercise_entries DROP CONSTRAINT IF EXISTS exercise_entries_created_by_user_id_fkey;
    ALTER TABLE exercise_entries ADD CONSTRAINT exercise_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM exercise_entries WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE exercise_entries DROP CONSTRAINT IF EXISTS exercise_entries_updated_by_user_id_fkey;
    ALTER TABLE exercise_entries ADD CONSTRAINT exercise_entries_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 14. user_ignored_updates
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_ignored_updates') THEN
        DELETE FROM user_ignored_updates WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
        ALTER TABLE user_ignored_updates DROP CONSTRAINT IF EXISTS user_ignored_updates_user_id_fkey;
        ALTER TABLE user_ignored_updates ADD CONSTRAINT user_ignored_updates_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    END IF;

    -- 15. admin_activity_logs
    DELETE FROM admin_activity_logs WHERE admin_user_id IS NOT NULL AND admin_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE admin_activity_logs DROP CONSTRAINT IF EXISTS admin_activity_logs_admin_user_id_fkey;
    ALTER TABLE admin_activity_logs ADD CONSTRAINT admin_activity_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM admin_activity_logs WHERE target_user_id IS NOT NULL AND target_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE admin_activity_logs DROP CONSTRAINT IF EXISTS admin_activity_logs_target_user_id_fkey;
    ALTER TABLE admin_activity_logs ADD CONSTRAINT admin_activity_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 16. workout_presets
    DELETE FROM workout_presets WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE workout_presets DROP CONSTRAINT IF EXISTS workout_presets_user_id_fkey;
    ALTER TABLE workout_presets ADD CONSTRAINT workout_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 17. workout_plan_templates
    DELETE FROM workout_plan_templates WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE workout_plan_templates DROP CONSTRAINT IF EXISTS workout_plan_templates_user_id_fkey;
    ALTER TABLE workout_plan_templates ADD CONSTRAINT workout_plan_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 18. onboarding_status
    DELETE FROM onboarding_status WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE onboarding_status DROP CONSTRAINT IF EXISTS onboarding_status_user_id_fkey;
    ALTER TABLE onboarding_status ADD CONSTRAINT onboarding_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 19. onboarding_data
    DELETE FROM onboarding_data WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE onboarding_data DROP CONSTRAINT IF EXISTS onboarding_data_user_id_fkey;
    ALTER TABLE onboarding_data ADD CONSTRAINT onboarding_data_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 20. exercise_entry_activity_details
    DELETE FROM exercise_entry_activity_details WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE exercise_entry_activity_details DROP CONSTRAINT IF EXISTS exercise_entry_activity_details_created_by_user_id_fkey;
    ALTER TABLE exercise_entry_activity_details ADD CONSTRAINT exercise_entry_activity_details_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM exercise_entry_activity_details WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE exercise_entry_activity_details DROP CONSTRAINT IF EXISTS exercise_entry_activity_details_updated_by_user_id_fkey;
    ALTER TABLE exercise_entry_activity_details ADD CONSTRAINT exercise_entry_activity_details_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 21. exercise_preset_entries
    DELETE FROM exercise_preset_entries WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE exercise_preset_entries DROP CONSTRAINT IF EXISTS exercise_preset_entries_user_id_fkey;
    ALTER TABLE exercise_preset_entries ADD CONSTRAINT exercise_preset_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM exercise_preset_entries WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE exercise_preset_entries DROP CONSTRAINT IF EXISTS exercise_preset_entries_created_by_user_id_fkey;
    ALTER TABLE exercise_preset_entries ADD CONSTRAINT exercise_preset_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 22. food_entry_meals
    DELETE FROM food_entry_meals WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE food_entry_meals DROP CONSTRAINT IF EXISTS food_entry_meals_user_id_fkey;
    ALTER TABLE food_entry_meals ADD CONSTRAINT food_entry_meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM food_entry_meals WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE food_entry_meals DROP CONSTRAINT IF EXISTS food_entry_meals_created_by_user_id_fkey;
    ALTER TABLE food_entry_meals ADD CONSTRAINT food_entry_meals_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM food_entry_meals WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE food_entry_meals DROP CONSTRAINT IF EXISTS food_entry_meals_updated_by_user_id_fkey;
    ALTER TABLE food_entry_meals ADD CONSTRAINT food_entry_meals_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 23. fasting_logs
    DELETE FROM fasting_logs WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE fasting_logs DROP CONSTRAINT IF EXISTS fasting_logs_user_id_fkey;
    ALTER TABLE fasting_logs ADD CONSTRAINT fasting_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 24. user_custom_nutrients
    DELETE FROM user_custom_nutrients WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE user_custom_nutrients DROP CONSTRAINT IF EXISTS user_custom_nutrients_user_id_fkey;
    ALTER TABLE user_custom_nutrients ADD CONSTRAINT user_custom_nutrients_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 25. check_in_measurements
    DELETE FROM check_in_measurements WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE check_in_measurements DROP CONSTRAINT IF EXISTS check_in_measurements_created_by_user_id_fkey;
    ALTER TABLE check_in_measurements ADD CONSTRAINT check_in_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM check_in_measurements WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE check_in_measurements DROP CONSTRAINT IF EXISTS check_in_measurements_updated_by_user_id_fkey;
    ALTER TABLE check_in_measurements ADD CONSTRAINT check_in_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 26. custom_categories
    DELETE FROM custom_categories WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE custom_categories DROP CONSTRAINT IF EXISTS custom_categories_created_by_user_id_fkey;
    ALTER TABLE custom_categories ADD CONSTRAINT custom_categories_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM custom_categories WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE custom_categories DROP CONSTRAINT IF EXISTS custom_categories_updated_by_user_id_fkey;
    ALTER TABLE custom_categories ADD CONSTRAINT custom_categories_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 27. custom_measurements
    DELETE FROM custom_measurements WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE custom_measurements DROP CONSTRAINT IF EXISTS custom_measurements_created_by_user_id_fkey;
    ALTER TABLE custom_measurements ADD CONSTRAINT custom_measurements_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM custom_measurements WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE custom_measurements DROP CONSTRAINT IF EXISTS custom_measurements_updated_by_user_id_fkey;
    ALTER TABLE custom_measurements ADD CONSTRAINT custom_measurements_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 28. water_intake
    DELETE FROM water_intake WHERE created_by_user_id IS NOT NULL AND created_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE water_intake DROP CONSTRAINT IF EXISTS water_intake_created_by_user_id_fkey;
    ALTER TABLE water_intake ADD CONSTRAINT water_intake_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
    
    DELETE FROM water_intake WHERE updated_by_user_id IS NOT NULL AND updated_by_user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE water_intake DROP CONSTRAINT IF EXISTS water_intake_updated_by_user_id_fkey;
    ALTER TABLE water_intake ADD CONSTRAINT water_intake_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES "user"(id) ON DELETE CASCADE;

    -- 29. meal_types
    DELETE FROM meal_types WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM "user");
    ALTER TABLE meal_types DROP CONSTRAINT IF EXISTS meal_types_user_id_fkey;
    ALTER TABLE meal_types ADD CONSTRAINT meal_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

END $$;
