# Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile — Overview & Master Reference

> This folder is a full implementation plan handed off between AI sessions/tools (originally Claude, to be completed by another AI). Every phase file (`01-...` through `08-...`) is written to be **fully self-contained**: each repeats the reference material it needs rather than saying "see overview." This file (`00-overview.md`) is the master index and the canonical copy of all shared reference tables (Sections A-D). If a phase file and this file ever disagree after edits, prefer whichever was edited more recently and reconcile the other.

## Context

SparkyFitness's web frontend (`SparkyFitnessFrontend/`) has a full reproductive-health tracking feature — menstrual cycle logging, trying-to-conceive (TTC) tools, pregnancy tracking, and a postpartum/menopause-aware mode, plus an educational "Care" hub (articles, appointments, birth prep, doctor reports). It lives behind a per-user settings toggle (mode: `standard | ttc | pregnant | postpartum | menopause`) and a standalone `/cycle` route. Today this is **web-only** — mobile users must open the web app to use it. The goal of this plan is to port the entire feature to `SparkyFitnessMobile/` (Expo SDK 56 / React Native 0.85 / React Navigation 7) so mobile is fully self-sufficient for this feature, with **no web dependency**, while matching the mobile app's existing architecture, data, and design conventions.

Decisions already made with the user (do not re-litigate):
- **Build all modes together in one effort** (not a phased public rollout) — however, the *build sequence* in Section F still matters for minimizing rework and keeping each layer testable, so treat the phase files below as an internal implementation order within that one effort, not as separate ship points.
- **Offline support is explicitly out of scope.** This feature behaves like every other mobile feature: it requires live connectivity to the server (no local draft/queue system needed).
- **Navigation entry point:** surfaced from the existing bottom-tab `AddSheet` ("+" quick-entry sheet), not a persistent bottom tab and not nested only in Settings — mirroring web's own decision to keep `/cycle` out of primary nav and surface it conditionally.
- **Bump Photo Journal is in scope**, using `expo-image-picker` (verify it's already a dependency; if not, add it) uploading through the existing pregnancy-photos multipart API.
- **Visual direction:** introduce a small, scoped "wellness sub-theme" (soft rose/lavender accent palette + a small amount of illustrated content, e.g. a trimester scene analogous to web's `WombScene`) layered on top of existing mobile UI primitives — not a wholesale redesign, and not reusing the plain neutral theme everywhere.

## Folder index

```
mobile-womens-health-plan/
  00-overview.md            -- this file: context + master reference (Sections A-D)
  01-foundation.md          -- Phase 1: types, API clients, query keys, useCycleMode hook
  02-settings-onboarding.md -- Phase 2-3: settings screen + first-run onboarding
  03-core-cycle.md          -- Phase 4: CycleHubScreen shell, Today/Log, Calendar, glyphs
  04-insights.md            -- Phase 5: Insights/correlations/trend charts
  05-ttc.md                 -- Phase 6: TTC hub (fertility, BBT, tests, intercourse log)
  06-pregnancy.md           -- Phase 7: Pregnancy hub (largest phase, incl. bump photos)
  07-care-hub.md            -- Phase 8: Care hub (articles, appointments, birth prep, doctor report)
  08-navigation-polish.md   -- Phase 9-10: AddSheet wiring, wellness sub-theme, discreet mode, tests, docs
  09-remaining-pregnancy-and-theme.md -- CURRENT-STATE spec for remaining pregnancy cards + wellness sub-theme (supersedes pregnancy/theme parts of 06 & 08)
```

> **Status note (updated after partial build):** Phases 1-5 (foundation, settings, onboarding, core cycle, insights), the TTC hub, and the pregnancy-hub *core* (setup, week banner, baby growth, kick counter, contraction timer) are already implemented. The remaining pregnancy cards (weekly checklist, bump photos, vitals, food/med safety, appointments) and the wellness sub-theme are specified — grounded in the actual current code — in **`09-remaining-pregnancy-and-theme.md`**. The Care hub is intentionally NOT being built. For outstanding work, start from file 09; files 06 and 08 are historical context.

Work through phases roughly in this order (01 → 08); see Section F for the full rationale and dependency reasoning. Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/` after completing each phase, not just at the end.

---

## A. Existing Backend (already built — no server changes required)

All REST endpoints and database tables already exist and are stable. Mobile only needs to consume them.

**Tables** (all Postgres, RLS Tier 1 = strictly owner-only, **not delegatable to family/caregiver accounts** — see Risk section G): `cycle_settings`, `cycle_daily_entries`, `cycles`, `user_cycle_display_preferences`, `cycle_test_entries`, `pregnancies`, `pregnancy_kick_sessions`, `pregnancy_contractions`, `pregnancy_photos`, `pregnancy_checklist_state`, `health_appointments`.

**`cycle_settings`** (one row per user) — the mode switch and all preferences:
- `enabled: boolean` — master feature toggle
- `mode: 'standard' | 'ttc' | 'pregnant' | 'postpartum' | 'menopause'`
- `avg_cycle_length_override`, `avg_period_length_override`, `luteal_phase_length` (default 14) — numeric overrides
- `birth_control_method: string`
- `conditions: string[]` (e.g. PCOS, endometriosis)
- `show_fertile_window: boolean`
- `preferred_products: string[]`
- `dismissed_prompts: string[]`
- `terminology: 'default' | 'neutral'`
- `discreet_mode: boolean` — hides cycle-specific naming/icons in nav
- `onboarded_at` — null until first-run wizard completed

**`cycle_daily_entries`** (one row per user+day, unique on `user_id, entry_date`): `entry_date`, `flow_level` ('none'|'spotting'|'light'|'medium'|'heavy'), `product_usage JSONB`, `cervical_mucus`, `unusual_discharge string[]`, `energy`/`libido` (1-5), `notes`, `custom_fields JSONB`, plus TTC additions `intercourse`, `intercourse_protected`, `cervical_position`. (BBT is stored via the existing shared "basal body temperature" custom measurement, not on this table. Mood is stored separately in `mood_entries`.)

**`cycles`** (period history, unique on `user_id, start_date`): `start_date`, `end_date`, `period_length`, `cycle_length`, `is_excluded`, `source: 'derived'|'manual'`, `birth_control_method`.

**`user_cycle_display_preferences`**: `view_group: 'today'|'calendar'|'insights'|'care'`, `platform`, `visible_items JSONB` — per-platform dashboard tile visibility (mobile should write its own `platform` value here, not share web's).

**`cycle_test_entries`** (TTC): `entry_date`, `tested_at`, `test_type: 'opk'|'hpt'`, `result` (opk: negative/low/high/peak; hpt: negative/faint/positive), `notes`.

**`pregnancies`** (partial-unique: one `active` per user): `due_date`, `due_date_basis: 'lmp'|'conception'|'manual'|'scan'`, `lmp_date`, `conception_date`, `fetus_count`, `status: 'active'|'completed'|'ended'`, `ended_on`, `outcome`, `prenatal_medication_id`/`supplement_medication_id` (FK → `medications`), `notes`.

**`pregnancy_kick_sessions`**: `pregnancy_id`, `started_at`/`ended_at`, `kick_count`, `kick_times: TIMESTAMPTZ[]`.
**`pregnancy_contractions`**: `pregnancy_id`, `started_at`/`ended_at`, `intensity`.
**`pregnancy_photos`**: `pregnancy_id`, `week`, `entry_date`, `file_path`, `notes` (multipart upload).
**`pregnancy_checklist_state`**: `pregnancy_id`, `template_key`, `custom_title`, `week`, `completed_at`, `dismissed`.
**`health_appointments`**: `pregnancy_id` (nullable), `scheduled_at`, `appointment_type`, `title`, `location`, `notes`, `outcome JSONB`.

**Routes** — `SparkyFitnessServer/routes/v2/cycleRoutes.ts` (base `/api/v2/cycle`):
- `GET/PUT /settings`
- `POST /prompts/dismiss`
- `GET/PUT /display-preferences/:viewGroup`
- `GET/PUT /logs`, `GET/PUT/DELETE /logs/:date` (`PUT /logs` = bulk upsert)
- `GET/POST/PUT/DELETE /cycles`, `/cycles/:id`
- `GET /overview`, `GET /insights`
- `GET/POST/DELETE /tests`, `/tests/:id`
- `GET /fertility`, `GET /correlations`, `GET /export`

**Routes** — `SparkyFitnessServer/routes/v2/pregnancyRoutes.ts` (base `/api/v2/pregnancy`):
- `GET /current`, `POST /`, `PUT/DELETE /:id`, `GET /overview`
- `POST /kicks/start`, `PUT /kicks/:id`, `GET /kicks`
- `POST /contractions`, `PUT /contractions/:id`, `GET /contractions`
- `POST /photos` (multipart), `GET /photos`, `DELETE /photos/:id`
- `GET/PUT/POST /checklist`
- `POST/PUT/GET/DELETE /appointments`, `/appointments/:id`

**Shared logic layer** — `shared/src/cycle/` (plain TypeScript, framework-free, importable from mobile as `@workspace/shared`; this is the single source of truth for all cycle/pregnancy math and content, do not reimplement it in mobile):
- `types.ts` — `CycleMode`, `FlowLevel`, `CyclePhase`, `PredictionConfidence`, `RegularityLabel`, `SharedCycleSettings`, `SharedCycleDailyLog`, `SharedCycleTestEntry`, `SharedCycle`, `DerivedCycle`, `CycleStats`, `PredictedCycle`, `CyclePrediction`, `DayEvidence`
- `constants.ts` — `CYCLE_MODES`, `FLOW_LEVELS` (+ `isPeriodEvidenceFlow`), `SYMPTOM_CATEGORY_COLOR`, symptom defs, birth-control-method catalog, cycle-condition catalog
- `predictions.ts` — `deriveCycles`, `computeCycleStats`, `predictNextCycles`, `phaseForDay`, `latePeriodStatus`, `buildCalendarMonth`, `predictionAccuracy`, `symptomPhaseMatrix`, `forecastSymptoms`, `productStats`, `detectAnomalies`, `buildCycleAlerts`, `isPeriodDay`
- `fertility.ts` — `estimateOvulation`, `detectBiphasicShift` (BBT coverline), `dpo` (days-past-ovulation), `CONCEPTION_PROBABILITY_BY_OFFSET`
- `pregnancy.ts` — `eddFromLmp`, `eddFromConception`, `gestationalAge`; types `PregnancyDueDateBasis`, `PregnancyStatus`, `SharedPregnancy`, `SharedKickSession`, `SharedContraction`, `Trimester`, `GestationalAge`
- `pregnancyContent.ts` — `BABY_DEVELOPMENT` (`babyWeek()`), `CHECKLIST_TEMPLATES` (`checklistForWeek()`), `FOOD_SAFETY`/`MED_SAFETY` (`lookupSafety`, `matchMedSafety`)
- `content.ts` — `CYCLE_ARTICLES` (+ `articlesForMode`, `featuredArticle`), `detectConditionFlags`, postpartum/menopause symptom lists, `BIRTH_PLAN_QUESTIONS`, `HOSPITAL_BAG_ITEMS`
- `correlations.ts` — `correlateMetricWithPhase`, `coachingForPhase`

**Important gap (not a blocker):** unlike most domains, `shared/src/schemas/database/` has **no generated Zod schema** for cycle/pregnancy tables (only `MoodEntries.zod.ts` exists in that domain). Request/response validation lives server-side only, in `SparkyFitnessServer/schemas/cycleSchemas.ts` and `pregnancySchemas.ts`. Mobile can and should build against the plain TS types in `shared/src/cycle/types.ts` and `pregnancy.ts` exactly as designed — this is not a blocker for this port. Flag as a **follow-up** (separate from this plan): adding `shared/src/schemas/database/Cycle*.zod.ts` / `Pregnancy*.zod.ts` and `.../api/Cycle*.api.zod.ts`, mirroring the existing `CheckInMeasurements.zod.ts` pattern, would let mobile get the same runtime request/response validation other domains have. If anyone does add these later, they MUST follow the `new-migration` skill checklist (RLS review, `db_schema_backup.sql` sync, docs security-tier update) since it touches schema-adjacent contracts even without an actual migration.

---

## B. Existing Web Frontend (reference only — mobile builds its own screens, does not import these)

- `src/pages/Settings/CycleSettings.tsx` — settings accordion (mode picker, toggles, overrides, export, reset onboarding) embedded in `SettingsPage.tsx`.
- `src/pages/Cycle/CyclePage.tsx` — standalone route `/cycle` (sibling of `/settings`, not nested under it); gates on `enabled`/`onboarded_at` (else shows `CycleOnboarding`); 3 tabs (Log/Insights/Care); Today view swaps `CycleToday` vs `PregnancyToday` by `mode`.
- `src/pages/Cycle/CycleOnboarding.tsx` — first-run wizard (pick mode + baseline info).
- Core: `CycleToday.tsx`, `CycleInsights.tsx`, `CycleCalendar.tsx`, `CycleAlerts.tsx`, `CycleHistoryList.tsx`, `DailyLogPanel.tsx`, `CycleSymptomPicker.tsx`, `CorrelationCards.tsx`, `CycleRing.tsx`/`CycleBarGlyph.tsx`/`CycleIcon.tsx` (visual glyphs).
- Care hub (`src/pages/Cycle/care/`): `CareHub.tsx` (BirthPrep if pregnant else DoctorReport), `ArticleLibrary.tsx`, `AppointmentsPanel.tsx`, `BirthPrep.tsx`, `DoctorReport.tsx`.
- Pregnancy hub (`src/pages/Cycle/pregnancy/`): `PregnancyToday.tsx`, `PregnancySetup.tsx`, `WeekBanner.tsx`, `BabyGrowthView.tsx`, `VitalsCard.tsx`, `KickCounter.tsx`, `ContractionTimer.tsx`, `WeeklyChecklist.tsx`, `BumpPhotoJournal.tsx`, `FoodMedSafetySearch.tsx`, `WombScene.tsx` (illustrated SVG by trimester).
- TTC hub (`src/pages/Cycle/ttc/`): `FertilityCard.tsx`, `FertileWindowChart.tsx`, `BbtStatusCard.tsx`, `CervicalPositionPicker.tsx`, `TestQuickLog.tsx`, `IntercourseLog.tsx`, `TwoWeekWait.tsx`.
- Frontend hooks: `src/hooks/useCycle.ts`, `src/hooks/usePregnancy.ts` (React Query wrappers). API clients: `src/api/Cycle/cycleService.ts`, `src/api/Pregnancy/pregnancyService.ts`.
- Nav wiring: `src/layouts/MainLayout.tsx` conditionally shows a "Cycle"/"Pregnancy Hub"/discreet-labeled nav item when `cycleSettings.enabled`, both desktop sidebar and **mobile web's own "+" add-menu** (comment in that file: "Cycle/Pregnancy and Medications live in the '+' Add menu on mobile") — this is the precedent the native mobile app's `AddSheet` placement decision mirrors.

---

## C. Mobile App Conventions to Follow (verified against current code)

**Navigation** (`SparkyFitnessMobile/App.tsx`, `src/types/navigation.ts`) — React Navigation 7, **not** expo-router:
- `RootStackParamList` (in `src/types/navigation.ts`) is the single source of truth for all root-stack routes; `TabParamList` is separate and only has `Dashboard | Diary | Add | Library | Settings` (`Add` is a center action that opens `AddSheet`, not a real screen).
- Adding a screen = (1) add its param type to `RootStackParamList`, (2) register `<Stack.Screen name="..." component={...} options={createStackScreenOptions(...)} />` in `App.tsx`, (3) wrap the screen component with `withErrorBoundary(Component, 'ScreenName', { canGoBack: true })` (existing pattern, e.g. `MeasurementsAddScreen`).
- Modal-presented screens use `presentation: 'modal'` in `createStackScreenOptions`, plus `androidModalAnimation` on Android (see `MeasurementsAdd` registration in `App.tsx`).
- Screens declare headers via `useScreenHeader(config)` (`src/hooks/useScreenHeader.tsx`) — one declarative descriptor for both native and custom header paths. **Do not hand-roll headers** alongside this hook; a contract test (`__tests__/navigation/nativeHeaderContract.test.ts`) enforces this and enumerates all root-stack routes with a screen-owned header. Exactly one `kind: 'primary'` header action per screen is enforced with a `__DEV__` throw.
- Screens intentionally presented above `Tabs` instead of participating in native-tabs mode need an entry (with a short reason) in `NATIVE_TABS_ROUTE_EXCLUSIONS` inside that same contract test file.
- `AddSheet` (`src/components/AddSheet.tsx`) is the existing "+" quick-entry launcher. Its current props (verified in code) are: `onAddFood`, `onStartWorkout`, `onAddActivity`, `onLogWorkout`, `onSyncHealthData`, `onBarcodeScan`, `onAddMeasurements`, `onAskSparky`, `onDismissWithoutAction`. It renders a 2x2 grid of primary cards (`renderCard`, currently Food/Exercise(sub-menu)/Measurements/Scan Food) plus "secondary rows" below (`renderSecondaryRow`, currently "Ask Sparky" and "Sync Health Data") rendered via `Icon` + `Button variant="primary"` styled with `--color-raised` background. `App.tsx` owns the actual callbacks and passes them down as props — `AddSheet` itself has no navigation/query awareness.
- `Icon.tsx` maps semantic icon names (type `IconName`) to SF Symbols (iOS) / Ionicons (Android) — adding a new icon means adding a new semantic name to this map, verifying the identifier exists on both platforms.

**Data layer:**
- TanStack Query 5, default `staleTime: Infinity` — **every mutation must explicitly invalidate** affected query keys (nothing auto-refetches on a timer). Query key builders live in `src/hooks/queryKeys.ts`.
- `useRefetchOnFocus(refetch, enabled)` is the standard "refresh when screen regains focus" hook.
- API clients live one-file-per-domain in `src/services/api/` (e.g. `measurementsApi.ts`, `fastingApi.ts`) as thin wrappers over `apiFetch` from `apiClient.ts` (handles auth/proxy headers). Multipart/file uploads bypass `apiFetch` and set headers manually (see `exerciseApi.ts`'s custom-exercise-image upload for the pattern).
- Local-only (non-server-synced) UI preferences use Zustand + `persist` middleware against a single AsyncStorage key, e.g. `src/stores/appPreferencesStore.ts` (`@SparkyFitness/app-preferences`). This is the template for anything like "hide this wellness card" that should never sync to the server.
- Auth/session state has no Context — it's read through hooks (`useAuth`, `useServerConfigs`) backed by `src/services/storage.ts` (AsyncStorage for config metadata, `expo-secure-store` for secrets).

**UI primitives** (Uniwind = TailwindCSS v4 for RN, CSS variables via `useCSSVariable`/`useUniwind`, themes Light/Dark/AMOLED/System) — reuse these, do not rebuild:
- `ui/Button.tsx` (variants `primary/secondary/outline/ghost/header/link`, tone `accent/neutral`)
- `FormInput.tsx`, `SettingsRow.tsx`/`SettingsRowGroup`, `SegmentedControl.tsx`, `StepperInput.tsx` (numeric +/-)
- `BottomSheetPicker.tsx`, `CalendarSheet.tsx`, `DateRangeSheet.tsx` (use `FullWindowOverlay` on iOS)
- `AnchoredMenu.tsx`, `Popover.tsx`, `ActionSheet.tsx`
- `FormScreenChrome.tsx` (sticky-footer form chrome), `ScreenHeader.tsx`
- Cards: `MacroCard`, `MacroSummaryCard`, `HydrationGauge`, `ProgressRing`, `MacroCompositionRing`, `CalorieRingCard`, `MeasurementsSummary`, `DateNavigator`
- Charts: `WeightLineChart.tsx`, `StepsBarChart.tsx`, `NutrientBarChart.tsx`, `HealthTrendsPager.tsx`, shared touch/tooltip via `ChartTouchOverlay.tsx` — built on **Victory Native** (`@shopify/react-native-skia`), animated via **Reanimated 4** `useSharedValue`/`useDerivedValue` (never Skia's own deprecated animation API).

**Closest existing structural analogs to copy patterns from:**
- **Measurements** (`src/types/measurements.ts`, `src/services/api/measurementsApi.ts`, `src/hooks/useMeasurements.ts`, `src/hooks/useUpsertCheckIn.ts`, `src/hooks/useMeasurementsRange.ts`, `src/screens/MeasurementsAddScreen.tsx`) — the template for "upsert-by-day check-in data with explicit null-vs-undefined semantics."
- **Fasting** (`FastingDetailScreen`, `FastingCard`, `FastingProtocolSheet`, `useFasting`, `useFastingTimer`, `fastingApi.ts`) — the template for "settings/protocol + live start/stop session tracking."
- **Active workout HUD** (`activeWorkoutStore.ts`, `ActiveWorkoutBar`) — the template for "live timer with elapsed time and start/stop," relevant to Kick Counter and Contraction Timer.
- **`DashboardSettingsScreen.tsx`/`DiarySettingsScreen.tsx`** — the template for a toggle-heavy preferences screen using `SettingsRow`/`SettingsRowGroup`.
- **`FoodScanScreen.tsx`** — the template for `expo-image-picker` camera/library capture (verify current usage before assuming API shape).

**Testing:** `__tests__/` mirrors `src/` (components/hooks/screens/services/stores/utils). AGENTS.md specifies exactly which existing test suites must be rerun when touching AddSheet/nav ("Widgets/HUD/tab/add-sheet changes: rerun `useWidgetSync`, active workout store, `AddSheet`, `CustomTabBar`, `ActiveWorkoutBar`, and error-boundary tests").

**Docs convention:** mobile keeps per-feature endpoint docs under `SparkyFitnessMobile/docs/*.md` (e.g. `measurements_api.md`, `food_api.md`) — add `docs/women_health_api.md` for this feature.

---

## D. New Mobile File Plan (by domain) — full index across all phases

### D1. Types
- `src/types/womensHealth.ts` — mobile view-model types layered on `shared/src/cycle/*` where the API/UI needs shapes not defined there (list wrappers, pagination). Pattern off `src/types/measurements.ts`.

### D2. API clients (`src/services/api/`)
- `cycleApi.ts` — settings GET/PUT; logs list/get/put/delete/bulk-put; cycles CRUD; overview; insights; fertility; tests CRUD; correlations; export; display-preferences GET/PUT; prompts/dismiss. Pattern off `measurementsApi.ts` (`apiFetch` wrapper, explicit null-vs-undefined upsert semantics).
- `pregnancyApi.ts` — current/overview; pregnancy CRUD; kicks start/update/list; contractions CRUD; checklist GET/PUT/POST; appointments CRUD. Same `apiFetch` pattern.
- `pregnancyPhotosApi.ts` — separate file (multipart-only, bypasses `apiFetch`, manual headers) for photo upload/list/delete. Pattern off `exerciseApi.ts`'s custom-exercise-image `FormData` upload.

### D3. Query keys (additions to `src/hooks/queryKeys.ts`)
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
Invalidation rules (critical — every mutation hook must implement these; default `staleTime: Infinity` means nothing else will refresh the UI):
- **Daily log upsert** (widest blast radius): invalidate `cycleLogQueryKey(date)`, any `cycleLogsRangeQueryKey` covering that date, `cyclesQueryKey`, `cycleOverviewQueryKey`, `cycleInsightsQueryKey`, `cycleFertilityQueryKey` (a single entry can shift derived-cycle boundaries and predictions).
- **Kick session start/update**: invalidate `pregnancyKicksQueryKey` + `pregnancyOverviewQueryKey`.
- **Contraction CRUD**: same as kicks.
- **Test entry CRUD**: invalidate `cycleTestsQueryKey` + `cycleFertilityQueryKey` (OPK/BBT feeds ovulation estimation).
- **Photo upload/delete**: invalidate `pregnancyPhotosQueryKey` only (narrow blast radius).
- **Settings PUT**: invalidate `cycleSettingsQueryKey` broadly, since mode changes ripple into every screen's conditional rendering.
- Static content (articles, checklist templates, food/med safety lookups) needs **no query at all** — these are plain synchronous imports from `shared/src/cycle/content.ts` / `pregnancyContent.ts`, not network calls.

### D4. Hooks (`src/hooks/`)
- `useCycleSettings.ts` — GET/PUT settings.
- `useCycleMode.ts` — thin derived hook wrapping `useCycleSettings()`, returns `{ mode, enabled, discreetMode, terminology, isLoading }`. **Every** screen/component that branches on mode (Today view swap, TTC widget visibility, Care hub's BirthPrep-vs-DoctorReport branch, AddSheet card label) must call this one hook rather than re-deriving from raw settings, to avoid drift between screens computing "is pregnant" differently.
- `useCycleLogs.ts` (list/get, pattern off `useMeasurements.ts` + `useRefetchOnFocus`), `useUpsertCycleLog.ts` (mutation, pattern off `useUpsertCheckIn.ts`).
- `useCycleInsights.ts` (overview/insights/fertility/correlations reads).
- `useCycleTests.ts` (CRUD test entries).
- `usePregnancy.ts` (current pregnancy + overview + create/update/delete).
- `usePregnancyKicks.ts`, `usePregnancyContractions.ts` (start/update/list, pattern off `useFastingTimer.ts`'s start/end/current-session shape).
- `usePregnancyChecklist.ts`, `useHealthAppointments.ts`.
- `usePregnancyPhotos.ts` (list/upload/delete, upload mutation wraps `pregnancyPhotosApi.ts`).

### D5. Screens (`src/screens/`) — true root-stack routes only
- `CycleSettingsScreen.tsx`, `CycleOnboardingScreen.tsx`, `CycleHubScreen.tsx`, `PregnancySetupScreen.tsx` — see per-phase files for detail.

### D6. Feature components (`src/components/wellness/`) — NOT routes, rendered inside `CycleHubScreen`
- Core, Insights, `wellness/ttc/`, `wellness/pregnancy/`, `wellness/care/` — see per-phase files for detail.

### D7. Wellness sub-theme (`src/components/wellness/theme/`)
- `wellnessTokens.ts` and illustration assets — see `08-navigation-polish.md` for detail.

---

## E. Navigation Design (concrete) — full detail in `08-navigation-polish.md`

`RootStackParamList` additions: `CycleOnboarding: undefined`, `CycleHub: { initialTab?: 'today' | 'insights' | 'care' } | undefined`, `CycleSettings: undefined`, `PregnancySetup: undefined`. `TabParamList` is NOT touched. Today/Insights/Care are in-screen `SegmentedControl` state inside one `CycleHubScreen`, not separate pushed routes.

## F. Build Sequence (internal implementation order = phase file order)

1. **Foundation** (`01-foundation.md`) — types, API clients, query keys, `useCycleSettings`/`useCycleMode`. Validate against real backend responses before building UI.
2. **Settings + mode surface** (`02-settings-onboarding.md`, part 1) — `CycleSettingsScreen`, wired into `SettingsScreen.tsx`.
3. **Onboarding** (`02-settings-onboarding.md`, part 2) — `CycleOnboardingScreen`, gated on `!enabled || !onboarded_at`.
4. **Core cycle Today/Log + Calendar** (`03-core-cycle.md`) — `CycleHubScreen` shell, `CycleTodayView`, `CycleCalendarGrid`, glyphs, history list.
5. **Insights/correlations** (`04-insights.md`) — `CycleInsightsView`, correlation cards, trend charts.
6. **TTC hub** (`05-ttc.md`) — fertility/BBT/test/intercourse widgets layered onto Today/Insights via `useCycleMode()`.
7. **Pregnancy hub** (`06-pregnancy.md`) — **largest single sub-area**; setup, week banner, baby growth, vitals, kick counter, contraction timer, weekly checklist, bump photo journal, food/med safety search, womb scene.
8. **Care hub** (`07-care-hub.md`) — articles, appointments, birth prep, doctor report; depends on the pregnancy hook already existing (BirthPrep-vs-DoctorReport branch).
9. **Nav wiring + polish** (`08-navigation-polish.md`) — `AddSheet` card, routes, `SettingsScreen` "Wellness" row, wellness sub-theme tokens/illustrations, discreet-mode threading, docs, full test suite.

Relative sizing (largest to smallest): **Pregnancy hub** > **Settings+core cycle** > **Care hub** > **TTC hub**.

## G. Risk / Impact Notes (full detail repeated in relevant phase files)

1. **RLS Tier-1 owner-only, not delegatable** — all 11 tables are strictly owner-only. Verify current mobile delegation/"acting as another user" support early (Phase 1); if it exists, `useCycleMode()` must hide the feature entirely for delegated sessions.
2. **Zod schema gap is not a blocker** — proceed with plain TS types from `shared/src/cycle/`; flag Zod-parity as a separate follow-up, not in scope here.
3. **Navigation contract tests need updates** — `__tests__/navigation/nativeHeaderContract.test.ts` (new routes, possible `NATIVE_TABS_ROUTE_EXCLUSIONS` entry), `AddSheet.test.tsx`, and the standard AddSheet/nav test rerun list from AGENTS.md.
4. **`expo-image-picker` dependency check** — confirm already installed (used in `FoodScanScreen.tsx`) before Phase 7 (Pregnancy hub / bump photos).
5. **`react-native-svg` dependency check** — confirm presence/absence before choosing SVG vs static-image approach for `WombScene` in Phase 7/9.
6. **Discreet mode and terminology** must be threaded through every new screen's user-facing strings via `useCycleMode()`'s `discreetMode`/`terminology` fields, not hardcoded per screen.

## H. Verification (repeated at the end of every phase file)

- Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/` after each phase.
- After Phase 1, verify API responses against a real running backend (`pnpm start` from `SparkyFitnessServer/`).
- After Phase 9, manually drive the app end-to-end: AddSheet → wellness row → onboarding → log a cycle day → Insights → switch mode to `pregnant` in Settings → Today view swaps to `PregnancyTodayView` → start/stop kick session → upload bump photo → Care hub shows BirthPrep instead of DoctorReport.
- Rerun the full AddSheet/navigation test list from `SparkyFitnessMobile/AGENTS.md` before considering nav wiring done.
- Confirm discreet mode end-to-end across every new screen, not just the AddSheet row.
