# Phase 1 — Foundation: Types, API Clients, Query Keys, Mode Hook

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained and does not require reading the others first).

## Goal

Build the data-access foundation that every later phase depends on: mobile-side types, REST API clients, TanStack Query keys, and the `useCycleMode()` hook that will drive all mode-conditional UI later. **Nothing renders yet in this phase.** Validate this layer against a real running backend before any screen is built on top of it, to avoid rework from API-shape surprises later.

## Background: the backend this consumes (already built, no server changes needed)

**Tables** (Postgres, RLS Tier 1 = strictly owner-only, not delegatable to family/caregiver accounts): `cycle_settings`, `cycle_daily_entries`, `cycles`, `user_cycle_display_preferences`, `cycle_test_entries`, `pregnancies`, `pregnancy_kick_sessions`, `pregnancy_contractions`, `pregnancy_photos`, `pregnancy_checklist_state`, `health_appointments`.

**`cycle_settings`** (one row per user, the mode switch and preferences): `enabled: boolean`, `mode: 'standard'|'ttc'|'pregnant'|'postpartum'|'menopause'`, `avg_cycle_length_override`, `avg_period_length_override`, `luteal_phase_length` (default 14), `birth_control_method: string`, `conditions: string[]`, `show_fertile_window: boolean`, `preferred_products: string[]`, `dismissed_prompts: string[]`, `terminology: 'default'|'neutral'`, `discreet_mode: boolean`, `onboarded_at` (null until onboarding completed).

**`cycle_daily_entries`** (unique on `user_id, entry_date`): `entry_date`, `flow_level` ('none'|'spotting'|'light'|'medium'|'heavy'), `product_usage JSONB`, `cervical_mucus`, `unusual_discharge string[]`, `energy`/`libido` (1-5), `notes`, `custom_fields JSONB`, `intercourse`, `intercourse_protected`, `cervical_position`. (BBT lives on the existing "basal body temperature" custom measurement, not here. Mood lives in `mood_entries`.)

**`cycles`** (unique on `user_id, start_date`): `start_date`, `end_date`, `period_length`, `cycle_length`, `is_excluded`, `source: 'derived'|'manual'`, `birth_control_method`.

**`user_cycle_display_preferences`**: `view_group: 'today'|'calendar'|'insights'|'care'`, `platform`, `visible_items JSONB` (mobile should write its own `platform` value, not share web's).

**`cycle_test_entries`**: `entry_date`, `tested_at`, `test_type: 'opk'|'hpt'`, `result`, `notes`.

**`pregnancies`** (one `active` per user): `due_date`, `due_date_basis: 'lmp'|'conception'|'manual'|'scan'`, `lmp_date`, `conception_date`, `fetus_count`, `status: 'active'|'completed'|'ended'`, `ended_on`, `outcome`, `prenatal_medication_id`/`supplement_medication_id`, `notes`.

**`pregnancy_kick_sessions`**: `pregnancy_id`, `started_at`/`ended_at`, `kick_count`, `kick_times: TIMESTAMPTZ[]`. **`pregnancy_contractions`**: `pregnancy_id`, `started_at`/`ended_at`, `intensity`. **`pregnancy_photos`**: `pregnancy_id`, `week`, `entry_date`, `file_path`, `notes`. **`pregnancy_checklist_state`**: `pregnancy_id`, `template_key`, `custom_title`, `week`, `completed_at`, `dismissed`. **`health_appointments`**: `pregnancy_id` (nullable), `scheduled_at`, `appointment_type`, `title`, `location`, `notes`, `outcome JSONB`.

**Routes** — `SparkyFitnessServer/routes/v2/cycleRoutes.ts` (base `/api/v2/cycle`): `GET/PUT /settings`; `POST /prompts/dismiss`; `GET/PUT /display-preferences/:viewGroup`; `GET/PUT /logs`, `GET/PUT/DELETE /logs/:date` (`PUT /logs` = bulk); `GET/POST/PUT/DELETE /cycles`, `/cycles/:id`; `GET /overview`; `GET /insights`; `GET/POST/DELETE /tests`, `/tests/:id`; `GET /fertility`; `GET /correlations`; `GET /export`.

**Routes** — `SparkyFitnessServer/routes/v2/pregnancyRoutes.ts` (base `/api/v2/pregnancy`): `GET /current`; `POST /`; `PUT/DELETE /:id`; `GET /overview`; `POST /kicks/start`; `PUT /kicks/:id`; `GET /kicks`; `POST /contractions`; `PUT /contractions/:id`; `GET /contractions`; `POST /photos` (multipart); `GET /photos`; `DELETE /photos/:id`; `GET/PUT/POST /checklist`; `POST/PUT/GET/DELETE /appointments`, `/appointments/:id`.

**Shared logic** — `shared/src/cycle/` (plain TypeScript, framework-free, import via `@workspace/shared`; single source of truth, do not reimplement in mobile):
- `types.ts` — `CycleMode`, `FlowLevel`, `CyclePhase`, `PredictionConfidence`, `RegularityLabel`, `SharedCycleSettings`, `SharedCycleDailyLog`, `SharedCycleTestEntry`, `SharedCycle`, `DerivedCycle`, `CycleStats`, `PredictedCycle`, `CyclePrediction`, `DayEvidence`
- `constants.ts` — `CYCLE_MODES`, `FLOW_LEVELS` (+ `isPeriodEvidenceFlow`), `SYMPTOM_CATEGORY_COLOR`, symptom defs, birth-control-method catalog, cycle-condition catalog
- `fertility.ts` — `estimateOvulation`, `detectBiphasicShift`, `dpo`, `CONCEPTION_PROBABILITY_BY_OFFSET`
- `pregnancy.ts` — `eddFromLmp`, `eddFromConception`, `gestationalAge`; types `PregnancyDueDateBasis`, `PregnancyStatus`, `SharedPregnancy`, `SharedKickSession`, `SharedContraction`, `Trimester`, `GestationalAge`
- (`predictions.ts`, `pregnancyContent.ts`, `content.ts`, `correlations.ts` are used in later phases; not needed for this foundation phase.)

**Known gap, not a blocker:** `shared/src/schemas/database/` has no generated Zod schema for these tables (only `MoodEntries.zod.ts` exists in this domain) — validation lives server-side only in `SparkyFitnessServer/schemas/cycleSchemas.ts`/`pregnancySchemas.ts`. Build against the plain TS types in `shared/src/cycle/*` directly; this is expected and fine. Do not add Zod schemas as part of this plan — that's a separate follow-up.

## Mobile conventions to follow (verified against current code)

- API clients live one-file-per-domain in `src/services/api/` as thin wrappers over `apiFetch` from `apiClient.ts` (handles auth/proxy headers). Multipart/file uploads bypass `apiFetch` and set headers manually — see `exerciseApi.ts`'s custom-exercise-image upload for the pattern.
- TanStack Query 5, default `staleTime: Infinity` — every mutation must explicitly invalidate affected query keys; nothing auto-refetches on a timer. Query key builders live in `src/hooks/queryKeys.ts`.
- `useRefetchOnFocus(refetch, enabled)` is the standard "refresh on screen focus" hook.
- Closest existing analog for "upsert-by-day check-in data with explicit null-vs-undefined semantics": `src/types/measurements.ts`, `src/services/api/measurementsApi.ts`, `src/hooks/useMeasurements.ts`, `src/hooks/useUpsertCheckIn.ts`.
- Closest existing analog for "start/stop live session" (relevant later for kicks/contractions, note now for hook shape consistency): `src/hooks/useFastingTimer.ts`.
- `@/*` maps to `SparkyFitnessMobile/`; `@workspace/shared` maps to `../shared/src/index.ts`. Prefer shared schemas/constants/types over local duplicates.

## Tasks

### 1. Types — `src/types/womensHealth.ts` (new)
Mobile view-model types layered on `shared/src/cycle/*` where the API/UI needs shapes not defined there (list/pagination wrappers, screen-local derived shapes). Pattern off `src/types/measurements.ts`. Import and re-use `CycleMode`, `FlowLevel`, `SharedCycleSettings`, `SharedCycleDailyLog`, `SharedPregnancy`, etc. from `@workspace/shared` rather than redefining them.

### 2. API clients (`src/services/api/`)
- **`cycleApi.ts`** (new) — implements every `/api/v2/cycle/*` endpoint listed above. Pattern off `measurementsApi.ts`: thin `apiFetch` wrapper functions, one per endpoint, explicit `null` (clear field) vs `undefined` (leave unchanged) semantics on upsert-style calls (settings PUT, log PUT).
- **`pregnancyApi.ts`** (new) — implements every `/api/v2/pregnancy/*` JSON endpoint (current/overview, pregnancy CRUD, kicks, contractions, checklist, appointments). Same `apiFetch` pattern.
- **`pregnancyPhotosApi.ts`** (new, separate file) — multipart-only: upload/list/delete pregnancy photos. Bypasses `apiFetch`, manual `FormData` + header injection, pattern off `exerciseApi.ts`'s custom-exercise-image upload. Kept separate from `pregnancyApi.ts` because it's the only multipart surface in this domain — the file boundary makes that obvious.

### 3. Query keys — additions to `src/hooks/queryKeys.ts`
```
cycleSettingsQueryKey = ['cycleSettings']
cycleLogQueryKey(date) = ['cycleLog', date]
cycleLogsRangeQueryKey(start, end) = ['cycleLogsRange', start, end]
cyclesQueryKey = ['cycles']
cycleOverviewQueryKey = ['cycleOverview']
cycleInsightsQueryKey = ['cycleInsights']
cycleFertilityQueryKey = ['cycleFertility']
cycleTestsQueryKey = ['cycleTests']
cycleCorrelationsQueryKey = ['cycleCorrelations']
cycleDisplayPreferencesQueryKey = ['cycleDisplayPreferences']
pregnancyCurrentQueryKey = ['pregnancyCurrent']
pregnancyOverviewQueryKey = ['pregnancyOverview']
pregnancyKicksQueryKey(sessionId?) = ['pregnancyKicks', sessionId ?? 'current']
pregnancyContractionsQueryKey = ['pregnancyContractions']
pregnancyChecklistQueryKey = ['pregnancyChecklist']
pregnancyAppointmentsQueryKey = ['healthAppointments']
pregnancyPhotosQueryKey = ['pregnancyPhotos']
```

Invalidation rules to implement in the mutation hooks (this phase defines the contract; later phases' hooks must honor it):
- **Daily log upsert** (widest blast radius): invalidate `cycleLogQueryKey(date)`, any `cycleLogsRangeQueryKey` covering that date, `cyclesQueryKey`, `cycleOverviewQueryKey`, `cycleInsightsQueryKey`, `cycleFertilityQueryKey`.
- **Kick session start/update**: invalidate `pregnancyKicksQueryKey` + `pregnancyOverviewQueryKey`.
- **Contraction CRUD**: same as kicks.
- **Test entry CRUD**: invalidate `cycleTestsQueryKey` + `cycleFertilityQueryKey`.
- **Photo upload/delete**: invalidate `pregnancyPhotosQueryKey` only.
- **Settings PUT**: invalidate `cycleSettingsQueryKey` broadly (mode changes ripple into every screen).
- Static content (articles, checklist templates, food/med safety lookups, used in later phases) needs no query — plain synchronous imports from `shared/src/cycle/content.ts`/`pregnancyContent.ts`.

### 4. Hooks (`src/hooks/`)
- **`useCycleSettings.ts`** (new) — `useQuery` over `cycleApi.getSettings` keyed by `cycleSettingsQueryKey`, plus a `useMutation` wrapper for `cycleApi.putSettings` that invalidates `cycleSettingsQueryKey`.
- **`useCycleMode.ts`** (new) — thin derived hook wrapping `useCycleSettings()`, returning `{ mode, enabled, discreetMode, terminology, isLoading }`. This is the **single source of truth** every later-phase screen/component must call for mode-conditional rendering (Today view swap, TTC widget visibility, Care hub branch, AddSheet label) — never re-derive "is pregnant" from raw settings in more than one place.

### 5. Risk check to perform in this phase (do not skip)
Before finalizing `useCycleMode()`'s contract, **verify whether mobile has any "acting as a delegated/family user" auth context** (grep `useAuth`, `ServerConfigModal`, and related auth hooks/services for delegation or "acting as" state). All 11 tables in this domain are Tier-1 RLS, strictly owner-only, **not delegatable**. If such a context exists on mobile, `useCycleMode()` must be able to report "unavailable" for delegated sessions so later phases can hide the feature entirely (not just disable it) rather than exposing owner-only data through a delegate's session.

### 6. Dependency checks to perform in this phase (needed by later phases, cheap to confirm now)
- Confirm `expo-image-picker` is already a dependency (used in `FoodScanScreen.tsx`) — needed by Phase 7 (Pregnancy hub / Bump Photo Journal).
- Confirm whether `react-native-svg` is present — needed by Phase 7/9 to decide the `WombScene` illustration approach (static image vs SVG).

## Verification
- Nothing renders yet — validate by pointing a throwaway test screen or Jest fixture test at each new API client function against a real running backend (`pnpm start` from `SparkyFitnessServer/`). Confirm response shapes match `shared/src/cycle/types.ts`/`pregnancy.ts` before Phase 2 begins.
- Run `pnpm run validate` (typecheck + lint) from `SparkyFitnessMobile/`.
- Add `__tests__/hooks/useCycleSettings.test.ts`, `__tests__/hooks/useCycleMode.test.ts`, `__tests__/services/api/cycleApi.test.ts`, `__tests__/services/api/pregnancyApi.test.ts` and run `pnpm run test:run -- --watchman=false --runInBand`.

## Next phase
`02-settings-onboarding.md` — builds the settings screen and onboarding wizard on top of `useCycleSettings`/`useCycleMode`.
