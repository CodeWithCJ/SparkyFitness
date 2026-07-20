# Phase 7 — Pregnancy Hub (largest phase)

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained). Depends on Phase 1 (`01-foundation.md`) and Phase 4 (`03-core-cycle.md`, `CycleHubScreen` shell/pattern to follow) — this phase adds the alternate "pregnant/postpartum" branch of the Today view plus its own setup screen.

## Goal

Build the full pregnancy tracking experience: pregnancy record setup (due-date basis), the pregnant-mode Today view (week banner, baby growth, vitals), live kick-count and contraction timers, a weekly to-do checklist, a bump-photo journal with camera/library capture, and a food/medication safety search. This is the **largest single sub-area** in the whole feature (own data model, own setup screen, two live-session timers, image upload) — treat it as needing its own review checkpoint before moving to Phase 8 (Care hub).

## Background: data and math this consumes

**`pregnancies`** table (partial-unique: one `active` per user) via `GET /current`, `GET /overview`, `POST /`, `PUT/DELETE /:id` on `/api/v2/pregnancy` (already wrapped in `pregnancyApi.ts` from Phase 1): `due_date`, `due_date_basis: 'lmp'|'conception'|'manual'|'scan'`, `lmp_date`, `conception_date`, `fetus_count`, `status: 'active'|'completed'|'ended'`, `ended_on`, `outcome`, `prenatal_medication_id`/`supplement_medication_id` (FK → `medications` table — check the existing medications feature/API for how to look up/select a medication if this field is surfaced in the UI), `notes`.

**`pregnancy_kick_sessions`**: `pregnancy_id`, `started_at`/`ended_at`, `kick_count`, `kick_times: TIMESTAMPTZ[]`. Endpoints: `POST /kicks/start`, `PUT /kicks/:id`, `GET /kicks` (already in `pregnancyApi.ts`).

**`pregnancy_contractions`**: `pregnancy_id`, `started_at`/`ended_at`, `intensity`. Endpoints: `POST /contractions`, `PUT /contractions/:id`, `GET /contractions` (already in `pregnancyApi.ts`).

**`pregnancy_photos`**: `pregnancy_id`, `week`, `entry_date`, `file_path`, `notes`. Endpoints: `POST /photos` (multipart), `GET /photos`, `DELETE /photos/:id` — this phase builds `pregnancyPhotosApi.ts` if not already stubbed in Phase 1 (Phase 1 names this file; if it already exists as an empty/stub file, fill it in here).

**`pregnancy_checklist_state`**: `pregnancy_id`, `template_key`, `custom_title`, `week`, `completed_at`, `dismissed`. Endpoints: `GET/PUT/POST /checklist` (already in `pregnancyApi.ts`).

Shared pure-logic (`shared/src/cycle/pregnancy.ts` and `pregnancyContent.ts`, import via `@workspace/shared`, do not reimplement):
- `pregnancy.ts` — `eddFromLmp`, `eddFromConception` (estimated due date from LMP/conception date), `gestationalAge` (280-day term, current week/trimester calc). Types: `PregnancyDueDateBasis`, `PregnancyStatus`, `SharedPregnancy`, `SharedKickSession`, `SharedContraction`, `Trimester`, `GestationalAge`.
- `pregnancyContent.ts` — `BABY_DEVELOPMENT` (`babyWeek()` — fetal size/development-by-week content), `CHECKLIST_TEMPLATES` (`checklistForWeek()` — generates the week-appropriate checklist items), `FOOD_SAFETY`/`MED_SAFETY` (`lookupSafety`, `matchMedSafety` — food/medication safety-during-pregnancy lookup).

Query keys from Phase 1: `pregnancyCurrentQueryKey`, `pregnancyOverviewQueryKey`, `pregnancyKicksQueryKey(sessionId?)`, `pregnancyContractionsQueryKey`, `pregnancyChecklistQueryKey`, `pregnancyPhotosQueryKey`. Invalidation rules established in Phase 1: kick session start/update → invalidate `pregnancyKicksQueryKey` + `pregnancyOverviewQueryKey`; contraction CRUD → same; photo upload/delete → invalidate `pregnancyPhotosQueryKey` only (narrow blast radius — doesn't affect other derived pregnancy data).

Web precedent (reference only): `src/pages/Cycle/pregnancy/PregnancyToday.tsx`, `PregnancySetup.tsx`, `WeekBanner.tsx`, `BabyGrowthView.tsx`, `VitalsCard.tsx`, `KickCounter.tsx`, `ContractionTimer.tsx`, `WeeklyChecklist.tsx`, `BumpPhotoJournal.tsx`, `FoodMedSafetySearch.tsx`, `WombScene.tsx` (illustrated SVG scenes by trimester).

## Mobile conventions and hooks from prior phases, plus new ones for this phase

- `useCycleMode()` (Phase 1) decides when to render the pregnancy branch: `mode === 'pregnant' || mode === 'postpartum'`. This branch decision happens once, in `CycleHubScreen` (Phase 4), swapping `PregnancyTodayView` in for `CycleTodayView` — do not duplicate the mode check inside every pregnancy component.
- Live start/stop session pattern: this app's existing template is `src/hooks/useFastingTimer.ts` (start/end/current-session shape) for the *data* side, and `src/stores/activeWorkoutStore.ts` + `ActiveWorkoutBar` for the *live elapsed-time UI* side (relevant since Kick Counter and Contraction Timer are both "live timer with start/stop and running count/elapsed time"). Do not build a from-scratch timer mechanism — adapt these two patterns.
- Image capture: **verify `expo-image-picker` is already a dependency** (it should have been confirmed in Phase 1's dependency check; if not done yet, check now — it's used in `FoodScanScreen.tsx`). Pattern the capture flow off `FoodScanScreen.tsx`'s `ImagePicker` usage (camera-vs-library action-sheet choice), but note bump photos need a **much simpler** flow than food photos: no AI-estimation pipeline, just pick → preview → upload. Do **not** build a nested navigator like `FoodPhotoFlow` for this — a bottom sheet is sufficient.
- Multipart upload: `pregnancyPhotosApi.ts` (from Phase 1) bypasses `apiFetch` and sets headers manually, patterned off `exerciseApi.ts`'s custom-exercise-image `FormData` upload.
- Card layout: pattern `WeekBanner`/`BabyGrowthView`/`VitalsCard` off `MacroCard.tsx`/`MeasurementsSummary.tsx`. `FastingDetailScreen.tsx`'s "big status header + supporting cards" layout is the template for the overall `PregnancyTodayView` composition (gestational-week header at top, supporting cards below).
- Checklist rows: pattern off `SettingsRow` (checkbox-style row with a completed/dismissed toggle).
- Illustration: `WombScene.tsx` — see the wellness sub-theme detail in `08-navigation-polish.md` for the asset-format decision (static image vs SVG); this phase should build the component to accept a themed image/illustration prop so the actual asset can be swapped in during Phase 9 polish without reworking this component.

## Tasks

### 1. `src/hooks/usePregnancy.ts` (new)
Current pregnancy + overview + create/update/delete, over `pregnancyApi.ts`. Keyed by `pregnancyCurrentQueryKey`/`pregnancyOverviewQueryKey`.

### 2. `src/screens/PregnancySetupScreen.tsx` (new)
Root-stack screen (add `PregnancySetup: undefined` to `RootStackParamList`), modal-presented (`presentation: 'modal'`, `createStackScreenOptions`, `withErrorBoundary`, `headerBackTitle`/`headerBackButtonDisplayMode: 'minimal'` per the back-button rule). Form: due-date basis picker (`lmp`/`conception`/`manual`/`scan` via `BottomSheetPicker`), corresponding date input, fetus count, notes, optional prenatal/supplement medication link. On save, calls `usePregnancy`'s create/update mutation, which server-side computes/stores `due_date` from `eddFromLmp`/`eddFromConception` as appropriate (verify against `pregnancySchemas.ts`'s `CreatePregnancyBodySchema` whether the client sends the raw basis date and lets the server compute EDD, or whether the client should pre-compute via the shared `eddFromLmp`/`eddFromConception` functions and send `due_date` directly — match whatever the schema expects).

### 3. `src/components/wellness/pregnancy/PregnancyTodayView.tsx` (new)
Rendered by `CycleHubScreen` (Phase 4) instead of `CycleTodayView` when mode is `pregnant`/`postpartum`. If no active pregnancy record exists yet (`usePregnancy`'s current-pregnancy query returns none) and mode is `pregnant`, show a prompt to open `PregnancySetupScreen` rather than an empty dashboard. Once a pregnancy exists, composes `WeekBanner`, `BabyGrowthView`, `VitalsCard`, and entry points into `KickCounter`/`ContractionTimer`/`WeeklyChecklist`/`BumpPhotoJournal`/`FoodMedSafetySearch` (as cards or quick-action buttons — match how much fits on one scrollable view vs. needing their own bottom sheets; use judgment, but keep the top-level view a composition of cards rather than one giant form).

### 4. `src/components/wellness/pregnancy/WeekBanner.tsx` (new)
Gestational-week header/progress banner using `gestationalAge` (current week, trimester, days remaining) from `shared/src/cycle/pregnancy.ts`.

### 5. `src/components/wellness/pregnancy/BabyGrowthView.tsx` (new)
Fetal size/development-by-week viewer using `babyWeek()` from `shared/src/cycle/pregnancyContent.ts`.

### 6. `src/components/wellness/pregnancy/VitalsCard.tsx` (new)
Weight/BP tracking (check whether weight should reuse the existing `measurementsApi.ts` weight check-in rather than a separate pregnancy-specific weight field — likely yes, to avoid duplicate weight data sources) and prenatal/supplement medication display (from the `pregnancies` record's medication FK fields).

### 7. `src/components/wellness/pregnancy/KickCounter.tsx` (new)
Live kick-count session: start session (`POST /kicks/start`), tap-to-log each kick (accumulating `kick_times`), end session (`PUT /kicks/:id` with `ended_at`/final `kick_count`). Pattern the live-timer UI off `ActiveWorkoutBar`/`activeWorkoutStore` conventions (elapsed time display, start/stop state machine) — new hook `src/hooks/usePregnancyKicks.ts` (pattern off `useFastingTimer.ts`'s start/end/current-session shape) backs this. Invalidate `pregnancyKicksQueryKey` + `pregnancyOverviewQueryKey` on start/update.

### 8. `src/components/wellness/pregnancy/ContractionTimer.tsx` (new)
Live contraction timer with intensity input, same live-session pattern as Kick Counter. New hook `src/hooks/usePregnancyContractions.ts`. Consider surfacing a "5-1-1 rule" style analysis (contractions 5 min apart, lasting 1 min, for 1 hour — check web's `ContractionTimer.tsx` for the exact analysis logic it implements, since this is domain logic worth porting faithfully rather than re-deriving from scratch) as a derived summary over the contraction history.

### 9. `src/components/wellness/pregnancy/WeeklyChecklist.tsx` (new)
Checklist rows (pattern off `SettingsRow`) over `checklistForWeek()` from `shared/src/cycle/pregnancyContent.ts`, backed by `src/hooks/usePregnancyChecklist.ts` (new) reading/writing `pregnancy_checklist_state` via `GET/PUT/POST /checklist`.

### 10. `src/components/wellness/pregnancy/BumpPhotoJournal.tsx` (new)
Bottom sheet (not a route/nested navigator): camera-or-library action sheet via `expo-image-picker` → preview → upload via `pregnancyPhotosApi.ts` (multipart, week/entry_date/notes metadata) → gallery view of past photos. New hook `src/hooks/usePregnancyPhotos.ts` (list/upload/delete). Invalidate `pregnancyPhotosQueryKey` only on upload/delete.

### 11. `src/components/wellness/pregnancy/FoodMedSafetySearch.tsx` (new)
Search box + result list over `lookupSafety`/`matchMedSafety` from `shared/src/cycle/pregnancyContent.ts` — this is a **local, client-side lookup over static content**, not an API call. Pattern the debounced search/filter UX off any existing local-search list in the app (e.g. exercise/food library search input) rather than building new debounce logic from scratch.

### 12. `src/components/wellness/pregnancy/WombScene.tsx` (new, illustration wiring only)
Build the component shell now (accepts a trimester prop, renders a themed illustration/image), but treat the actual asset (static PNG/WebP vs. dynamic SVG) as a Phase 9 polish task — see `08-navigation-polish.md` for the format decision and asset commissioning scope. Do not block this phase's completion on final art; a placeholder is acceptable.

## Verification
- With `mode` set to `pregnant` (Phase 2 settings) and no pregnancy record yet, confirm `PregnancyTodayView` prompts to open `PregnancySetupScreen`; complete setup and confirm `WeekBanner`/`BabyGrowthView` reflect the correct week from `gestationalAge`.
- Start and stop a kick-count session; confirm `kick_times` accumulates correctly and the session appears in history after ending.
- Start and stop a contraction timer with at least 3 logged contractions; confirm any 5-1-1-style analysis (if ported) computes sensibly.
- Complete a checklist item and confirm it persists (`completed_at` set) across app restarts.
- Capture a bump photo via camera and via library picker; confirm upload succeeds and the photo appears in the gallery view; delete it and confirm it's removed.
- Search the food/med safety tool for a known unsafe item (per `FOOD_SAFETY`/`MED_SAFETY` content) and confirm the correct safety status renders.
- Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/`.
- Add tests under `__tests__/hooks/usePregnancy.test.ts`, `usePregnancyKicks.test.ts`, `usePregnancyContractions.test.ts`, `usePregnancyChecklist.test.ts`, `usePregnancyPhotos.test.ts`, `__tests__/screens/PregnancySetupScreen.test.tsx`, and `__tests__/components/wellness/pregnancy/` for each new component.

## Next phase
`07-care-hub.md` — depends on `usePregnancy` (this phase) existing, since the Care hub's BirthPrep-vs-DoctorReport branch checks pregnancy status.
