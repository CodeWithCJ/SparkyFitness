# 02 — Data Model & API

First-cut schema, API contracts, and shared types. Follows existing SparkyFitness conventions
verified in the codebase:

- `uuid` PKs (`gen_random_uuid()`), `user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE`.
- `created_at` / `updated_at TIMESTAMPTZ` + `trigger_set_timestamp` trigger.
- **Lookup tables + FK** instead of CHECK enums (pattern: `external_provider_types`, mig `20260122201500`).
- **`source VARCHAR(50) NOT NULL DEFAULT 'manual'`** for provenance (pattern: `custom_measurements`).
- **`custom_fields JSONB DEFAULT '{}'`** open extension column (pattern: `custom_nutrients JSONB`).
- **Snapshot** definition values into log rows (pattern: snapshot exercise/food details in entries).
- Owner-centric RLS + family/on-behalf-of, **but default private**.
- Cascading deletes wired per the comprehensive-cascade migrations.

> This is a design sketch to start from, not final DDL. Refine column-by-column at build time.

## Lookup tables (seeded, user-extensible)

```
medication_types            (id VARCHAR PK, display_name, description, counting_unit_default, is_injectable BOOL, sort_order)
  seed: pill, capsule, tablet, liquid, injection, patch, inhaler, drops, cream, suppository, other
medication_schedule_types   (id VARCHAR PK, display_name, description)
  seed: daily, specific_days, every_n_days, cyclic, weekly, monthly, prn, taper
medication_route_types      (id VARCHAR PK, display_name)   -- oral, subcutaneous, topical, inhaled, ...
```
Users can INSERT their own rows (admin-scoped or per-user `user_id` nullable column for custom types — mirror how custom categories work).

## Core tables

```
medications
  id, user_id, name, display_name (alias; name = stable id, like custom_categories),
  type_id        -> medication_types,
  route_id       -> medication_route_types (nullable),
  strength_value NUMERIC, strength_unit VARCHAR,   -- e.g. 500 mg, 1.0 mg, 5000 IU
  dose_amount    NUMERIC, dose_unit VARCHAR,        -- amount taken per administration
  rxnorm_rxcui   VARCHAR (nullable; set only if user enabled lookups),
  ndc            VARCHAR (nullable),
  prescriber     TEXT, pharmacy TEXT, rx_number TEXT,   -- free text, no live API
  reason_text    TEXT,                                  -- "why am I taking this" (condition)
  color, icon, photo_path,                              -- photo via uploadMiddleware
  is_active BOOL, is_quick BOOL,                         -- quick-add, like is_quick_food
  is_glp1 BOOL,                                          -- flags the GLP-1 coach module
  notes TEXT,
  source DEFAULT 'manual', custom_fields JSONB DEFAULT '{}',
  shared_with VARCHAR DEFAULT 'private',                 -- private | family (NOT public by default)
  created_at, updated_at

medication_schedules            -- one row per timing rule; a med can have several
  id, medication_id -> medications, user_id,
  schedule_type_id -> medication_schedule_types,
  time_of_day TIME,             -- e.g. 08:00 (multiple rows = multiple times/day)
  dose_amount NUMERIC,          -- per-time amount (overrides med default)
  days_of_week INT[],           -- for specific_days  (0=Sun..6=Sat)
  interval_days INT,            -- for every_n_days
  cycle_on_days INT, cycle_off_days INT,   -- for cyclic (X on / Y off)
  with_meal VARCHAR,            -- before/with/after meal anchor (nullable)
  prn_reason TEXT, prn_max_per_day INT,    -- for PRN
  start_date DATE, end_date DATE,          -- supports tapers/titration windows
  active BOOL,
  source, custom_fields, created_at, updated_at

medication_entries                 -- one row per take/skip event
  id, medication_id -> medications, schedule_id (nullable), user_id,
  status VARCHAR,               -- taken | skipped | snoozed | prn_taken
  taken_at TIMESTAMPTZ,         -- auto-timestamp
  scheduled_for TIMESTAMPTZ,    -- the slot it satisfies (nullable for PRN)
  -- SNAPSHOT (so editing the med later doesn't rewrite history):
  med_name_snapshot, dose_amount_snapshot, dose_unit_snapshot,
  notes TEXT, source, custom_fields, created_at, updated_at

medication_inventory
  id, medication_id, user_id,
  quantity NUMERIC, counting_unit VARCHAR,   -- pills | mL | pens | doses | patches ...
  low_stock_threshold NUMERIC,
  refill_due_date DATE (nullable; or computed from dose rate),
  last_refill_at, expiry_date,
  source, custom_fields, created_at, updated_at

medication_cost_entries                -- manual, clearly self-entered
  id, medication_id, user_id, period_month DATE,
  out_of_pocket NUMERIC, savings NUMERIC, deductible_applied NUMERIC,
  currency VARCHAR, note TEXT, created_at, updated_at
```

## GLP-1 module tables

```
injection_entries
  id, medication_id, user_id, injected_at TIMESTAMPTZ,
  site VARCHAR,           -- one of 8 zones (left/right x abdomen/thigh/arm/...) - lookup or enum-lite
  dose_mg NUMERIC, pen_id (nullable),
  notes, source, custom_fields, created_at

medication_pens                 -- pen / vial inventory
  id, medication_id, user_id,
  label, dose_mg, doses_total INT, doses_used INT,
  status VARCHAR,         -- sealed | in_use | finished
  opened_at, expiry_date, reorder_flag BOOL,
  created_at, updated_at

medication_titration_steps      -- also powers generic tapers
  id, medication_id, user_id,
  dose_mg NUMERIC, start_date DATE, planned_weeks INT,
  status VARCHAR,         -- done | active | planned
  is_taper BOOL, note TEXT, created_at, updated_at
```
PK curve needs no table — computed on read from `injection_entries` + a static half-life constant
per drug (kept in a small reference map in code, e.g. `shared/`).

## Symptoms tables (extensible like custom nutrients/measurements)

```
user_custom_symptoms            -- mirror user_custom_nutrients
  id, user_id, name, display_name, scale_type VARCHAR ('1-10'|'none-severe'|'count'|'text'),
  unit, is_glp1_flagged BOOL, UNIQUE(user_id, name)

symptom_entries
  id, user_id, symptom_id (nullable for built-ins), symptom_name_snapshot,
  severity NUMERIC, severity_label VARCHAR,
  logged_at TIMESTAMPTZ, body_location VARCHAR,   -- body-map pin
  context_text TEXT,                              -- "what/when did you eat"
  bristol_type INT,                               -- 1-7 (nullable)
  source, custom_fields, created_at
```
Vitals (BP, HR, temp) are **NOT** new tables — log them through existing `custom_measurements` /
`text_measurements` so they flow into existing reports and the correlation engine.

## Display preferences (mirror user_nutrient_display_preferences)

```
user_medication_display_preferences
  id, user_id, view_group VARCHAR, platform VARCHAR, visible_items JSONB,
  UNIQUE(user_id, view_group, platform)
```
Lets users choose which KPI tiles / symptoms / charts appear, per view, per platform.

## RLS

- Reuse the owner-centric policy helpers and family-access policies from `rls_policies.sql`.
- **Default `shared_with = 'private'`** for `medications` (do NOT inherit foods' default-public).
- Family/caregiver read/write goes through `onBehalfOfMiddleware` + `permissionUtils` like existing on-behalf flows.
- Update `SparkyFitnessServer/db/rls_policies.sql` and regenerate `db_schema_backup.sql`.

## API surface (`/api/medications`, server controller/service/repository pattern)

```
GET    /api/medications                       list (active/all, filters)
POST   /api/medications                       create
GET    /api/medications/:id                   detail (+ schedules, inventory, costs)
PUT    /api/medications/:id                   update
DELETE /api/medications/:id                   delete (cascade)

POST   /api/medications/:id/schedules         add schedule rule
PUT    /api/medications/schedules/:sid
DELETE /api/medications/schedules/:sid

GET    /api/medications/today                 due/overdue/PRN for a date (timezone-aware)
POST   /api/medications/:id/logs              log take/skip/snooze
GET    /api/medications/adherence             %/streak/grid over range

PUT    /api/medications/:id/inventory         stock + thresholds
POST   /api/medications/:id/costs             manual cost entry

-- GLP-1
POST   /api/medications/:id/injections        log injection (+ site, pen)
GET    /api/medications/:id/glp1/pk           computed PK curve points
CRUD   /api/medications/:id/glp1/pens
CRUD   /api/medications/:id/glp1/titration

-- Symptoms
CRUD   /api/symptoms/custom                   user_custom_symptoms
POST   /api/symptoms/logs
GET    /api/symptoms/logs?range=...

-- Enrichment (opt-in only; 403 if setting off)
GET    /api/medications/lookup/rxnorm?name=
GET    /api/medications/lookup/label?rxcui=|ndc=
GET    /api/medications/interactions?rxcuis=

-- Prefs
GET/PUT /api/medications/display-preferences
```

## Shared types

Put cross-platform types in `shared/` (`@workspace/shared`) so web + mobile share them:
`Medication`, `MedicationSchedule`, `MedicationLog`, `Glp1Injection`, `Glp1Pen`,
`TitrationStep`, `SymptomLog`, `MedicationType`, plus the GLP-1 half-life reference map for PK.
Keep day values as `YYYY-MM-DD` strings until the DB/API boundary; use `timezoneLoader.ts`.

## Migration checklist (per repo AGENTS.md)

1. New migration(s) in `SparkyFitnessServer/db/migrations/` (lookup tables first, then core, then GLP-1/symptoms).
2. Seed lookup tables.
3. Add RLS policies to `rls_policies.sql` (default-private for medications).
4. Wire cascading deletes.
5. Regenerate root `db_schema_backup.sql`.
6. Ensure med tables are covered by `backup_settings` export/import.
