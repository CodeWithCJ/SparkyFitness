-- Medication & GLP-1 tracker schema (Phase 3 priority: GLP-1 coach + minimal foundation).
-- Naming follows existing conventions: event tables use *_entries; lookups use *_types;
-- definition table `medications` mirrors `foods`/`exercises`. No brand prefixes (no `glp1_`).
-- RLS: `medications` is PRIVATE (library policy with sharing disabled); entries use the diary
-- policy (owner + family-with-diary-access); caregivers act via onBehalfOfMiddleware (app.user_id).

-- Ensure the shared updated_at trigger exists (idempotent).
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 1. Lookup tables (global reference data; seeded; user-extensible later).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medication_types (
    id VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_injectable BOOLEAN NOT NULL DEFAULT FALSE,
    counting_unit_default VARCHAR(20),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO medication_types (id, display_name, is_injectable, counting_unit_default, sort_order) VALUES
    ('pill',        'Pill',        FALSE, 'pills',    10),
    ('tablet',      'Tablet',      FALSE, 'tablets',  20),
    ('capsule',     'Capsule',     FALSE, 'capsules', 30),
    ('liquid',      'Liquid',      FALSE, 'mL',       40),
    ('injection',   'Injection',   TRUE,  'doses',    50),
    ('patch',       'Patch',       FALSE, 'patches',  60),
    ('inhaler',     'Inhaler',     FALSE, 'puffs',    70),
    ('drops',       'Drops',       FALSE, 'drops',    80),
    ('cream',       'Cream',       FALSE, 'g',        90),
    ('suppository', 'Suppository', FALSE, 'units',    100),
    ('other',       'Other',       FALSE, 'units',    110)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS medication_schedule_types (
    id VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO medication_schedule_types (id, display_name, sort_order) VALUES
    ('daily',         'Every day',        10),
    ('specific_days', 'Specific days',    20),
    ('every_n_days',  'Every N days',     30),
    ('cyclic',        'Cyclic (on/off)',  40),
    ('weekly',        'Weekly',           50),
    ('monthly',       'Monthly',          60),
    ('prn',           'As needed (PRN)',  70),
    ('taper',         'Taper / titration',80)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS medication_route_types (
    id VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO medication_route_types (id, display_name, sort_order) VALUES
    ('oral',          'Oral',           10),
    ('subcutaneous',  'Subcutaneous',   20),
    ('intramuscular', 'Intramuscular',  30),
    ('topical',       'Topical',        40),
    ('inhaled',       'Inhaled',        50),
    ('nasal',         'Nasal',          60),
    ('other',         'Other',          70)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. medications — the drug definition (private; library RLS).
-- ---------------------------------------------------------------------------
CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                                  -- stable identifier
    display_name TEXT,                                   -- user-editable alias (NULL = use name)
    type_id VARCHAR(50) REFERENCES medication_types(id),
    route_id VARCHAR(50) REFERENCES medication_route_types(id),
    strength_value NUMERIC,                              -- e.g. 500, 1.0, 5000
    strength_unit VARCHAR(20),                           -- mg, mcg, IU, mL ...
    dose_amount NUMERIC,                                 -- amount per administration
    dose_unit VARCHAR(20),
    rxnorm_rxcui VARCHAR(20),                            -- only set if user enabled lookups
    ndc VARCHAR(20),
    prescriber TEXT,
    pharmacy TEXT,
    rx_number TEXT,
    reason_text TEXT,                                    -- "why am I taking this"
    effectiveness_rating SMALLINT,                       -- 0-5 (nullable)
    color VARCHAR(20),
    icon VARCHAR(50),
    photo_path TEXT,                                     -- pill/label photo (uploadMiddleware)
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_quick BOOLEAN NOT NULL DEFAULT FALSE,             -- quick-add (like is_quick_food)
    is_glp1 BOOLEAN NOT NULL DEFAULT FALSE,              -- flags the GLP-1 coach module
    notes TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_medications_user_id ON medications(user_id);
CREATE INDEX idx_medications_is_glp1 ON medications(user_id, is_glp1) WHERE is_glp1;
CREATE TRIGGER set_timestamp BEFORE UPDATE ON medications
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 3. medication_schedules — one row per timing rule (multi-time, weekdays, cyclic, PRN, taper).
-- ---------------------------------------------------------------------------
CREATE TABLE medication_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    schedule_type_id VARCHAR(50) NOT NULL REFERENCES medication_schedule_types(id),
    time_of_day TIME,                                    -- multiple rows = multiple times/day
    dose_amount NUMERIC,                                 -- per-time amount (overrides med default)
    days_of_week INTEGER[],                              -- specific_days: 0=Sun..6=Sat
    interval_days INTEGER,                               -- every_n_days
    day_of_month INTEGER,                                -- monthly: 1-31 (or last-day via 31)
    cycle_on_days INTEGER,                               -- cyclic
    cycle_off_days INTEGER,
    with_meal VARCHAR(20),                               -- before | with | after (nullable)
    prn_reason TEXT,
    prn_max_per_day INTEGER,
    start_date DATE,
    end_date DATE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_medication_schedules_medication_id ON medication_schedules(medication_id);
CREATE INDEX idx_medication_schedules_user_id ON medication_schedules(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON medication_schedules
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 4. medication_entries — a logged dose (taken/skipped/snoozed), with snapshot.
-- ---------------------------------------------------------------------------
CREATE TABLE medication_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable + SET NULL so dose history survives medication deletion (the row snapshots
    -- med name/dose/unit below), mirroring how food_entries outlive a deleted food.
    medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
    schedule_id UUID REFERENCES medication_schedules(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'taken',         -- taken | skipped | snoozed | prn_taken
    taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_for TIMESTAMPTZ,                           -- the slot it satisfies (nullable for PRN)
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    -- snapshot so editing the med later does not rewrite history:
    med_name_snapshot TEXT,
    dose_amount_snapshot NUMERIC,
    dose_unit_snapshot VARCHAR(20),
    notes TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_medication_entries_medication_id ON medication_entries(medication_id);
CREATE INDEX idx_medication_entries_user_id ON medication_entries(user_id);
CREATE INDEX idx_medication_entries_entry_date ON medication_entries(user_id, entry_date);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON medication_entries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 5. medication_pens — pen AND vial inventory (concentration, volume, BUD, auto-deduct).
-- ---------------------------------------------------------------------------
CREATE TABLE medication_pens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL DEFAULT 'pen',             -- pen | vial
    label TEXT,
    dose_mg NUMERIC,                                     -- per-dose strength
    concentration_mg_ml NUMERIC,                         -- vials/compounded
    volume_ml NUMERIC,
    doses_total INTEGER,
    doses_used INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'sealed',        -- sealed | in_use | finished
    opened_at DATE,
    expiry_date DATE,
    bud_date DATE,                                       -- beyond-use date (compounded/opened)
    reorder_flag BOOLEAN NOT NULL DEFAULT FALSE,
    reorder_threshold INTEGER,
    notes TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_medication_pens_medication_id ON medication_pens(medication_id);
CREATE INDEX idx_medication_pens_user_id ON medication_pens(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON medication_pens
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 6. injection_entries — a logged shot (site, dose, pen/vial ref).
-- ---------------------------------------------------------------------------
CREATE TABLE injection_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nullable + SET NULL so injection history survives medication deletion.
    medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    pen_id UUID REFERENCES medication_pens(id) ON DELETE SET NULL,
    injected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    site VARCHAR(40),                                    -- e.g. left_abdomen, right_thigh ...
    dose_mg NUMERIC,
    notes TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_injection_entries_medication_id ON injection_entries(medication_id);
CREATE INDEX idx_injection_entries_user_id ON injection_entries(user_id);
CREATE INDEX idx_injection_entries_injected_at ON injection_entries(user_id, injected_at);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON injection_entries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 7. medication_titration_steps — titration + taper plan steps.
-- ---------------------------------------------------------------------------
CREATE TABLE medication_titration_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medication_id UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    dose_mg NUMERIC NOT NULL,
    dose_unit VARCHAR(20) NOT NULL DEFAULT 'mg',
    start_date DATE,
    planned_weeks INTEGER,
    step_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'planned',       -- done | active | planned
    is_taper BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_medication_titration_steps_medication_id ON medication_titration_steps(medication_id);
CREATE INDEX idx_medication_titration_steps_user_id ON medication_titration_steps(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON medication_titration_steps
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 8. user_custom_symptoms — user-defined side effects (mirror user_custom_nutrients).
-- ---------------------------------------------------------------------------
CREATE TABLE user_custom_symptoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                                  -- stable identifier
    display_name TEXT,
    scale_type VARCHAR(20) NOT NULL DEFAULT '1-10',      -- 1-10 | none-severe | count | text
    unit VARCHAR(20),
    is_glp1_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_symptom_name UNIQUE (user_id, name)
);
CREATE INDEX idx_user_custom_symptoms_user_id ON user_custom_symptoms(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON user_custom_symptoms
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 8b. user_custom_symptom_locations — user-defined symptom locations.
-- ---------------------------------------------------------------------------
CREATE TABLE user_custom_symptom_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_symptom_location_name UNIQUE (user_id, name)
);
CREATE INDEX idx_user_custom_symptom_locations_user_id ON user_custom_symptom_locations(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON user_custom_symptom_locations
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 9. symptom_entries — a logged side effect (severity, location, Bristol, dose link).
-- ---------------------------------------------------------------------------
CREATE TABLE symptom_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    medication_id UUID REFERENCES medications(id) ON DELETE SET NULL,
    symptom_id UUID REFERENCES user_custom_symptoms(id) ON DELETE SET NULL,
    symptom_name_snapshot TEXT NOT NULL,                 -- built-in name or custom snapshot
    severity NUMERIC,
    severity_label VARCHAR(40),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    body_location VARCHAR(60),                           -- body-map pin
    context_text TEXT,                                   -- "what/when did you eat"
    bristol_type SMALLINT,                               -- 1-7 (nullable)
    source VARCHAR(50) NOT NULL DEFAULT 'manual',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_symptom_entries_user_id ON symptom_entries(user_id);
CREATE INDEX idx_symptom_entries_entry_date ON symptom_entries(user_id, entry_date);
CREATE INDEX idx_symptom_entries_medication_id ON symptom_entries(medication_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON symptom_entries
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 10. user_medication_display_preferences — user-chosen visible KPIs/cards/columns per view
--     and platform (mirrors user_nutrient_display_preferences). Powers customization of what
--     shows on the Cabinet / Today / GLP-1 / Insights screens.
-- ---------------------------------------------------------------------------
CREATE TABLE user_medication_display_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    view_group VARCHAR(255) NOT NULL,                    -- cabinet | today | glp1 | insights ...
    platform VARCHAR(50) NOT NULL DEFAULT 'web',
    visible_items JSONB NOT NULL DEFAULT '[]'::jsonb,    -- ordered list of enabled tile/card/column ids
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_med_display UNIQUE (user_id, view_group, platform)
);
CREATE INDEX idx_user_medication_display_preferences_user_id ON user_medication_display_preferences(user_id);
CREATE TRIGGER set_timestamp BEFORE UPDATE ON user_medication_display_preferences
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- ---------------------------------------------------------------------------
-- 11. Row-Level Security.
--   RLS is NOT defined here. Per project convention, RLS for these tables is enabled
--   and applied in `db/rls_policies.sql`, which is reapplied on every startup
--   (see utils/applyRlsPolicies.ts). There:
--     - `medications`  -> create_library_policy('medications','false',ARRAY['can_manage_diary'])
--       (sharing disabled => PRIVATE by default; owner-only writes; caregivers via onBehalfOfMiddleware).
--     - medication_schedules / medication_entries / medication_pens / injection_entries /
--       medication_titration_steps / user_custom_symptoms / symptom_entries -> create_diary_policy(...).
--     - user_medication_display_preferences -> create_owner_policy(...) (personal, owner-only).
--   Lookup tables (medication_types / *_schedule_types / *_route_types) stay global reference data.
-- ---------------------------------------------------------------------------
