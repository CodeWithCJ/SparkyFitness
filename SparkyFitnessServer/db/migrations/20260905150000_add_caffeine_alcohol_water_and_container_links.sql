-- Hydration <-> Nutrition Link (#1557, #1629, #2115, #1958, #1925).
--
-- Single migration for the whole feature PR: water/caffeine as first-class
-- nutrients, the container->food link, and the supporting infrastructure.
-- Sections are ordered the same way the implementation phases are, and each
-- is self-contained (idempotent ADD COLUMN/CREATE ... IF NOT EXISTS).
--
-- Do NOT append to this file once it has shipped. utils/dbMigrations.ts records
-- applied migrations by FILENAME in system.schema_migrations, so a section added
-- later never runs on any instance that has already applied this file. Later
-- work gets its own migration file, as usual.
--
-- NOTE for operators: the food_entries section below adds a PRIMARY KEY to
-- food_entries, which has never had one. That is an ACCESS EXCLUSIVE lock plus a
-- full unique-index build on one of the largest tables in the schema, and it runs
-- at server startup. Expect a pause proportional to the row count on a large
-- instance.


-- =============================================================================
-- Phase 1: caffeine_mg as a first-class nutrient (#1958)
-- =============================================================================
--
-- Lands on all THREE tables that carry nutrition, not just food_variants:
-- food_entries and meal_foods denormalize the full nutrient block at log time
-- (see utils/foodEntrySnapshot.ts), so a column added only to food_variants is
-- silently dropped the moment a food is logged.
--
-- numeric with DEFAULT 0 matches every other nutrient column on food_variants;
-- food_entries/meal_foods leave it nullable with no default, also matching
-- their existing nutrient columns (a NULL there means "this snapshot predates
-- the column", which readers coerce to 0).
--
-- Unit is milligrams, encoded in the column name because there is no unit
-- column: 'caffeine' alone would be ambiguous against provider payloads that
-- report grams per 100 g.

ALTER TABLE public.food_variants
  ADD COLUMN IF NOT EXISTS caffeine_mg numeric DEFAULT 0;

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS caffeine_mg numeric;

ALTER TABLE public.meal_foods
  ADD COLUMN IF NOT EXISTS caffeine_mg numeric;

COMMENT ON COLUMN public.food_variants.caffeine_mg IS
  'Caffeine in milligrams per serving_size of this variant. First-class column rather than a custom nutrient so it can be trended, goal-tracked, and imported from providers by alias (see shared/src/nutrients/micronutrientCatalog.ts, fixedField: caffeine_mg).';
COMMENT ON COLUMN public.food_entries.caffeine_mg IS
  'Log-time snapshot of the variant''s caffeine_mg. NULL on rows predating this column.';
COMMENT ON COLUMN public.meal_foods.caffeine_mg IS
  'Log-time snapshot of the variant''s caffeine_mg. NULL on rows predating this column.';

-- Visibility backfill: make caffeine_mg visible for EXISTING users who have
-- saved a customisation. New/untouched users need nothing -- getNutrientDisplayPreferences
-- synthesizes missing rows from defaultNutrients/predefinedNutrients at read
-- time (nutrientDisplayPreferenceService.ts), which already include caffeine_mg
-- once this migration's companion code change lands. Only users who ever SAVED
-- a customisation have a stored row, and those rows are frozen lists that would
-- otherwise never learn about a new nutrient.
--
-- Deliberately ADDITIVE and it DOES modify curated lists. Appends at the END of
-- each array so existing column ORDER is untouched -- that order is user-chosen
-- and is what the grids render.
UPDATE public.user_nutrient_display_preferences AS p
SET visible_nutrients = p.visible_nutrients || to_jsonb('caffeine_mg'::text),
    updated_at = now()
WHERE jsonb_typeof(p.visible_nutrients) = 'array'
  AND NOT (p.visible_nutrients @> to_jsonb(ARRAY['caffeine_mg'::text]));


-- =============================================================================
-- Phase 2: sf_volume_unit_to_ml() helper (#1557/#1629 prep)
-- =============================================================================
--
-- Immutable SQL helper converting a food serving unit to millilitres, or NULL
-- when the unit is not a volume. Mirrors the sf_try_numeric precedent in
-- 20260710000000_add_supplement_nutrients_to_medications.sql.
--
-- TWO UNIT NAMESPACES, AND THEY DISAGREE ABOUT 'oz'.
--
--   Food vocabulary (food_entries.unit, food_variants.serving_unit) --
--     shared/src/utils/servingSizeConversions.ts puts oz: 28.3495 in
--     WEIGHT_TO_GRAMS. Here 'oz' is a WEIGHT ounce and MUST NOT convert to a
--     volume; 4 oz of cheese is not 118 ml of water. It returns NULL below.
--     'fl oz' (fluid ounce, 29.5735 ml) is a distinct, unambiguous volume unit
--     added to this vocabulary specifically so a beverage logged in fl oz gets
--     the volume credit without 'oz' changing meaning for everyone else.
--
--   Water container vocabulary (schemas/waterContainerSchemas.ts, ml|oz|liter) --
--     there 'oz' IS a fluid ounce and services/waterContainerService.ts:6
--     correctly multiplies by 29.5735.
--
-- These two must never share a conversion function.

CREATE OR REPLACE FUNCTION public.sf_volume_unit_to_ml(unit text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
SELECT CASE lower(btrim(coalesce(unit, '')))
    WHEN 'ml'     THEN 1
    WHEN 'l'      THEN 1000
    WHEN 'liter'  THEN 1000
    WHEN 'liters' THEN 1000
    WHEN 'cup'    THEN 236.588
    WHEN 'cups'   THEN 236.588
    WHEN 'tbsp'   THEN 14.7868
    WHEN 'tsp'    THEN 4.92892
    WHEN 'fl oz'  THEN 29.5735
    WHEN 'floz'   THEN 29.5735
    WHEN 'fl_oz'  THEN 29.5735
    ELSE NULL          -- 'oz' is a WEIGHT ounce in the food vocabulary
END::numeric;
$$;

COMMENT ON FUNCTION public.sf_volume_unit_to_ml(text) IS
  'Food serving unit -> millilitres, NULL for non-volume units. Returns NULL for ''oz'' by design: in the food vocabulary oz is a weight ounce. The water-container vocabulary is separate and treats oz as fluid.';


-- =============================================================================
-- Phase 3: water_ml columns + reserved food_entry_id link (#1557, #2115)
-- =============================================================================
--
-- water_ml lands on all THREE nutrition-carrying tables for the same reason
-- caffeine_mg did: food_entries and meal_foods snapshot the block at log time.
--
-- water_ml is DELIBERATELY NOT added to FOOD_VARIANT_NUTRIENT_FIELDS. That list
-- is a SQL generator input (models/supplementSql.ts) as well as a field list;
-- including water there would make supplements report a water dose, add a
-- water column to Reports trends and to the chatbot's nutrition rows, and
-- create a second, uncoordinated day total. Water is a sibling column, not a
-- nutrient in that sense. It is likewise deliberately NOT registered in
-- shared/src/nutrients/micronutrientCatalog.ts (its unit union has no 'ml').
--
-- food_entry_id is added NOW with no writer. Until the container->food link
-- ships (a later phase in this same migration file) it is always NULL, which
-- makes the "exclude food entries already represented by a ledger row" filter
-- a provably-empty predicate. Adding it later would mean shipping the
-- day-total formula twice.
--
-- ON DELETE CASCADE, not SET NULL: a linked ledger row and its food entry are
-- the same logged event. SET NULL would silently turn it into an orphan manual
-- drink the user never logged. The service layer that will use this column
-- removes the ledger row explicitly on user-facing deletes and recomputes the
-- daily aggregate; CASCADE is the orphan guard for paths that bypass the
-- service (see recomputeWaterAggregate, added alongside sf_volume_unit_to_ml
-- above).

ALTER TABLE public.food_variants
  ADD COLUMN IF NOT EXISTS water_ml numeric DEFAULT 0;

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS water_ml numeric;

ALTER TABLE public.meal_foods
  ADD COLUMN IF NOT EXISTS water_ml numeric;

ALTER TABLE public.water_intake_entries
  ADD COLUMN IF NOT EXISTS food_entry_id uuid;

-- food_entries.id has never carried a PRIMARY KEY or UNIQUE constraint across
-- ~185 prior migrations (it's always been referenced FROM, e.g.
-- food_entry_meals.food_entry_id, never referenced TO). The FK below is the
-- first thing that ever points AT food_entries(id), and Postgres refuses a FK
-- to a column with no unique constraint ("no unique constraint matching given
-- keys"). Add it here, idempotently, rather than assuming it already exists;
-- it must run before the FK that depends on it, in the same block.
DO $$
BEGIN
  -- Match on the constraint TYPE, not its name: a database whose primary key
  -- was created under a different name still has one, and ADD CONSTRAINT would
  -- then fail with "multiple primary keys for table" and abort the migration.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype = 'p'
      AND conrelid = 'public.food_entries'::regclass
  ) THEN
    ALTER TABLE public.food_entries ADD CONSTRAINT food_entries_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'water_intake_entries_food_entry_id_fkey'
      AND conrelid = 'public.water_intake_entries'::regclass
  ) THEN
    ALTER TABLE public.water_intake_entries
      ADD CONSTRAINT water_intake_entries_food_entry_id_fkey
      FOREIGN KEY (food_entry_id) REFERENCES public.food_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_water_intake_entries_food_entry_id
  ON public.water_intake_entries (food_entry_id)
  WHERE food_entry_id IS NOT NULL;

COMMENT ON COLUMN public.food_variants.water_ml IS
  'Water content in millilitres per serving_size of this variant. 0/NULL means "unknown"; readers then fall back to the logged volume when the entry''s unit is a volume unit (see public.sf_volume_unit_to_ml). NOTE: ''oz'' in the food unit vocabulary is a WEIGHT ounce and is NOT a volume fallback; ''fl oz'' is.';
COMMENT ON COLUMN public.food_entries.water_ml IS
  'Log-time snapshot of the variant''s water_ml. NULL on rows predating this column.';
COMMENT ON COLUMN public.meal_foods.water_ml IS
  'Log-time snapshot of the variant''s water_ml. NULL on rows predating this column.';
COMMENT ON COLUMN public.water_intake_entries.food_entry_id IS
  'Set when this drink was logged by a container linked to a food (#2115): the diary entry created alongside it. A food entry referenced here is EXCLUDED from the food-derived water sum, so its water is counted exactly once -- here, scaled by hydration_factor. NULL for every manual or provider-synced drink.';

-- Visibility backfill: water_ml -> everywhere EXCEPT 'goal', 'summary',
-- 'quick_info', 'diary' for EXISTING users who have saved a customisation.
--
-- Excluded from the compact surfaces (summary/quick_info/diary) because water
-- already has a dedicated gauge on web (pages/Diary/WaterIntake.tsx) and
-- mobile (HydrationGauge). Putting it in the summary card renders the same
-- number twice, three inches apart, with different rounding.
--
-- Excluded from 'goal' because user_goals.water_goal_ml is the ONE water
-- goal. NUTRIENT_CONFIG (frontend constants/goals.ts) is derived from
-- CENTRAL_NUTRIENT_CONFIG, so adding water_ml there -- which this migration's
-- companion code change must do, to drive the food form -- would otherwise
-- render a second Water input writing goals.water_ml, a column that does not
-- exist. See the limit-goals phase for the full four-gate enforcement; this
-- migration is gate #2 (stored rows never acquire it).
UPDATE public.user_nutrient_display_preferences AS p
SET visible_nutrients = p.visible_nutrients || to_jsonb('water_ml'::text),
    updated_at = now()
WHERE jsonb_typeof(p.visible_nutrients) = 'array'
  AND p.view_group IN ('food_database', 'report_tabular', 'report_chart')
  AND NOT (p.visible_nutrients @> to_jsonb(ARRAY['water_ml'::text]));

-- Defensive: strip water_ml from any 'goal' row that already acquired it
-- (possible if a client saved the goal picker while water_ml was briefly
-- offered between this migration's code change and this backfill).
UPDATE public.user_nutrient_display_preferences AS p
SET visible_nutrients = (
      SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(p.visible_nutrients) WITH ORDINALITY AS t(elem, ord)
      WHERE elem <> to_jsonb('water_ml'::text)
    ),
    updated_at = now()
WHERE p.view_group = 'goal'
  AND jsonb_typeof(p.visible_nutrients) = 'array'
  AND p.visible_nutrients @> to_jsonb(ARRAY['water_ml'::text]);


-- =============================================================================
-- Phase 4: add_food_water_to_intake preference (#1557, #1629)
-- =============================================================================
--
-- Opt-in gate for folding food-derived water into the daily water total.
-- Default FALSE so no existing user's numbers change on upgrade -- that is
-- the entire compat story for this phase.
--
-- Deliberately not named like add_exercise_water_to_goal, which adjusts the
-- GOAL side of the ratio; this adjusts the INTAKE side -- same domain,
-- opposite side.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS add_food_water_to_intake boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_preferences.add_food_water_to_intake IS
  'When true, water_ml on logged food entries (explicit column, or the volume fallback via sf_volume_unit_to_ml) is folded into the daily water total alongside water_intake_entries. A food entry already represented by a linked water_intake_entries row (food_entry_id) is excluded, so nothing double-counts. Default false: opt-in only, so no existing user sees a change on upgrade.';


-- =============================================================================
-- Phase 5: container -> food link (#2115)
-- =============================================================================
--
-- Link a water container to a food, so "+" logs the drink AND the diary
-- entry. Columns on user_water_containers rather than a join table: a user
-- already has many containers, so "multiple linked containers" needs no new
-- cardinality, and every consumer already fetches the whole container row.
--
-- hydration_factor scales ONLY the water credit. Calories, macros, caffeine
-- and alcohol from the linked food always count in full -- a coffee is 100%
-- of its caffeine and (say) 85% of its volume as hydration.
--
-- The ledger row snapshots the factor at log time, following
-- container_name's existing precedent on this table: editing a container
-- later must not silently rewrite yesterday's drinks.

ALTER TABLE public.user_water_containers
  ADD COLUMN IF NOT EXISTS hydration_factor numeric(4,3) NOT NULL DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS linked_food_id uuid,
  ADD COLUMN IF NOT EXISTS linked_variant_id uuid,
  ADD COLUMN IF NOT EXISTS linked_meal_type_id uuid,
  ADD COLUMN IF NOT EXISTS linked_quantity numeric NOT NULL DEFAULT 1;

ALTER TABLE public.water_intake_entries
  ADD COLUMN IF NOT EXISTS hydration_factor numeric(4,3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_water_containers_hydration_factor_range'
                   AND conrelid = 'public.user_water_containers'::regclass) THEN
    ALTER TABLE public.user_water_containers
      ADD CONSTRAINT user_water_containers_hydration_factor_range
      CHECK (hydration_factor >= 0 AND hydration_factor <= 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_water_containers_linked_food_id_fkey'
                   AND conrelid = 'public.user_water_containers'::regclass) THEN
    ALTER TABLE public.user_water_containers
      ADD CONSTRAINT user_water_containers_linked_food_id_fkey
      FOREIGN KEY (linked_food_id) REFERENCES public.foods(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_water_containers_linked_variant_id_fkey'
                   AND conrelid = 'public.user_water_containers'::regclass) THEN
    ALTER TABLE public.user_water_containers
      ADD CONSTRAINT user_water_containers_linked_variant_id_fkey
      FOREIGN KEY (linked_variant_id) REFERENCES public.food_variants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_water_containers_linked_meal_type_id_fkey'
                   AND conrelid = 'public.user_water_containers'::regclass) THEN
    ALTER TABLE public.user_water_containers
      ADD CONSTRAINT user_water_containers_linked_meal_type_id_fkey
      FOREIGN KEY (linked_meal_type_id) REFERENCES public.meal_types(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.user_water_containers.hydration_factor IS
  'Multiplier applied to this container''s water credit (0-2, default 1.0). Scales ONLY hydration; a linked food''s calories, macros, caffeine and alcohol always count in full.';
COMMENT ON COLUMN public.user_water_containers.volume IS
  'Millilitres one press of "+" logs for an UNLINKED container. On a LINKED container it is instead an override meaning "the glass holds more liquid than the food itself" -- a cordial concentrate, an electrolyte tablet, a powder -- and 0 means "no override, take the volume from the linked food".';
COMMENT ON COLUMN public.user_water_containers.linked_quantity IS
  'How much of the linked food one press of "+" logs, in the linked variant''s own serving unit. Replaces servings_per_container for linked containers: the diary entry, and every nutrient on it, scales with this. Meaningless without linked_food_id; always 1 for unlinked containers.';
COMMENT ON COLUMN public.user_water_containers.linked_food_id IS
  'When set, pressing "+" on this container also logs this food to the diary and links the two rows. SET NULL on food deletion so the container survives as a plain water container.';
COMMENT ON COLUMN public.water_intake_entries.hydration_factor IS
  'The factor in force when this drink was logged, snapshotted like container_name so later container edits do not rewrite history. NULL on rows predating the column (treat as 1.0).';


-- =============================================================================
-- Phase 7: alcohol_g as a nutrient (#1925)
-- =============================================================================
--
-- INFORMATIONAL ONLY: alcohol_g NEVER generates calories. Ethanol is 7 kcal/g,
-- but every beer, wine and spirit entry that carries a calorie figure ALREADY
-- includes its ethanol calories -- from the label, from the provider, or from
-- the user copying the label. Deriving calories from alcohol_g here would
-- double-count them on essentially every row that has one. Calories continue to
-- come from the calories column, unchanged, forever.
--
-- Unlike water_ml, alcohol_g DOES belong in FOOD_VARIANT_NUTRIENT_FIELDS:
-- trending it, reporting it and letting a supplement (tinctures are real)
-- declare it are the point of the feature.
--
-- STANDARD DRINKS ARE NEVER STORED. The definition is jurisdictional --
-- US 14 g, UK 8 g (one "unit"), AU/most of EU 10 g, CA 13.45 g, JP 20 g -- so a
-- stored count is wrong for anyone who moves, and wrong retroactively. Grams are
-- the invariant; the count is derived at display time from
-- user_preferences.standard_drink_grams via shared/src/nutrients/alcoholUnits.ts.
--
-- abv_percent lands ONLY on food_variants. It is derivation metadata, not a
-- nutrient: alcohol_g is what the diary sums, and it is computed once at save
-- time (grams = volume_ml * abv/100 * 0.789) rather than re-derived on read.
-- Putting ABV on the water container instead was considered and rejected: most
-- drinks are logged through food search with no container in sight, and
-- OpenFoodFacts' alcohol_100g field IS ABV and needs somewhere to land.

ALTER TABLE public.food_variants
  ADD COLUMN IF NOT EXISTS alcohol_g numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abv_percent numeric;

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS alcohol_g numeric;

ALTER TABLE public.meal_foods
  ADD COLUMN IF NOT EXISTS alcohol_g numeric;

-- Jurisdictional definition of one "standard drink" / "unit", in grams of pure
-- ethanol. Default 14 (US). Purely a display divisor; changing it never rewrites
-- a stored alcohol_g.
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS standard_drink_grams numeric(5,2) NOT NULL DEFAULT 14.00;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'food_variants_abv_percent_range'
                   AND conrelid = 'public.food_variants'::regclass) THEN
    ALTER TABLE public.food_variants
      ADD CONSTRAINT food_variants_abv_percent_range
      CHECK (abv_percent IS NULL OR (abv_percent >= 0 AND abv_percent <= 100));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_preferences_standard_drink_grams_range'
                   AND conrelid = 'public.user_preferences'::regclass) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_standard_drink_grams_range
      CHECK (standard_drink_grams > 0 AND standard_drink_grams <= 50);
  END IF;
END $$;

COMMENT ON COLUMN public.food_variants.alcohol_g IS
  'Grams of pure ethanol per serving_size. INFORMATIONAL ONLY -- never converted to calories; the calories column already includes them. Standard-drink counts are derived from user_preferences.standard_drink_grams, never stored.';
COMMENT ON COLUMN public.food_variants.abv_percent IS
  'Alcohol by volume, 0-100. Derivation metadata for alcohol_g (grams = volume_ml * abv/100 * 0.789), not a nutrient. NOTE: OpenFoodFacts'' alcohol_100g field is ABV and maps HERE, not to alcohol_g. USDA nutrient 1018 is grams/100 g and maps to alcohol_g.';
COMMENT ON COLUMN public.food_entries.alcohol_g IS
  'Log-time snapshot of the variant''s alcohol_g. NULL on rows predating this column.';
COMMENT ON COLUMN public.meal_foods.alcohol_g IS
  'Log-time snapshot of the variant''s alcohol_g. NULL on rows predating this column.';
COMMENT ON COLUMN public.user_preferences.standard_drink_grams IS
  'Grams of ethanol in one standard drink for this user''s jurisdiction. US 14, UK 8 (one unit), AU/EU 10, CA 13.45, JP 20. Display divisor only.';

-- Visibility backfill: make alcohol_g visible for EXISTING users who have
-- saved a customisation, in EVERY view group -- unconditional, exactly like
-- caffeine_mg's backfill above. alcohol_g is goal-eligible
-- (NON_GOAL_NUTRIENT_KEYS is water_ml only) and is in defaultNutrients
-- alongside caffeine_mg (nutrientDisplayPreferenceService.ts), so it must get
-- the identical unconditional treatment -- an earlier draft of this backfill
-- scoped it to food_database/report_tabular/report_chart/diary only, which
-- left it missing (not just unchecked) from a customised user's goal and
-- summary/quick_info option lists.
UPDATE public.user_nutrient_display_preferences AS p
SET visible_nutrients = p.visible_nutrients || to_jsonb('alcohol_g'::text),
    updated_at = now()
WHERE jsonb_typeof(p.visible_nutrients) = 'array'
  AND NOT (p.visible_nutrients @> to_jsonb(ARRAY['alcohol_g'::text]));


-- =============================================================================
-- Phase 8: Limit goals and the weekly alcohol limit (#1925, #1958)
-- =============================================================================
--
-- Daily goal targets for caffeine and alcohol, plus a weekly alcohol limit.
--
-- user_goals and goal_presets are hardcoded-column tables (not a generic
-- key/value store), so a nutrient that appears in the frontend's NUTRIENT_CONFIG
-- -- which is derived from CENTRAL_NUTRIENT_CONFIG, so EVERY nutrient the food
-- form can edit -- renders a goal input that writes to a column of the same name.
-- Without these columns the value is silently dropped by goalRepository.upsertGoal.
--
-- DEFAULT NULL, not a literal. ADD COLUMN ... DEFAULT in modern Postgres fills
-- existing rows, which would silently create a 400 mg caffeine goal for every
-- existing user -- a goal they never set. Nullable keeps the database truthful
-- about what the user chose, and constants/goals.ts DEFAULT_GOALS supplies the
-- number at read time. This is exactly how nullable water_goal_ml already
-- behaves.
--
-- The WEEKLY alcohol limit lives on user_preferences, not user_goals: user_goals
-- rows are per-date and cascade backwards (goal_date NULL = the standing
-- default), so a weekly total stored there is ambiguous about which week it
-- describes. It is one scalar per user, it sits beside standard_drink_grams, and
-- it needs no new table and no new RLS. NULL = no weekly limit set, and it is
-- deliberately NOT defaulted: a weekly alcohol limit is a commitment, not a
-- setting, and pre-filling one invents a goal the user never made.

ALTER TABLE public.user_goals
  ADD COLUMN IF NOT EXISTS caffeine_mg numeric,
  ADD COLUMN IF NOT EXISTS alcohol_g numeric;

ALTER TABLE public.goal_presets
  ADD COLUMN IF NOT EXISTS caffeine_mg numeric,
  ADD COLUMN IF NOT EXISTS alcohol_g numeric;

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS weekly_alcohol_limit_g numeric(7,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_preferences_weekly_alcohol_limit_positive'
                   AND conrelid = 'public.user_preferences'::regclass) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_weekly_alcohol_limit_positive
      CHECK (weekly_alcohol_limit_g IS NULL OR weekly_alcohol_limit_g > 0);
  END IF;
END $$;

COMMENT ON COLUMN public.user_goals.caffeine_mg IS
  'Daily caffeine ceiling in mg. NULL means "use the default" (400, FDA: not generally associated with dangerous effects in healthy adults). Direction defaults to "maximum" via shared BUILTIN_MAXIMUM_GOAL_NUTRIENTS.';
COMMENT ON COLUMN public.user_goals.alcohol_g IS
  'Daily ethanol ceiling in grams. NULL means "use the default" (28 g = 2 US standard drinks, the higher of the two sex-specific US Dietary Guidelines figures -- a default that scolds is worse than one the user raises). Displayed as standard drinks via user_preferences.standard_drink_grams.';
COMMENT ON COLUMN public.user_preferences.weekly_alcohol_limit_g IS
  'Optional weekly ethanol ceiling in grams (NULL = none). Weekly because every published guideline is weekly (UK CMO: 14 units/week) and the daily goal system has no weekly concept. Rolled up from reportRepository.getDailyNutritionTotalsRange, not a stored aggregate.';


-- =============================================================================
-- Phase 9: Caffeine kinetics preferences (#1958)
-- =============================================================================
--
-- Elimination half-life and target bedtime for caffeine kinetics.
--
-- Deliberately NOT sourced from sleep tracking. sleep_entries.bedtime is an
-- OBSERVED bedtime that exists only for nights the user logged, is frequently
-- absent, and would make the caffeine card blank for anyone who does not track
-- sleep. This is a stated intention, so it is a preference.
--
-- target_bedtime is named generically rather than caffeine_bedtime: a second
-- bedtime preference for the next feature that wants one is how this codebase
-- ended up with seven copies of the nutrient key list.
--
-- Half-life default 5 h with a 2-8 h range covers the published adult spread
-- (CYP1A2 genotype, oral contraceptives, smoking, pregnancy). Values outside
-- that are not "power user", they are data entry errors.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS caffeine_half_life_hours numeric(3,1) NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS target_bedtime time without time zone NOT NULL DEFAULT '22:30';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'user_preferences_caffeine_half_life_range'
                   AND conrelid = 'public.user_preferences'::regclass) THEN
    ALTER TABLE public.user_preferences
      ADD CONSTRAINT user_preferences_caffeine_half_life_range
      CHECK (caffeine_half_life_hours >= 2.0 AND caffeine_half_life_hours <= 8.0);
  END IF;
END $$;

COMMENT ON COLUMN public.user_preferences.caffeine_half_life_hours IS
  'Elimination half-life used for the "active caffeine" estimate, 2-8 h, default 5. Population estimate, not a measurement.';
COMMENT ON COLUMN public.user_preferences.target_bedtime IS
  'The user''s intended bedtime, local wall-clock. First consumer is the caffeine cutoff; deliberately generic so a future sleep-goal feature reuses it rather than adding a second bedtime.';
-- =============================================================================
-- Phase 10: Quick-add drink presets (#1958/#1925)
-- =============================================================================
--
-- A preset IS a water container with a linked food. There is deliberately no
-- second preset system: hydration_factor = 0 already expresses "log this drink
-- but credit no water" (an espresso), and a partial factor expresses a beer.
--
-- is_quick_add separates the two populations so that presets neither clutter the
-- diary's container carousel (which cycles linearly) nor become the primary
-- container -- the primary is what healthDataHandlers stamps onto every synced
-- water sample, and a preset winning that election would relabel a user's entire
-- Apple Health hydration history as "Espresso".
--
-- sort_order because created_at ordering is meaningless for a grid the user
-- arranges.

ALTER TABLE public.user_water_containers
  ADD COLUMN IF NOT EXISTS is_quick_add boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_water_containers_user_quick_add
  ON public.user_water_containers (user_id, is_quick_add, sort_order);

COMMENT ON COLUMN public.user_water_containers.is_quick_add IS
  'True for a quick-add drink preset: rendered as a tile grid rather than in the hydration carousel, and never eligible to be the primary container.';
COMMENT ON COLUMN public.user_water_containers.sort_order IS
  'User-arranged order within its group (presets or containers). Ties fall back to created_at.';
