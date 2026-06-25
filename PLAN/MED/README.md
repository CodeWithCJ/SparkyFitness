# MedDiary — Medicine & GLP-1 Tracker for SparkyFitness

> Master index + **resumable status tracker** for the medication / GLP-1 module.
> If work was paused, start here, find the first phase that isn't ✅, open its folder, read "Resume here".

*Last updated: 2026-06-24*

## What this is

A new top-level module that brings **medication tracking** (any drug) and a **GLP-1 coach**
(Wegovy/Ozempic/Mounjaro/Zepbound, etc.) into SparkyFitness. Prototyped in lovable.dev as 7
screens (see [`mockup-walkthrough.md`](./mockup-walkthrough.md)); this folder turns that into a
buildable, phased plan honest about what a **self-hosted** app can actually do.

## Guiding decisions (locked with the user)

| Decision | Choice |
|---|---|
| Scope | Cover **everything** — general med tracker **and** GLP-1 flagship. Don't drop categories. |
| Drug data | **Opt-in** free/open APIs (RxNorm + openFDA + DailyMed). Manual by default; only drug name/NDC ever leaves the box. |
| Ambition | **Trim the fantasy** — no CGM hardware, no live community cohort, no heavy ML. Build from manual input + data the app already has. |
| Platform | **Web first** (`SparkyFitnessFrontend`); Expo mobile follows. |
| Customization | Match the app's existing extensibility DNA (lookup tables, custom nutrients/measurements, display prefs, presets, sharing). See [`01-feasibility-selfhosted.md`](./01-feasibility-selfhosted.md) and [`02-data-model.md`](./02-data-model.md). |

## Documents

| Doc | Purpose |
|---|---|
| [`00-market-research.md`](./00-market-research.md) | Top apps in the category + what to borrow, with sources |
| [`01-feasibility-selfhosted.md`](./01-feasibility-selfhosted.md) | Open data sources, manual-vs-automated, cut features, disclaimers |
| [`02-data-model.md`](./02-data-model.md) | Postgres schema, lookup tables, JSONB extension, API contracts, shared types |
| [`03-navigation-and-ux.md`](./03-navigation-and-ux.md) | Where it lives in the app, layout, reuse of existing components |
| [`mockup-walkthrough.md`](./mockup-walkthrough.md) | Screen-by-screen description of all 7 mockups |
| [`screenshots/`](./screenshots/) | Drop the 7 PNGs here to reference them inline (see note below) |

> **Screenshots note:** the 7 mockup images were pasted into chat, not provided as files, so
> they could not be written here programmatically. Drop them into `screenshots/` and the
> walkthrough will link them. The lovable *source code* (scaffold only — the rendered screens
> are the real spec) is already preserved in the repo at
> `WIP/lovable-project-c0e8aa65-3b0a-4e44-861b-c052f71ae820-2026-06-21.zip`, so it is not duplicated here.

## Phase tracker (resume here)

Each phase is independently shippable. Web-first. Status: ☐ not started · ◐ in progress · ✅ done.

| # | Phase | Folder | Status | Ships value on its own? |
|---|---|---|---|---|
| 0 | Foundation (schema, nav, plumbing) | [`phases/phase-0-foundation`](./phases/phase-0-foundation/) | ☐ | Enables everything else |
| 1 | Medicine Cabinet (general meds CRUD) | [`phases/phase-1-medicine-cabinet`](./phases/phase-1-medicine-cabinet/) | ☐ | ✅ usable med list |
| 2 | Scheduling, Adherence & Reminders | [`phases/phase-2-scheduling-adherence`](./phases/phase-2-scheduling-adherence/) | ☐ | ✅ daily "take/skip" + adherence |
| 3 | **GLP-1 Coach (PRIORITIZED)** | [`phases/phase-3-glp1-coach`](./phases/phase-3-glp1-coach/) | ◐ | ✅ flagship differentiator |
| 4 | Symptoms & Side-Effects Tracker | [`phases/phase-4-symptoms-tracker`](./phases/phase-4-symptoms-tracker/) | ☐ | ✅ standalone symptom log |
| 5 | Reporting & Charts | [`phases/phase-5-reporting-charts`](./phases/phase-5-reporting-charts/) | ☐ | ✅ provider-ready export |
| 6 | Opt-in Data Enrichment (RxNorm/openFDA) | [`phases/phase-6-data-enrichment`](./phases/phase-6-data-enrichment/) | ☐ | ✅ autocomplete + drug info |
| 7 | Advanced Insights (trimmed) | [`phases/phase-7-advanced-insights`](./phases/phase-7-advanced-insights/) | ☐ | nice-to-have |

**Dependencies:** 1–7 all require 0. 3/4 read better with 2 but don't hard-depend on it. 5 reads
from 1–4. 6 enriches 1. 7 reads from everything + existing app data. Mobile is a parallel track
after web Phase 2.

### GLP-1 build progress (resume here)
- ✅ DB migration `SparkyFitnessServer/db/migrations/20260624000000_add_medication_glp1_schema.sql` (12 tables, `_entries` naming, no RLS inline; incl. `user_medication_display_preferences` for per-view customization + `day_of_month` for monthly schedules).
- ✅ RLS added to `SparkyFitnessServer/db/rls_policies.sql` (medications private via library policy; entries via diary policy) — reapplied on every startup.
- ✅ Shared GLP logic `shared/src/medications/glp1.ts` (half-life profiles, PK curve, 8-zone site rotation) — exported + typechecks.
- ⏭️ **Next:** regenerate `db_schema_backup.sql` via `db_backup.sh` (needs a running DB) → server repositories (`models/medicationRepository.ts`, …) → services (`medicationService.ts`, `glp1Service.ts`) → routes → frontend page. See [`phases/phase-3-glp1-coach`](./phases/phase-3-glp1-coach/) build order.

## Cross-package rules to honor (from repo `AGENTS.md`)

- Migrations: update `SparkyFitnessServer/db/migrations/`, regenerate root `db_schema_backup.sql`, and update `SparkyFitnessServer/db/rls_policies.sql` when access behavior changes.
- Day strings stay `YYYY-MM-DD` until a DB/external-API boundary; use `@workspace/shared` + `timezoneLoader.ts`, not `toISOString().split('T')[0]`.
- Auth/API-contract changes need a quick check in both web and mobile.
- All new user-facing strings go through i18n; respect the user's language/unit/energy preferences.
