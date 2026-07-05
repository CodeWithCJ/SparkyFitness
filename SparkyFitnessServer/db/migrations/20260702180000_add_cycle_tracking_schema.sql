-- Cycle & Pregnancy hub — Phase 1 (period tracking foundation).
-- Naming follows existing conventions: event/log tables use descriptive names,
-- display preferences mirror user_medication_display_preferences.
-- RLS: all tables are Tier 1 (owner-only) — deliberately stricter than
-- medications; NO family/caregiver sharing in v1. Policies live in
-- db/rls_policies.sql (create_owner_policy) and are reapplied on every startup.

-- Ensure the shared updated_at trigger exists (idempotent).
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. cycle_settings — one row per user: mode, cycle parameters, feature toggles.
-- ---------------------------------------------------------------------------
CREATE TABLE cycle_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    mode VARCHAR(20) NOT NULL DEFAULT 'standard',        -- standard|ttc|pregnant|postpartum|menopause
    avg_cycle_length_override SMALLINT,                  -- NULL => learned from data
    avg_period_length_override SMALLINT,
    luteal_phase_length SMALLINT NOT NULL DEFAULT 14,
    birth_control_method VARCHAR(20) NOT NULL DEFAULT 'none',
    conditions TEXT[] NOT NULL DEFAULT '{}',             -- pcos|endometriosis|...
    show_fertile_window BOOLEAN NOT NULL DEFAULT TRUE,
    preferred_products TEXT[] NOT NULL DEFAULT '{pad,tampon}',
    dismissed_prompts TEXT[] NOT NULL DEFAULT '{}',      -- "don't ask again" clarify-rule keys
    terminology VARCHAR(20) NOT NULL DEFAULT 'default',  -- default|neutral (i18n variant)
    discreet_mode BOOLEAN NOT NULL DEFAULT FALSE,
    onboarded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cycle_settings_user_id ON cycle_settings(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON cycle_settings
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 2. cycle_daily_entries — one row per user+day (flow, products, BBT, mucus, mood).
-- ---------------------------------------------------------------------------
CREATE TABLE cycle_daily_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    flow_level VARCHAR(20),                              -- NULL = not logged; 'none' = explicit no-flow
    product_usage JSONB NOT NULL DEFAULT '{}'::jsonb,    -- {"pad":3,"tampon":2,...} counts
    -- BBT moved to the 'basal_body_temperature' custom measurement (shared with mobile sync).
    -- Mood moved to the shared mood_entries.mood_tags model.
    cervical_mucus VARCHAR(20),
    unusual_discharge TEXT[] NOT NULL DEFAULT '{}',
    energy SMALLINT,                                     -- 1-5
    libido SMALLINT,                                     -- 1-5
    notes TEXT,
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,    -- forward-compat (TTC adds keys)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_cycle_day UNIQUE (user_id, entry_date)
);
CREATE INDEX idx_cycle_daily_entries_user_id ON cycle_daily_entries(user_id);
CREATE INDEX idx_cycle_daily_entries_user_date ON cycle_daily_entries(user_id, entry_date);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON cycle_daily_entries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 3. cycles — derived (or manually-corrected) period/cycle history records.
-- ---------------------------------------------------------------------------
CREATE TABLE cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE,                                       -- day before next cycle start; NULL = current
    period_length SMALLINT,
    cycle_length SMALLINT,                               -- NULL until closed
    is_excluded BOOLEAN NOT NULL DEFAULT FALSE,          -- exclude outliers from stats
    source VARCHAR(20) NOT NULL DEFAULT 'derived',       -- derived|manual
    birth_control_method VARCHAR(20),                    -- stamped at derivation
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_cycle_start UNIQUE (user_id, start_date)
);
CREATE INDEX idx_cycles_user_id ON cycles(user_id);
CREATE INDEX idx_cycles_user_start ON cycles(user_id, start_date);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON cycles
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 4. user_cycle_display_preferences — user-chosen visible tiles/cards per view
--    and platform (mirrors user_medication_display_preferences). Powers the
--    dashboard customization sheet.
-- ---------------------------------------------------------------------------
CREATE TABLE user_cycle_display_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    view_group VARCHAR(255) NOT NULL,                    -- today|calendar|insights|care
    platform VARCHAR(50) NOT NULL DEFAULT 'web',
    visible_items JSONB NOT NULL DEFAULT '[]'::jsonb,    -- ordered enabled tile/card ids
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_cycle_display UNIQUE (user_id, view_group, platform)
);
CREATE INDEX idx_user_cycle_display_preferences_user_id ON user_cycle_display_preferences(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON user_cycle_display_preferences
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security.
--   RLS is NOT defined here. Per project convention, RLS for these tables is
--   applied in db/rls_policies.sql (reapplied on every startup). All four
--   tables use create_owner_policy(...) => Tier 1, owner-only. Cycle symptom
--   logging reuses the existing symptom_entries table (source='cycle').
-- ---------------------------------------------------------------------------




-- Cycle & Pregnancy hub — Phase 3 (TTC Mode & Fertility Tools).

-- 1. Create cycle_test_entries table
CREATE TABLE cycle_test_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    test_type VARCHAR(10) NOT NULL,          -- 'opk' | 'hpt'
    result VARCHAR(10) NOT NULL,             -- opk: negative|low|high|peak · hpt: negative|faint|positive
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cycle_test_entries_user_id ON cycle_test_entries(user_id);
CREATE INDEX idx_cycle_test_entries_user_date ON cycle_test_entries(user_id, entry_date);

CREATE TRIGGER set_timestamp BEFORE UPDATE ON cycle_test_entries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. Add columns to cycle_daily_entries
ALTER TABLE cycle_daily_entries 
ADD COLUMN intercourse BOOLEAN,
ADD COLUMN intercourse_protected BOOLEAN,
ADD COLUMN cervical_position VARCHAR(30);



-- Cycle & Pregnancy hub — Phase 4 (Pregnancy Mode).
-- Six tables, all Tier 1 (owner-only). Prenatal vitamin reuses the existing
-- medications system (linked via prenatal_medication_id). RLS in rls_policies.sql.

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. pregnancies — one active pregnancy per user (enforced by partial unique index).
CREATE TABLE pregnancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    due_date DATE NOT NULL,
    due_date_basis VARCHAR(20) NOT NULL DEFAULT 'lmp',   -- lmp|conception|manual|scan
    lmp_date DATE,
    conception_date DATE,
    fetus_count SMALLINT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'active',        -- active|completed|ended
    ended_on DATE,
    outcome VARCHAR(30),
    prenatal_medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
    supplement_medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pregnancies_user_id ON pregnancies(user_id);
CREATE UNIQUE INDEX unique_active_pregnancy ON pregnancies(user_id)
    WHERE status = 'active';
CREATE TRIGGER set_timestamp BEFORE UPDATE ON pregnancies
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- 2. pregnancy_kick_sessions
CREATE TABLE pregnancy_kick_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    pregnancy_id UUID NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    kick_count SMALLINT NOT NULL DEFAULT 0,
    kick_times TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pregnancy_kick_sessions_user_id ON pregnancy_kick_sessions(user_id);
CREATE INDEX idx_pregnancy_kick_sessions_pregnancy ON pregnancy_kick_sessions(pregnancy_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON pregnancy_kick_sessions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- 3. pregnancy_contractions — one row per contraction.
CREATE TABLE pregnancy_contractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    pregnancy_id UUID NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    intensity SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pregnancy_contractions_user_id ON pregnancy_contractions(user_id);
CREATE INDEX idx_pregnancy_contractions_pregnancy ON pregnancy_contractions(pregnancy_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON pregnancy_contractions
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- 4. pregnancy_photos — bump photo journal (mirrors check_in_photos).
CREATE TABLE pregnancy_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    pregnancy_id UUID NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
    week SMALLINT NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    file_path TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pregnancy_photos_user_id ON pregnancy_photos(user_id);
CREATE INDEX idx_pregnancy_photos_pregnancy ON pregnancy_photos(pregnancy_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON pregnancy_photos
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- 5. pregnancy_checklist_state — completion/custom items per pregnancy.
CREATE TABLE pregnancy_checklist_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    pregnancy_id UUID NOT NULL REFERENCES pregnancies(id) ON DELETE CASCADE,
    template_key TEXT,                                   -- NULL for custom items
    custom_title TEXT,
    week SMALLINT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    dismissed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pregnancy_checklist_user_id ON pregnancy_checklist_state(user_id);
CREATE INDEX idx_pregnancy_checklist_pregnancy ON pregnancy_checklist_state(pregnancy_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON pregnancy_checklist_state
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- 6. health_appointments — generic (also used by the Care hub in Phase 5).
CREATE TABLE health_appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    pregnancy_id UUID REFERENCES pregnancies(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    appointment_type VARCHAR(50) NOT NULL DEFAULT 'other',
    title TEXT,
    location TEXT,
    notes TEXT,
    outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_health_appointments_user_id ON health_appointments(user_id);
CREATE INDEX idx_health_appointments_scheduled ON health_appointments(user_id, scheduled_at);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON health_appointments
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- RLS in db/rls_policies.sql: all six tables -> create_owner_policy (Tier 1).


-- Mood unification: add multi-select mood_tags to mood_entries (keeping the
-- numeric mood_value for Garmin sync / analytics / chatbot interop) and add a
-- user_custom_moods table (mirrors user_custom_symptoms). Additive &
-- non-destructive: mood_value is retained.

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. mood_tags column.
ALTER TABLE mood_entries
  ADD COLUMN IF NOT EXISTS mood_tags TEXT[] NOT NULL DEFAULT '{}';

-- 2. Backfill each existing 0-100 mood_value into one tag (MoodMeter bands).
UPDATE mood_entries
SET mood_tags = ARRAY[
  CASE
    WHEN mood_value <= 15 THEN 'sad'
    WHEN mood_value <= 25 THEN 'angry'
    WHEN mood_value <= 35 THEN 'worried'
    WHEN mood_value <= 45 THEN 'neutral'
    WHEN mood_value <= 55 THEN 'thoughtful'
    WHEN mood_value <= 65 THEN 'calm'
    WHEN mood_value <= 75 THEN 'confident'
    WHEN mood_value <= 85 THEN 'happy'
    ELSE 'excited'
  END
]
WHERE mood_tags = '{}' AND mood_value IS NOT NULL;

-- 3. user_custom_moods — user-defined mood tags (mirrors user_custom_symptoms).
CREATE TABLE IF NOT EXISTS user_custom_moods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                                  -- stable slug
    display_name TEXT,
    icon VARCHAR(40),
    color VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_mood_name UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_user_custom_moods_user_id ON user_custom_moods(user_id);
DROP TRIGGER IF EXISTS set_timestamp ON user_custom_moods;
CREATE TRIGGER set_timestamp BEFORE UPDATE ON user_custom_moods
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- RLS for user_custom_moods is applied in db/rls_policies.sql. It uses the
-- check-in policy (like custom_categories) so it follows check-in family sharing.




-- Mood display preferences: lets a user hide/show built-in and custom moods in
-- the check-in mood picker (parity with the cycle symptom show/hide). Dedicated
-- table (moods are check-in data, not cycle). Owner-only preference.

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS user_mood_display_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL DEFAULT 'web',
    hidden_moods TEXT[] NOT NULL DEFAULT '{}',   -- mood names hidden from the picker
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_mood_display UNIQUE (user_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_user_mood_display_preferences_user_id ON user_mood_display_preferences(user_id);
DROP TRIGGER IF EXISTS set_timestamp ON user_mood_display_preferences;
CREATE TRIGGER set_timestamp BEFORE UPDATE ON user_mood_display_preferences
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- RLS applied in db/rls_policies.sql (owner-only preference).
