# Phase 3 — GLP-1 Coach  (PRIORITIZED — full build spec)

> **Status:** ◐ in progress
> **Depends on:** the GLP slice of Phase 0 (schema) — bundled into this build
> **Resume here:** _Migration written (`20260624000000_add_medication_glp1_schema.sql`). Next: server repositories → services → routes → shared types wired → frontend page._

This is the **priority track**. It bundles the minimum foundation + the full GLP feature set so a
GLP user gets a complete, shippable experience. Naming follows the existing `_entries` convention.

## Scope = "everything GLP needs"

### Core GLP features (from mockup + market research)
- **Injection logging** with 8-zone **site rotation** (last-used / wait-7d / suggested-next) + **lipohypertrophy warning**.
- **Dose schedule + reminders + countdown** to next shot; **missed-dose guide** (drug-specific timing rules).
- **Titration / taper plan** (ordered dose-change steps with dates + status) — generic enough for tapers too.
- **Pen AND vial inventory** with **concentration, volume, doses, BUD (beyond-use date)**; **auto-deduct** a dose on each injection; reorder flag. *(New from 2026 research — covers self-managed/compounded users.)*
- **PK serum-level curve** from published half-lives + **"shot phases"** annotation (peak/fade → hunger/energy shifts). Labeled **"model, not measured."**
- **Oral GLP-1 fasting timer** (e.g., Rybelsus 30-min water-only countdown).
- **GLP daily check-in** (hunger / food-noise / cravings / fullness / nausea) — **reuse existing CheckIn + `mood_entries`** where possible.
- **Side-effect logging** (nausea etc.) via `symptom_entries` — needed for the nausea-vs-dose story.
- **Progress photos** (optional, side-by-side) via existing `uploadMiddleware`. *(New from research.)*
- **Weight trend** — **reuse existing measurements**; wearable weight import reuses existing Garmin/Withings/Fitbit/Google Health integrations.

### Trimmed (do NOT build) 🔴
Community cohort / percentile-vs-N-users; CGM glucose forecasting; live pricing. Clinical-trial
**reference lines** allowed as static data (Phase 7).

## Tables (in the migration — `_entries` convention, no `glp1_` prefix)

| Table | Role |
|---|---|
| `medication_types` | lookup (seeded incl. `injection`); user-extensible later |
| `medications` | the drug definition (`is_glp1` flag, strength, dose, etc.) |
| `medication_schedules` | timing rules (weekly shot, oral daily, taper windows) |
| `medication_entries` | generic dose taken/skipped/snoozed (adherence/Today) |
| `injection_entries` | a logged shot: site, dose_mg, pen/vial ref (auto-deducts) |
| `medication_pens` | pen **and vial** inventory: concentration, volume, doses, BUD/expiry, status, reorder |
| `medication_titration_steps` | titration + taper steps |
| `user_custom_symptoms` | user-defined side effects (mirror `user_custom_nutrients`) |
| `symptom_entries` | side-effect log (severity, body_location, bristol_type) |

PK curve = computed on read (no table); half-life reference map lives in `shared/`.
Vitals reuse `custom_measurements`. Display prefs (`user_medication_display_preferences`) deferred.

## Build order (resumable checkpoints)

1. **DB migration** — all 9 tables + indexes + `trigger_set_timestamp` + RLS helper calls (`create_library_policy('medications','false',…)` private; `create_diary_policy(...)` for entries). ✅ written.
   - Update `db/rls_policies.sql`; regenerate root `db_schema_backup.sql` (run app/DB).
2. **Shared types** in `shared/` — `Medication`, `MedicationSchedule`, `MedicationEntry`, `InjectionEntry`, `MedicationPen`, `TitrationStep`, `SymptomEntry`, `MedicationType`, + `GLP1_HALF_LIVES` reference map + PK calc helper.
3. **Server repositories** (`models/`): `medicationRepository.ts`, `injectionRepository.ts`, `medicationPenRepository.ts`, `titrationRepository.ts`, `symptomRepository.ts` — follow `moodRepository.ts` / `measurementRepository.ts` patterns; respect `onBehalfOfMiddleware`/`permissionUtils`.
4. **Server services** (`services/`): `medicationService.ts` (CRUD, adherence), `glp1Service.ts` (PK curve, shot phases, site-rotation suggestion, pen auto-deduct, missed-dose guide).
5. **Routes** (`routes/`): `medicationRoutes.ts`, `injectionRoutes.ts` (+ register in `SparkyFitnessServer.ts`). Mirror `moodRoutes.ts`/`fastingRoutes.ts`.
6. **Frontend api + types** (`src/api`, `src/types`): client for the above.
7. **Frontend page** `pages/Medications/` with **GLP-1 sub-tab** first: SiteRotationMap, InjectionLogSheet, PKChart, TitrationTimeline, PenVault(pens+vials), FastingTimer, NextShotCountdown. Reuse `chart.tsx`, `NumericInput`, `DateRangeWithPresets`.
8. **Nav + flag**: add `/medications` tab in `MainLayout.tsx` behind a feature flag; quick "Log shot" in the Add menu.
9. **Tests**: repository + service unit tests (PK calc, site suggestion, auto-deduct, adherence) following `tests/` patterns.

## Data needs
The 9 tables above; static half-life map; existing measurements/check-in for weight + wellness;
`uploadMiddleware` for progress photos.

## UI components
- New: SiteRotationMap, PKChart, TitrationTimeline, PenVault, FastingTimer, InjectionLogSheet, NextShotCountdown, MissedDoseGuide.
- Reuse: recharts/`chart.tsx`, `NumericInput`, `FoodUnitSelector`, `DateRangeWithPresets`, CheckIn data, measurements, uploads.

## Acceptance criteria
- [ ] Migration applies cleanly; `db_schema_backup.sql` regenerated; meds private by RLS (user A can't see user B).
- [ ] Log an injection → site recorded, pen/vial **auto-deducts** a dose, next-site suggestion + lipo warning correct.
- [ ] PK curve renders from real injections with shot-phase annotation; labeled a model.
- [ ] Titration steps drive the plan; taper works as a dose-change series.
- [ ] Pen **and vial** (concentration/volume/BUD) tracked; reorder flag triggers at threshold.
- [ ] Fasting timer counts down + notifies; missed-dose guide shows correct drug-specific guidance.
- [ ] Side effects log to `symptom_entries`; weight trend reads existing measurements.
- [ ] `pnpm run validate` + `pnpm test` pass in server and frontend.

## Resume-here notes
_Migration is written. Pick up at build-order step 2 (shared types) → step 3 (repositories)._
