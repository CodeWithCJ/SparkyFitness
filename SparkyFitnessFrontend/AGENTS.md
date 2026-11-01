# AGENTS.md

_Last updated: 2026-10-29_

SparkyFitness Frontend is the React web app for the SparkyFitness monorepo. Use this file as the primary guide for work inside `SparkyFitnessFrontend/`.

If a task also touches the server, mobile app, or `shared/`, read that package guide before editing outside this directory. Use `../AGENTS.md` for monorepo-level context.

## Scope

- This file is for package-local work in `SparkyFitnessFrontend/`.
- `CLAUDE.md` just imports this file via `See @AGENTS.md`.
- Run scripts from this directory.

## Current Snapshot

- Stack: React 19, Vite 8, TypeScript 6, Tailwind CSS v4 (via `@tailwindcss/vite`), shadcn/ui-style Radix primitives, TanStack Query 5, React Router 7 (`createBrowserRouter`), i18next, Better Auth client, Zod 4, Recharts.
- `@/*` maps to `src/`; `@workspace/shared` maps to `../shared/src/index.ts` (also in Jest via `moduleNameMapper`).
- Dev server runs on port `8080` and proxies `/api`, `/mcp`, and `/uploads` to the backend on `3010`; `/health-data` is proxied with an `/api` prefix rewrite. Override the backend host with `VITE_BACKEND_HOST`.
- PWA (`vite-plugin-pwa`) is enabled in production builds only.

## Verified Commands

```bash
pnpm dev
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run format
pnpm run validate
pnpm test
pnpm run test:ci
pnpm run build
```

- `pnpm run validate` runs typecheck, lint (`--max-warnings 0`), Prettier check, and Knip (`pnpm run knip` for unused files and exports) together.
- `pnpm test` runs Jest (`ts-jest`, `jsdom`); config is inline in `package.json`, setup in `src/tests/setupTests.ts`.
- `pnpm run build` runs `vite build`.
- CI (`.github/workflows/ci-tests.yml`) runs `pnpm run validate` and `pnpm run test:ci` for this package when its files change; matching those locally means a green PR.

## Domain-Mirrored Layout (the most important convention)

Features are organized by domain, and the same domain folder name appears in `src/pages/`, `src/api/`, and `src/hooks/`. A feature change usually touches the matching folder in all three:

- Page domains: `Admin`, `Auth`, `Chat`, `CheckIn`, `Cycle`, `Diary`, `Errors`, `Exercises`, `Fasting`, `Foods`, `Goals`, `Integrations`, `Medications`, `Reports`, `Settings`, `Symptoms`.
- API domains add a few more: `AiConversions`, `Chatbot`, `Onboarding`, `Pregnancy`, `SleepScience`, `Symptoms`.
- Example: a Medications bug lives in `src/pages/Medications/` + `src/api/Medications/` + `src/hooks/` medication hooks. Start there, not with a repo-wide search.

## Source Map

- Food assistant state: owner-only preferences, recoverable tasks and operation history use `FoodAssistant.api.zod.ts` / `FoodAssistant.zod.ts` in shared. Server: `routes/v2/foodAssistantRoutes.ts`, `services/foodAssistantService.ts`, `models/foodAssistantRepository.ts`, `ai/tools/foodAssistantTools.ts`. Web: `src/components/ai/FoodAssistantState.tsx`, `src/api/Chatbot/foodAssistantService.ts`.

- `src/main.tsx` - app bootstrap; creates the shared `QueryClient` with global `QueryCache`/`MutationCache` handlers that render toasts from query/mutation `meta` (`errorTitle`, `errorMessage`, `successMessage`).
- `src/App.tsx` - route registry via `createBrowserRouter`, plus `PrivateRoute` and `PermissionRoute` wrappers (permission-gated areas include `reports` and `admin`).
- `src/pages/<Domain>/` - route screens by domain.
- Remote MCP OAuth UI: `src/pages/Admin/AuthenticationSettings.tsx` owns the admin feature switch, HTTPS availability warning, full-access warning, and redirect URI allowlist; `src/pages/Auth/OAuthConsent.tsx` shows the client/scopes/redirect before approval; `src/pages/Settings/OAuthClientSettings.tsx` lists and revokes connected applications; API/query code is in `src/api/Auth/oauth.ts` and `src/hooks/Auth/useOAuth.ts`
- `src/pages/Reports/Compare/` - the Reports > Compare tab (`CompareReport` is the root, mounted by `Reports.tsx` outside its loading gate), with its data from `src/hooks/Reports/useCompare.ts` and `src/api/Reports/compareApi.ts`.
- `src/api/api.ts` - `apiCall(endpoint, options)` helper: base URL `/api`, query `params`, JSON/FormData bodies, `responseType`, error toasts, `suppress404Toast`. Use it for all backend requests.
- `src/api/<Domain>/` - per-domain API clients built on `apiCall`.
- `src/hooks/<Domain>/` and `src/hooks/use*.ts(x)` - TanStack Query hooks and shared UI hooks (`use-toast`, `useDebounce`, `useAuth`, ...).
- `src/components/` - shared components; `ui/` holds the shadcn-style primitives (~37 files); domain component folders include `Foods/`, `FoodSearch/`, `FoodUnitSelector/`, `Onboarding/`, `ExerciseCharts/`, `ai/` (assistant-ui chat pieces).
- `src/contexts/` - `ActiveUserContext` (family-access acting-user switching), `PreferencesContext`, `ThemeContext`, `WaterContainerContext`, `ChatbotVisibilityContext`, `ChatToolCategoriesContext` (runtime chat tool-category selection, localStorage-backed).
- `src/layouts/` - `MainLayout.tsx` and `AddComp.tsx`.
- `src/lib/` - `auth-client.ts` (Better Auth React client), `utils.ts` (`cn`), scanner engines, sleep helpers.
- `src/services/` - pure calculation helpers (BMR, body composition, nutrient calculation), not HTTP clients.
- `src/utils/` - logging, user preferences, date helpers, misc. `browserVoiceInput.ts` owns browser speech/recording lifecycle; `hooks/AI/useVoiceInput.ts` appends transcripts to drafts without sending.
- `src/tests/` - Jest suites mirroring `components`/`contexts`/`hooks`/`services`/`utils`, plus `test-utils.tsx`.
- `public/locales/<lng>/translation.json` - i18next resources, loaded over HTTP at runtime.

When searching, ignore `node_modules/`, `dist/`, and every locale except `public/locales/en/`.

## Translations (i18n)

- Only ever edit `public/locales/en/translation.json`. The other 35 locales are machine-synced through the `sync-translations.yml` workflow and a separate SparkyFitnessTranslations repo; hand-editing them creates conflicts with that pipeline.
- UI strings go through `useTranslation()` / `t('...')` keys, not hardcoded literals.
- `en/translation.json` is ~120 KB - grep for the key or section you need instead of reading the whole file.
- Developer docs: `../docs/src/developer/translations.md`.

## Conventions

- Use `apiCall` (or an existing per-domain client) for backend requests; don't hand-roll `fetch`.
- Prefer declaring toast text via React Query `meta` on the query/mutation instead of imperative `toast(...)` calls where the global handlers cover it.
- Use `src/utils/logging.ts` helpers instead of bare `console.*`; verbosity follows the user's logging-level preference.
- Keep `YYYY-MM-DD` values as calendar-day strings; use the shared timezone/day helpers from `@workspace/shared` instead of `toISOString().split('T')[0]`.
- To learn a database table's shape, read `../shared/src/schemas/database/<Table>.zod.ts` - do not read `../db_schema_backup.sql` or the migrations.
- Auth flows go through `src/lib/auth-client.ts` and `useAuth`; acting-user (family access) state lives in `ActiveUserContext` and affects most data hooks.
- New UI should reuse `src/components/ui/` primitives and existing shared components before adding new ones.
- Food and meal quantity fields use `NumericInput` with `allowExpressions` for basic arithmetic. `utils/evaluateArithmetic.ts` parses numbers, parentheses, and `+ - * /` without executing code; invalid expressions block form submission. Other numeric fields retain their existing behavior.
- Time entry uses `TimeInput` (`'HH:mm'`) and `DateTimeInput` (`'YYYY-MM-DDTHH:mm'`) from `src/components/ui/TimeInput.tsx`, never native `<input type="time">` or `type="datetime-local"`: browsers pick 12h/24h from their language and ignore the user's `timeFormat` preference. Both take the native string formats, so call sites keep their state as-is; name them with `aria-labelledby` (an external `<Label htmlFor>` cannot target a multi-part field).
- **Cache Invalidation on Library Mutations:** When mutating foods, exercises, presets, or plans, use the domain invalidation hooks from `src/hooks/useInvalidateKeys.ts` (`useExerciseInvalidation`, `useFoodInvalidation`, `useMealInvalidation`, `useDiaryInvalidation`) to invalidate the entire family of dependent query keys including search, presets, templates, and diary daily progress.
- **Library Deletes & Snapshots:** Deleting foods or exercises uses `mode: 'delete'` which preserves logged diary history (via snapshots) and drops items from presets/plans; only explicit `delete_with_history` deletes diary entries. Empty presets are guarded against starting/logging.

## Testing and Validation

- Test files live in `src/tests/`, mirroring the source area they cover; use `test-utils.tsx` for rendering with providers.
- Run the tests nearest the touched surface first, then `pnpm run validate` for cross-cutting changes.
- Lint is strict (`--max-warnings 0`); unused imports fail the build.

## Quick Routing

- Barcode source comparison: `components/FoodSearch/BarcodeSearchResult.tsx`, `hooks/Foods/useBarcodeSearchResult.ts`, and `api/Foods/foodService.ts` use the shared barcode API contracts. Normal scans keep the selected/default provider behavior. Local hits remain visible and Other sources loads alternatives on request. Provider credentials belong to the signed-in account; lookup and alternatives cache keys also include the active profile for local matches. Comparison nutrition uses shared `barcodeNutritionPreview`; import retains the selected source's identity and original portions.

- Routing/navigation/permission issue: `src/App.tsx` (router, `PrivateRoute`, `PermissionRoute`) and `src/layouts/MainLayout.tsx`.
- API/error-toast issue: `src/api/api.ts`, then the domain client in `src/api/<Domain>/`, then the query/mutation `meta` in the calling hook.
- Auth/session issue: `src/lib/auth-client.ts`, `src/hooks/useAuth.tsx`, `src/pages/Auth/`, and the server's `auth.ts` if it crosses packages.
- Remote MCP OAuth admin, consent, or connected-app issue: `src/pages/Admin/AuthenticationSettings.tsx`, `src/pages/Auth/OAuthConsent.tsx`, `src/pages/Settings/OAuthClientSettings.tsx`, `src/api/Auth/oauth.ts`, and `src/hooks/Auth/useOAuth.ts`.
- Family-access/acting-user issue: `src/contexts/ActiveUserContext.tsx` and the hooks consuming it.
- Chat (Sparky) issue: `src/pages/Chat/`, `src/components/ai/`, `src/api/Chatbot/`. Voice controls live in `VoiceInputControl.tsx`; `VoiceInputSettings.tsx` shares server-backed enable/System/AI choices with mobile. `active_voice_ai_service_id: null` means System, never automatic inheritance from Chat. A compatible Chat model is only a suggestion. Cancelling, leaving the page, hiding the tab, or changing voice preferences releases the microphone and aborts uploads.
- Theme/preferences issue: `src/contexts/ThemeContext.tsx`, `src/contexts/PreferencesContext.tsx`, `src/api/Settings/preferences.ts`, `src/utils/userPreferences.ts`.
- Calorie goal settings: `src/pages/Settings/CalculationSettings.tsx`; `components/WeeklyWeightGoalInput.tsx` edits the `weekly` goal mode with direction and kg, g, lbs or stones + pounds per week, defaulting to the profile weight unit. Store signed kilograms in `goal_mode_weekly_change_kg` (negative loss, positive gain, zero maintenance), preserving legacy percentage modes. Use shared `formatWeeklyGoalRate` / `parseWeeklyGoalRate` for display and input; switching units preserves the canonical rate. Pass `weeklyChangeKg` to `computeCalorieTarget`; Diary preview and `CalorieTargetBreakdown` use the same preference.
- Calorie target explanation panel ("How today's target is calculated", Diary and Calculation Settings): `src/components/CalorieTargetBreakdown/`. `index.tsx` is the shell (inline expander or dialog); each numbered step is its own component (`BmrStep`, `BodyFatStep`, `AdaptiveTdeeStep` with `AdaptiveFallbackChecklist` / `AdaptiveActiveDetails` / `AdaptiveActivityNotes`, `TargetStep`), the formula text is pure in `bmrMath.ts` / `bodyFatMath.ts` / `targetFallbackNotice.ts`, and `useTrendUnits` / `useAdaptiveDisplay` hold the unit and rounding rules. The checklist's calorie row reads the server's `daysOfData` count, never the fallback reason text.
- Missing/wrong UI text: the i18n key in `public/locales/en/translation.json` and the `t('...')` call site.
- Exercise alternatives / workout feedback / adaptive suggestions (#1560): `AddExerciseDialog`'s `replaceFor` prop adds the **Suggested** tab (`pages/Exercises/ExerciseAlternativesPanel.tsx`); the workout player's Replace (lazy-loaded dialog) and load pass (`WorkoutPlaybackPage.tsx`, helpers in `utils/workoutPlayback.ts`) apply the shared `decideAdaptiveAdjustment` rules and keep both the usual and adapted sets on the draft for "Use my usual"; feedback is `pages/Diary/WorkoutFeedbackPanel.tsx` (finish dialog + expanded diary workout) via `hooks/Exercises/useWorkoutCoaching.ts`.
- Medication adherence, streak, checklist progress and month-calendar status (`pages/Medications/TodayMedications.tsx`, `MedicationLogCalendar.tsx`) are computed by `@workspace/shared` (`medications/adherence.ts`), the same code the mobile adherence screen uses; change the rules there, not in the page. The meds/supplements filter rules (`filterMedsBySubtype`, `filterEntriesBySubtype`, `visibleDoseCards`) come from `medications/subtype.ts`.
- Symptom or episode tracking (#1882): `src/pages/Symptoms/` (`SymptomsHub` is the tracker, shown on Check-in through `SymptomsPanel` and on Medications with `variant="medications"`; `SymptomLogForm` is template-driven, `SymptomsReport` is Reports > Symptoms), `src/api/Symptoms/symptomService.ts`, `src/hooks/useSymptoms.ts`. Which sections a symptom asks about comes from `resolveSections` in `@workspace/shared`; family delegates with only the symptoms permission use the standalone `/symptoms` page.
- Bodyweight exercises (#56): the `bodyweight_reps` layout in `constants/exercises.ts` (`signedWeight`) drives the +/− weight header and placeholder in the set editor; reports and trend charts count body weight through the shared `effectiveLoadKg` / `setVolumeKg` (`pages/Reports/ReportsTables.tsx`, `utils/exerciseTrendUtils.ts`, which reads `body_weight_kg` from the progress endpoint).
- `weight_distance` / `weight_duration` (#127) have their own `SET_TABLE_LAYOUT` entries: carries swap the reps cell for a distance cell (stored km, edited in metres/yards via `carryDistanceFromKm` / `carryDistanceToKm` in `@workspace/shared`), loaded holds drop reps and use the duration column.
- Training consistency (#59): `pages/Reports/TrainingConsistencyCard.tsx` in the Exercise report's left column, fed by `useTrainingConsistency` (`hooks/Reports/useReports.ts`) from `GET /reports/training-consistency`. A fixed 26-week window computed on the server by the shared `buildTrainingConsistency`, so it ignores the report's date filter; the existing `WorkoutHeatmap` stays the calendar.
- Running estimates: `pages/Reports/RunEstimatesCard.tsx` in the Exercise report's left column, fed by `useRunEstimates` (`hooks/Reports/useReports.ts`) from `GET /reports/run-estimates` (`getRunEstimates`, contract `RunningEstimatesResponse` in `@workspace/shared`): estimated VO2 max and average running power, both labelled as estimates; the card renders nothing until one exists.
- Readiness and form: `pages/Reports/FitnessFatigueCard.tsx` in the Exercise report's left column above the consistency card, fed by `useFitnessFatigue` (`hooks/Reports/useReports.ts`) from `GET /reports/fitness-fatigue` (`getFitnessFatigue`, contract `FitnessFatigueResponse` in `@workspace/shared`): today's 0 to 100 readiness with its factors (HRV and resting heart rate add a "against your usual" line from the optional `readiness.vitals`), fitness / fatigue / form numbers and the last 28 days of form. The numbers are computed on the server by the shared `computeFitnessFatigue` and `computeReadiness`; the card only draws them.
- Compare tab (day, week and since-a-habit-started questions): `src/pages/Reports/Compare/CompareReport.tsx` holds the question and span state and wires the sentence, charts and tables; wording is `compareCopy.ts` and table rows are `compareTables.ts`; question, window and display-scale logic is `shared/src/compare/`. Since questions (`mode=since`, "Before vs. since"; weight trend isn't offered in them) swap the span control for `CompareSinceControls` and show `CompareSinceAnswer`, `CompareSinceChart` and `CompareSinceMonthTable` (month table only when the answer is ok), with data from `useCompareSinceQuestion`, wording in `compareSinceCopy.ts` (which verdict case applies comes from the shared `sinceVerdictCase` in `shared/src/compare/sinceVerdict.ts`, the same one the phone uses) and rows in `compareSinceTables.ts`. It shows only the signed-in user's own data (no request while acting on behalf), and its range is its own, so the Reports date picker is hidden on this tab.
- Shoe inventory: the Equipment section of the Exercises page (`src/pages/Exercises/EquipmentManager.tsx` + `ShoeFormDialog`; there is no separate tab or route), `src/components/Shoes/ShoeSelect.tsx` (the picker used by `pages/Diary/EditExerciseEntryDialog.tsx` for cardio entries), `src/api/Shoes/shoeService.ts`, `src/hooks/Shoes/useShoes.ts`. Distances are stored in km and edited in the user's unit; assigning a shoe invalidates both `shoeKeys` and `exerciseEntryKeys` because mileage is derived from linked entries. The Equipment section also shows while acting on behalf of someone: `can_manage_diary` delegates can edit it and `can_view_reports` delegates read it, as the server enforces.
- Plate calculator: the "Plates & bars" part of the Equipment section (`EquipmentManager.tsx` `PlateInventorySection` + `PlateInventoryDialog`; hooks in `src/hooks/PlateInventory/usePlateInventory.ts`, key `plateInventoryKeys`, API `src/api/PlateInventory/`). `src/components/PlateCalculator/PlateCalculatorDialog.tsx` is opened from the dumbbell action on `WorkoutPlaybackSetRow` for barbell exercises (`usesBarbell(exercise.equipment)`; the draft carries `equipment`). Until an inventory is saved, `inventoryConfigFrom` falls back to the standard preset for the person's unit. All maths is `@workspace/shared` `calculatePlateLoad`.
- Running fitness tests (5K time trial, 30-minute run, Cooper test): read-only `components/ExerciseCharts/FitnessTestsCard.tsx` at the top of Reports > Exercise > Cardio, fed by `hooks/Exercises/useFitnessTests.ts` over `api/Exercises/fitnessTestService.ts` (`GET /api/v2/fitness-tests`). The tests are recorded in the mobile app and are owner-only on the server, so the hook is disabled while `isActingOnBehalf` is true. The paces come from the server's stored `paces`; the card only formats them, and marks treadmill tests (`surface`, `incline_percent`, `incline_adjusted`).
- Training programs (run and walk plans): the `/exercises/training-programs` route (`src/pages/Exercises/TrainingPrograms/`: `TrainingPrograms` is the page, `TrainingProgramPicker` the built-in list with the 3 or 4 runs a week choice and the person's own plans, `StartProgramDialog` the start day, `TrainingProgramCard` the running program, `TrainingProgramCalendar` the month view, projected finish day, goal-date fit and catch-up), reached from `TrainingProgramsEntry` on the Exercises page, and `pages/Diary/RunProgramBanner.tsx` in the Diary's exercise card. Data is `GET/PUT /api/v2/run-program` plus `POST .../complete` and `GET .../custom` through `src/api/Exercises/runPrograms.ts` and `src/hooks/Exercises/useRunProgram.ts`; the server route is owner-only (`requireSelfActor`), so every hook and the banner stay off while `isActingOnBehalf`. All schedule maths comes from `@workspace/shared` (`projectRuns`, `projectedFinishDay`, `programRunForDate`, `catchUpFor`, `buildProgramTimeline`), never re-derived here. Request bodies come from `utils/runPrograms.ts`; `useSaveRunProgramMutation` runs changes one at a time (mutation `scope`) and accepts a function of the program as it stands, so two quick weekday taps both land. Mutations write the response into `runProgramKeys.current()` and call `useRunProgramInvalidation` (program, workout plan, exercise entry and daily progress families); `useDiaryInvalidation` and `useExerciseInvalidation` also refresh `runProgramKeys.all`. English program names, descriptions and week layouts live in `constants/runProgramCopy.ts` and mirror `trainingPrograms.programs.<id>.*` in the locale file. The web does not record runs: **Mark workout as done** (card and Diary) is how a workout is ticked off. Not on web yet: creating or editing custom plans, the race plan builder, the effort rating, the ease-back offers and the workout detail screen.
- Heart rate zones: Settings → Profile & Account → Heart Rate Zones (`src/pages/Settings/HeartRateZoneSettings.tsx`, `src/hooks/Settings/useHeartRateZones.ts`, `src/api/Settings/heartRateZones.ts` over `GET`/`PUT /api/v2/heart-rate-zones`). Zone maths is shared (`@workspace/shared` `heartRateZones.ts`); labels are in `src/utils/heartRateZoneLabels.ts`. `ActivityHeartRateZonesChart` takes `zoneMethod` (from the stored `zone_method` of the workout's zone rows) and says which method the zones were worked out with; stored zones are never recomputed when settings change.
- Routing provider (Valhalla, route generation and Follow roads): a Settings > External Providers type like Mealie, with `pages/Settings/RoutingProviderFields.tsx` (empty server URL with an example placeholder and no default server, optional API key, privacy and public-server notes) used by `ProviderSpecificFields` (add) and `EditProviderForm`; the type row is seeded by the server migration, the server resolves it per person (see the server guide).
- Weather provider (Open-Meteo compatible, weather of GPS-recorded activities): a Settings > External Providers type of `open_meteo`, with `pages/Settings/WeatherProviderFields.tsx` (empty server URL with the public Open-Meteo address as a placeholder only, optional API key, a note that the activity's start time and start place rounded to two decimals are sent to the server and that the free tier is non-commercial) wired into `ProviderSpecificFields`, `EditProviderForm`, `ProviderCard`, `ExternalProviderList`, `utils/settings.ts` and `api/Settings/externalProviderService.ts` next to `valhalla`; the server resolves it per person (see the server guide). There is no admin switch.
- Reports > Heart Rate: `pages/Reports/HeartRateAnalyticsCard.tsx` only composes the report; the pieces are in `pages/Reports/HeartRate/`. `useHeartRateWindow` holds the visible window (whole days, reset when the report range changes), `useHeartRateData` derives everything the charts show (recorded readings, daily averages, the day timeline, sleep and workout bands, stats, resting HR trend), `useHeartRateChartTheme` the chart colors. `HeartRateWindowControls.tsx` has the 24H/3D/7D/All presets (`HeartRateWindowPresets`) and the strip under the charts (`HeartRateWindowBrush`, built on `components/DateRangeBrush.tsx`: drag the fill to pan, drag either edge to resize, arrow keys work too). A window of up to 3 days (`DETAILED_MAX_DAYS`) shows every reading with sleep and workout shading, longer windows show one average per day (`HeartRateRangeTimeline.tsx`), and a single-day window uses the 24-hour view (`HeartRateDayTimeline.tsx`). `RestingHrTrendSection.tsx` is the resting HR trend; `HeartRateWorkoutsSection.tsx` lists the workouts through `WorkoutHeartRateItem.tsx`, whose time-in-zone bars are `WorkoutZoneSummary.tsx` fed by `useWorkoutZoneBreakdown.ts`. Day maths and snapping are in `utils/heartRateWindow.ts`; line colors follow the person's zones (five, or four tiers when they chose `display_zones: 4`): `utils/heartRateZoneBands.ts` (gradient edges) and `hooks/Settings/useHeartRateZones.ts` `useResolvedHeartRateZones` (their zones and `bands` from shared `heartRateDisplayBands`, shared defaults until loaded); `components/HeartRateZoneLegend.tsx` shows the bands with bpm ranges, where they come from and a link to Settings; per-workout bars sum the zones in each band. The Settings **Show** select (5 zones or 4 tiers) only changes display. No fixed bpm. Only recorded readings are plotted, so days without data are gaps. A day has one `health_metric_samples` row per source and the API does not order them within the day, so read a day's samples with `utils/healthMetricSamples.ts` `samplesForDay` (all rows), not the first row.
- Workout counted twice in the calorie balance (#2353): the Advanced section of `pages/Diary/EditExerciseEntryDialog.tsx` has **Calories counted in daily total** (`calories_applied`; blank counts the estimate, 0 drops the entry from the balance). Diary totals (`hooks/Diary/useDailyProgress.ts`, `ExerciseCard.tsx`, `ExerciseEntryDisplay.tsx`, `ExercisePresetEntryDisplay.tsx`) all go through the shared `entryCaloriesCounted`, never `calories_burned` directly. A manually logged workout (an individual entry or a strength session) also has a **Link a synced workout** action (`pages/Diary/LinkSyncedWorkoutDialog.tsx`, opened from `ExerciseCard` through the `onLink` prop of `ExerciseEntryDisplay` / `ExercisePresetEntryDisplay`, shown only with diary write permission): it lists that day's synced workouts with the server's match hint, offers what to count (this workout, the synced one, higher, lower, average, custom) and unlinks. Hooks: `useCalorieLinkSuggestions` / `useSetCalorieLinkMutation` / `useClearCalorieLinkMutation` in `hooks/Exercises/useExerciseEntries.ts`.
- Chart issue: Recharts usage in the domain page plus `src/components/ExerciseCharts/` or `ZoomableChart.tsx`.

## Priority Rule

- For work inside `SparkyFitnessFrontend/`, this file wins over repo-root guidance on package-specific details.
- If a task spans packages, combine this guide with the other affected package guides.
- If you add a new domain folder, route family, or cross-cutting convention, update the Domain list, Source Map, and Quick Routing sections of this file in the same change.
