# CLAUDE.md

*Last updated: 2026-06-24*

SparkyFitness Mobile is a React Native (0.83) + Expo (SDK 55) app for syncing health data (HealthKit/Health Connect) to a personal server and displaying daily nutrition, exercise, workout tracking, fasting, and hydration summaries.

## Project Overview

TypeScript-first React Native / Expo app. Always keep changes type-safe and compiling cleanly. Primary stack: React Navigation, React Native Skia + victory-native for charts, Reanimated for animations, Expo Background Task for sync, react-native-toast-message for notifications, Zustand for cross-screen state. Shared types via `@workspace/shared` (Zod schemas + types shared with the server).

## Commands

```bash
npx expo run:ios                               # Dev build
npx expo run:ios --device                      # Physical device
npx expo prebuild -c                           # Clean rebuild (after native changes)
pnpm run validate                              # tsc --noEmit + expo lint
pnpm test:watch                                # Watch mode
pnpm run test -- __tests__/path/to/test        # Single file
tsc --noEmit                                   # Type check only
```

## Architecture

### Navigation

- `App.tsx` — Root providers: `QueryClientProvider` → `GestureHandlerRootView` → `KeyboardProvider` → `BottomSheetModalProvider` → `NavigationContainer` → `SafeAreaProvider` → `Toast`. Every screen is wrapped with `withErrorBoundary(...)` (from `ScreenErrorBoundary`) so a crashing screen falls back to a graceful in-place error UI.
- **Root Stack** (`@react-navigation/stack`): `Onboarding` (when no server config) or `Tabs`, plus food/exercise/workout flows, settings subscreens, `Logs`, `Sync`, and `FastingDetail`.
- **Tab Navigator**: Dashboard, Diary, Add (opens `AddSheet` bottom sheet), Library, Settings. `CustomTabBar` has a floating "Add" button; `TAB_BAR_HEIGHT = 56`.
- Tab icons: SF Symbols on iOS, Ionicons on Android (via `Icon`).

### Source Structure (`src/`)

- **components/** — UI primitives and feature components: dashboard cards (`CalorieRingCard`, `MacroCard`/`NutritionMacroCard`/`MacroSummaryCard`/`MacroCompositionRing`, `HydrationGauge`, `FastingCard`, `WorkoutCard`, `ExerciseProgressCard`), chart components (Skia + victory-native), diary views, swipe-to-delete + long-press delete rows (`SwipeableFoodRow`, `SwipeableExerciseRow`, `SwipeableIngredientRow`), serving quick-adjust (`ServingAdjustSheet`) + unit selection (`FoodUnitSelectorSheet`), shared input primitives (`SegmentedControl`, `StepperInput`, `CollapsibleSection`), health-data writeback UI (`HealthDataWriteback`, `DateRangeSheet`), fasting (`FastingProtocolSheet`, headless `FastingGoalReconciler`), dev-only seeding (`DevTools`), workout display/editing (`EditableExerciseCard` with `ExerciseStatsChip`, `EditableSetRow`, `WorkoutEditableExerciseList`, `RestPeriodChip`/`RestPeriodSheet`), workout execution (`ActiveWorkoutBar` — floats above every screen, exports `useActiveWorkoutBarPadding` and `navigationRef`), navigation (`CustomTabBar`), settings UI (`SettingsRow`/`SettingsRowGroup`), what's-new (`WhatsNewBanner`), auth (`MfaForm`), modals (`ReauthModal`, `ServerConfigModal`), and `ui/` primitives (`Button`, `toastConfig`).
- **screens/** — Onboarding (multi-step incl. theme + external food source config), dashboard, diary, sync, logs, `WhatsNewScreen`, `FastingDetailScreen`; settings hub (`SettingsScreen`) with subscreens (`ServerSettingsScreen`, `AppSettingsScreen` for theme + haptics + sounds + notifications, `DashboardSettingsScreen` for card visibility + nutrient display, `CalorieSettingsScreen`, `FoodSettingsScreen`, `AboutScreen`); library hub (`LibraryScreen`) with foods (`FoodsLibraryScreen`/`FoodDetailScreen`/`FoodFormScreen`/`EditBarcodeScreen`), meals (`MealsLibraryScreen`/`MealAddScreen`/`MealDetailScreen`/`MealTypeDetailScreen`), exercises (`ExercisesLibraryScreen`/`ExerciseDetailScreen`/`ExerciseFormScreen`), workout presets (`WorkoutPresetsLibraryScreen`/`WorkoutPresetDetailScreen`/`WorkoutPresetFormScreen`); workouts/activities (add + detail), exercise/preset search, food search/scan/entry/view (`FoodEntryViewScreen`), logged-meal editing (`EditLoggedMealScreen`), food photo AI estimation (`FoodPhotoIntroScreen` + `FoodPhotoFlow` sub-stack), measurements (`MeasurementsAddScreen`). `DashboardScreen`/`DiaryScreen` support fling gestures for date navigation.
- **services/** — Subdirectories:
  - `api/` — API clients (`apiClient` with proxy header injection, `authService`, `dailySummaryApi`, `goalsApi`, `exerciseApi`, `foodsApi`, `foodEntriesApi`, `foodEntryMealsApi`, `mealsApi`, `measurementsApi`, `healthDataApi`, `fastingApi`, `customNutrientsApi`, `aiSettingsApi`/`aiConversionApi`, `errors`, etc.)
  - `healthconnect/` — Android health read/aggregation/transformation/preferences + `writeback.ts`
  - `healthkit/` — iOS equivalents plus `backgroundDelivery` + `writeback.ts`
  - `shared/` — `preferences.ts` factory + `healthPermissionMigration.ts`
  - Top-level: `healthConnectService.ts`/`.ios.ts` (platform orchestration), `writeback.ts`/`.ios.ts` (platform writeback re-exports), `backgroundSyncService`, `autoSyncCoordinator`, `healthDataDisplay`, `calculations` (BMR / Navy body-fat / calorie-balance / age), `storage`, `LogService`, `themeService`, `workoutDraftService`, `mealBuilderSelection`, `foodSearchPreferences`, `whatsNewBanner`, `diagnosticReportService`, `healthDiagnosticService` (Android-only), `seedHealthData`/`.ios.ts` (dev-only), `notifications` (rest-timer + fasting-goal scheduling), `booleanPreference` (app-local toggle factory), `haptics`, `sounds`, `hydrationCardVisibility`, `fastingCardVisibility`.
- **stores/** — Zustand stores (persisted via `zustand/middleware`). See **Workout timer** below for `activeWorkoutStore`.
- **hooks/** — React Query hooks by domain (food, food-entry-meals, meals, exercise/workout, workout presets, measurements, profile, preferences). Fasting: `useFasting` (current/stats/history/start/end + `useFastingGoalReconciler`), `useFastingTimer`. Nutrients: `useCustomNutrients`, `useNutrientDisplayPreferences`. AI: `useActiveAiServiceSetting`, `useUserAiConfigAllowed`, `useUnitConversion`, `useEstimateFoodPhoto`. Also `useCopyFoodEntries`, `useUpsertCheckIn`. `useAuth` manages reauth/setup/api-key-switch modals. `useWidgetSync` pushes daily summary snapshots to iOS + Android widgets. Shared cache helpers: `invalidateExerciseCache`, `syncExerciseSessionInCache`, `refreshHealthSyncCache`. Query keys in `hooks/queryKeys.ts`.
- **native/** — TS bridges to native modules (e.g., `CalorieWidgetBridge` for Android Glance widget reload).
- **types/** — TypeScript interfaces (incl. `fasting.ts`). Core exercise session types come from `@workspace/shared`.
- **utils/** — `dateUtils`, `unitConversions` (kg/lbs, km/miles — server storage is metric), `concurrency` (`withTimeout`, `runTasksInBatches`), `syncUtils`, `workoutSession` (display + stats + `buildExercisesPayload`), `activityDetails`, `foodDetails`, `mealNutrition`, `nutrientUtils` (nutrient aggregation + `toggleNutrientVisibility`), `mealBuilderDraft`, `loggedMealCollapse`, `fasting` (timer/stat formatting), `numericInput` (locale-tolerant decimal parsing), `foodPhotoEstimate` (`mapEstimateError`), `rateLimiter`.
- **constants/** — `meals.ts`, `exercise.ts`, `fasting.ts` (presets + metabolic stages), `nutrients.ts` (nutrient metadata + default summary nutrients).
- **HealthMetrics.ts** — Health metric definitions filtered by platform and enabled status at runtime.
- **plugins/** — Expo config plugins applied at prebuild: `withCalorieWidget`, `withGlanceAndroidSupport`, `withNetworkSecurityConfig`. Edit `targets/`, never the generated `android/` or `ios/` folders.

### Platform-Specific Code

- `healthConnectService.ts` — Android orchestration (imports from `healthconnect/`)
- `healthConnectService.ios.ts` — iOS orchestration (imports from `healthkit/`)

**IMPORTANT**: Both files implement their own `syncHealthData()` with substantial sync logic. They are NOT thin re-exports. Edit the platform-specific file directly for sync changes (e.g., `.ios.ts` for iOS).

Both orchestrators use batched concurrent metric fetching via `runTasksInBatches`: `METRIC_FETCH_CONCURRENCY = 3`, `METRIC_TIMEOUT_MS = 60_000`, auto-skip remaining batches on `TimeoutError`. Both exercise transformers emit a default "Working Set" with duration for each synced exercise session.

### Health Data Upload

`healthDataApi.ts` handles chunked upload with retry:
- `CHUNK_SIZE = 5_000` simple measurements per request. Exercise/Workout sessions are grouped by source and sent unsplit (the server range-deletes per source before inserting). Sleep sessions are chunked by `SESSION_CHUNK_SIZE = 50` — safe to split since the server merges sleep by natural key with no range-delete (issue #1180), and they are the expensive type to process server-side (issue #1263).
- `fetchWithTimeout` wraps fetch with `AbortController` (`FETCH_TIMEOUT_MS = 30_000`).
- `fetchWithRetry` adds exponential backoff (up to `MAX_RETRIES = 3`, skips 4xx); triggers `notifySessionExpired` on 401 for session auth.

`services/autoSyncCoordinator.ts` mediates between background-task syncs and foreground sync-on-open: an in-memory `tryClaimAutoSync()` lock prevents double-fires within an app-open window, and a per-config `AUTO_SYNC_COOLDOWN_MS = 5min` cooldown (stored under `@AutoSync:lastAutoSyncAt:<configId>`) gates `shouldRunForegroundResumeAutoSync()`. Call `recordAutoSyncTime(configId)` after any successful auto-sync.

### Health Data Writeback

Writes Sparky diary **nutrition** + **hydration** back out to Apple Health (iOS) / Health Connect (Android), opt-in per metric and gated on write permission. Platform split: `services/writeback.ios.ts` → `healthkit/writeback.ts`; `services/writeback.ts` → `healthconnect/writeback.ts`. Runs after the inbound sync inside `runWriteback()` (try/catch so a writeback failure never blocks the inbound result).

- Writes one food correlation per manually-logged entry (imported entries with a `source` are skipped); one daily water sample. Per-day **content-signature hashing** skips unchanged days (no HealthKit I/O); each run deletes the prior run's tracked UUIDs then saves fresh, retrying failed deletes next run. `WRITEBACK_DATE_CONCURRENCY = 3`.
- **Inbound nutrition sync** (iOS) reads food correlations with a rolling `NUTRITION_LOOKBACK_DAYS = 2` window; idempotent via server-side upsert by `(source, source_id)`.
- **Remove flow** (`HealthDataWriteback` on `SyncScreen`): a `BottomSheetPicker` offers "All time" (full purge, disables writeback) or "Pick a date range…" (`DateRangeSheet`). Both call `removeWrittenData(range)` and clear tracking keys.

### React Query

- `staleTime: Infinity` on the global client — manual refresh only (some hooks override, e.g., preferences uses 30min).
- `useRefetchOnFocus(refetch, enabled)` — standard hook for refetching on screen focus.
- Query keys are centralized in `hooks/queryKeys.ts` (static arrays + parameterized functions like `dailySummaryQueryKey(date)`, `measurementsRangeQueryKey(start, end)`, `exerciseSearchQueryKey(term)`).

### Local Preferences (booleanPreference factory)

`services/booleanPreference.ts` — `createBooleanPreference(key, default)` returns `{ get, set, use (via useSyncExternalStore), initialize, subscribe }` for app-local boolean toggles persisted to AsyncStorage and **never synced to the server**. All keys are prefixed `@HealthConnect:`. Current users: haptics (`hapticsEnabled`), sounds (`soundsEnabled`), notifications (`notificationsEnabled` — gates rest-timer + fasting-goal alerts; toggling off cancels future scheduled notifications), hydration card (`hydrationCardVisible`), fasting card (`fastingCardVisible`). Haptics/sounds/notifications surface in `AppSettingsScreen`; card visibility in `DashboardSettingsScreen`.

### Styling (TailwindCSS v4 + Uniwind)

TailwindCSS v4 with Uniwind for React Native. Theme variables in `global.css`:
- `className="bg-surface text-text-primary rounded-md p-4"`
- `useCSSVariable('--color-accent-primary')` for JS access (used extensively in Skia charts)
- Themes: **Light**, **Dark**, **AMOLED** (true black), **System** — managed by `themeService.ts`, stored in AsyncStorage. On Android, `App.tsx` keeps the system navigation bar in sync via `expo-navigation-bar`.
- CSS variable categories: backgrounds, borders, text, accents, tabs, forms, data colors (`calories`, `macro-*`, `hydration`, `exercise`), category colors (`cat-slate`/`cat-pink`/`cat-violet`/`cat-orange` — settings row icon tints), progress, status.

### Charts

Custom rendering (calorie ring, gauges) uses `@shopify/react-native-skia`; data charts (bar charts) use `victory-native`. For animations, drive Skia paths from Reanimated `useSharedValue` + `useDerivedValue` — not Skia's deprecated animation API.

### iOS HealthKit Accuracy

For **cumulative metrics** (steps, calories), use `queryStatisticsForQuantity` with `cumulativeSum` to match Health app values. Raw samples produce incorrect totals. **Correct approach:** Steps (`getAggregatedStepsByDate`), Active/Total Calories, Distance, Floors Climbed. **Fine with raw samples:** Heart Rate, Weight, Body Fat, Sleep, etc.

### Android Health Connect Aggregation

Cumulative metrics (Steps, Distance, Active/Total Calories, Floors) are aggregated via HC's native `aggregateGroupByPeriod` — one call per range, not per day. HC's source-priority dedup matches the Health Connect UI, so callers do not Math.max/dedup in JS (issue #1279). `enrichExerciseSessions` attaches per-session calories+distance via `aggregateRecord` over each session's time window, scoped to its `dataOrigin`.

Read paths return a `{ records, error }` envelope (`readHealthRecordsDetailed`, `aggregateCumulativeMetricByDayDetailed`); legacy non-detailed wrappers just unwrap `.records`. `backgroundSyncService` and `useSyncHealthData` skip persisting the last-synced timestamp when any metric returned a partial result or error — a transient failure doesn't silently advance the cursor past unsynced data.

App manifest grants `android.permission.health.READ_HEALTH_DATA_HISTORY` (in `app.config.ts`) so reads can reach data older than 30 days.

**Patch — `react-native-health-connect@3.5.3`**: The library's `getAggregateGroupByPeriodRequest` only applied the `LocalDateTime` filter fix to `Steps`; every other record type still called the instant-based `getTimeRangeFilter`, breaking per-day grouping at DST boundaries and for non-Steps cumulative metrics. Patched at repo root (`patches/react-native-health-connect@3.5.3.patch`, wired via `pnpm.patchedDependencies`) to rewrite ~20 record types to `getTimeRangeFilterLocal`. Re-run `pnpm install` after editing the patch, then `npx expo prebuild -c`. See `feedback_react_native_health_connect_local_filter`.

### Logging

`LogService.ts` is the single source of truth for app logs. Prefer `addLog(message, status?, details?)` over `console.*` everywhere (see `feedback_logging`).

- **Status type**: `LogStatus = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'`. Legacy `'SUCCESS'` is migrated to `'INFO'` on read via `migrateLogEntry`.
- **Two independent thresholds** sharing `LogThreshold = 'all' | 'no_debug' | 'warnings_errors' | 'errors_only'`: capture level (`log_capture_level`) drops below-threshold entries before storage; view filter (`log_view_filter` + `log_view_selected_statuses`) drives what `LogScreen` shows.
- Writes are buffered (batched flush with AppState-aware draining); `flushLogs()` is safe from shutdown paths.
- Pass a structured `details` array rather than stuffing context into `message` — `LogScreen` renders details as separate lines and `diagnosticReportService` preserves them.

### Authentication & Proxy Headers

Two auth modes per `ServerConfig.authType`:
- **`apiKey`** — API key sent as `Authorization: Bearer <API_KEY>`. Configured via `ServerConfigModal`.
- **`session`** — Session token via `authService.ts` (email/password, optional MFA via TOTP or email OTP). Configured via `OnboardingScreen` or `ReauthModal`.

Three auth-UI entry points: `OnboardingScreen` (first-time setup, initial route when no config), `ReauthModal` (shown by `useAuth` on 401 — server picker + "Use API Key Instead" fallback), `ServerConfigModal` (edit server/key/proxy headers from Settings). MFA logic is shared via `MfaForm` (`src/components/auth/MfaForm.tsx`).

**Proxy Headers**: Per-server custom HTTP headers for reverse proxy auth (Pangolin, Cloudflare Access). Stored in SecureStore as `ProxyHeader[]` on each `ServerConfig`. Injected globally via `proxyHeadersToRecord()` in `apiClient.ts` and raw fetch calls in `healthDataApi.ts`. During login, `setPendingProxyHeaders()`/`clearPendingProxyHeaders()` on `authService` manages headers before a config is saved.

### Shared Workspace (`@workspace/shared`)

Monorepo package at `../shared/` providing Zod schemas, types, constants, and timezone utilities shared with the server. Key exports:
- **Exercise/workout types**: `ExerciseSessionResponse` (discriminated union: `IndividualSessionResponse | PresetSessionResponse`), `ExerciseHistoryResponse`, `CreatePresetSessionRequest`, `ExerciseEntryResponse`, `ExerciseEntrySetResponse`, `ActivityDetailResponse`, `Pagination`.
- **API schemas**: `dailySummaryResponseSchema`/`DailySummaryResponse`, `dailyGoalsResponseSchema`, `foodEntryResponseSchema`, `exerciseSessionResponseSchema`.
- **Constants**: `MEASUREMENT_PRECISION`/`getPrecision()`, `CALORIE_CALCULATION_CONSTANTS`/`ACTIVITY_MULTIPLIERS`.
- **Timezone utilities** (`shared/src/utils/timezone.ts`): day-string ops (`isDayString`, `addDays`, `compareDays`, `dayToPickerDate`, `localDateToDay`) and conversions (`isValidTimeZone`, `todayInZone`, `instantToDay`, `userHourMinute`, `dayToUtcRange`, `dayRangeToUtcRange`).

### Dashboard, Cards & Custom Nutrients

`DashboardSettingsScreen` (reached from `SettingsScreen`) controls two things: **card visibility** (hydration + fasting, via the `booleanPreference` toggles above — `DashboardScreen` conditionally renders each card) and **custom nutrient display**.

- **Custom nutrients** are user-defined nutrients (name + unit) created in the web app. On mobile they are viewable/editable in `FoodFormScreen`/`FoodDetailScreen` and surface in `FoodEntryViewScreen`/edit and the diary/dashboard macro grid. Fetched via `useCustomNutrients` (`GET /api/custom-nutrients`).
- **Nutrient display preferences** control which nutrients appear (and order) on the dashboard summary grid, per `viewGroup`/`platform`. `useNutrientDisplayPreferences` reads `GET /api/preferences/nutrient-display`; toggling persists via `PUT /api/preferences/nutrient-display/:viewGroup/:platform` (full-array replace, not merge). Defaults + nutrient metadata live in `constants/nutrients.ts`; `utils/nutrientUtils.ts` provides `toggleNutrientVisibility`.
- Nutrients with no goal render the consumed value only — `MacroCard` hides the progress bar + goal label when the goal is null/0 (saves grid space).

### Fasting

Intermittent-fast tracking. `FastingDetailScreen` shows the active fast (HH:MM:SS timer, progress ring, metabolic-stage timeline, stats, start/end actions); `FastingCard` is the dashboard summary; `FastingProtocolSheet` picks a preset (16:8, 18:6, 20:4, Circadian, Custom from `constants/fasting.ts`). Hooks: `useFasting` (`useCurrentFast`/`useFastingStats`/`useFastingHistory`/`useStartFast`/`useEndFast` + `useFastingGoalReconciler`), `useFastingTimer` (1s tick → elapsed/remaining/stage); formatting in `utils/fasting.ts`. API: `POST /api/fasting/start`·`/end`, `GET /api/fasting/current`·`/stats`·`/history`.

`FastingGoalReconciler` is a **headless** component mounted unconditionally on `DashboardScreen` — it owns goal-notification reconciliation + app-resume refetch, so a goal notification still fires when the fasting card is hidden (or the fast was started on another device). Goal alerts are scheduled via `services/notifications` (`scheduleFastGoalNotification`), gated by the `notificationsEnabled` toggle; ending/canceling a fast clears the scheduled notification.

### iOS Widget Extension

iOS home-screen widgets live under `targets/widget/` (managed by `@bacons/apple-targets`, configured in `app.config.ts` / `targets/widget/expo-target.config.js`). Two widgets: **Calorie** (`widgets.swift`, kind `widget`) and **Macro** (`macroWidget.swift`, kind `macroWidget`).

Data flow: RN writes snapshots into the shared iOS app group (`Constants.expoConfig.extra.iosAppGroup`, from `app.identifiers.js`) via `ExtensionStorage`. `useWidgetSync(summary)` on `DashboardScreen` writes `calorieSnapshot` + `macroSnapshot` when *today's* summary changes, then calls `ExtensionStorage.reloadWidget(kind)`. Swift widgets read via `UserDefaults(suiteName:)` (`SharedHelpers.swift`). When changing display, update both the Swift view and the TS snapshot shape; when adding a widget, register its kind in `index.swift`, bump the reload in `useWidgetSync`, and re-run `npx expo prebuild -c`. App Icons live under `targets/widget/assets/AppIcon.appiconset/`.

### Android Widget Extension

Android home-screen widgets are Glance-based, under `targets/android-widget/` (Kotlin + `res/`). They are stamped into the generated Android project at prebuild by `plugins/withCalorieWidget.ts`, which copies the tree, expands `.kt.tmpl` files (substituting the resolved `applicationId`), registers each receiver in `AndroidManifest.xml`, and adds `CalorieWidgetPackage` to `MainApplication`. Two widgets ship today: `CalorieWidget` (kind `widget`) and `MacroWidget` (kind `macroWidget`), each with its own `Receiver`, `Module`, `*_widget_info.xml`, and `PREFS_*` namespace.

Data flow: `useWidgetSync` calls `src/native/CalorieWidgetBridge.ts` (Android branch) to push snapshots and reload Glance — same `summary` payload as iOS. After any change to `targets/android-widget/` or the plugin, run `npx expo prebuild -c`. The pattern for adding a third widget is documented at the top of `plugins/withCalorieWidget.ts`.

### Library Tab

`LibraryScreen` is the entry point for all user-saved content — foods, meals, exercises, workout presets — with "Create" tiles, a recent-items preview per section, and "View all" pushing the paginated list:

- **Foods** — `FoodsLibraryScreen` → `FoodDetailScreen` → `FoodFormScreen` (modes: `create-food`, `edit-food`, `adjust-entry-nutrition`). Backed by `useFoodsLibrary`/`useFoodVariants`/`useDeleteFood`. Nutrition transforms live in `utils/foodDetails.ts`, shared across food + photo-review screens. `FoodForm` supports **equivalent serving sizes** (variants grouped by nutrient signature, edited inline, persisted via `foodsApi` variant endpoints), an auto-scale-nutrition toggle, a `convertServingSizeOnUnitChange` opt-in (g↔oz; cross-category g→cup offers an AI conversion via `shouldOfferAiConversion` + `useUnitConversion`), and a `headerChildren` slot. `EditBarcodeScreen` manages additional barcodes so a rescanned barcode finds the right food.
- **Meals** — `MealsLibraryScreen` → `MealDetailScreen` + `MealAddScreen` (meal builder). Cross-screen ingredient handoff via `services/mealBuilderSelection.ts`. `MealTypeDetailScreen` shows a single meal type's day view (and copy-to-another-day via `useCopyFoodEntries`). A meal can be logged as one grouped diary entry via `foodEntryMealsApi` and edited later in `EditLoggedMealScreen`.
- **Exercises** — `ExercisesLibraryScreen` → `ExerciseDetailScreen` → `ExerciseFormScreen` for user-created exercises.
- **Workout Presets** — `WorkoutPresetsLibraryScreen` → `WorkoutPresetDetailScreen` → `WorkoutPresetFormScreen` for reusable presets that feed `WorkoutAddScreen`.

Edit/Delete actions are owner-gated on `profile.id === <entity>.userId`. Diary rows support swipe-to-delete and long-press delete confirmation.

`useFoodsLibrary` (infinite query) uses `queryClient.resetQueries` instead of `query.refetch()` on focus/pull-to-refresh — `refetch()` re-downloads every cached page. Same pattern as `useExerciseHistory`. `loadMore` gates on `isFetching` (not just `isFetchingNextPage`) so pagination can't overlap a reset and leave gaps. Apply this to other paginated library hooks when revisiting them.

`BottomSheetPicker` and `CalendarSheet` pass `containerComponent={FullWindowOverlay}` (iOS only) so the sheets render in a UIWindow above native modal presentation, avoiding the nested-provider bottom-inset pollution earlier versions hit.

### Food Photo Estimation

AI nutrition estimate from a photo. **Attempt-all**: works with any configured AI provider — the server's `dispatchAiRequest` tries whatever `service_type` is active; an unbuildable provider surfaces as `UNSUPPORTED_PROVIDER`. Availability is fetched via `useActiveAiServiceSetting` (5-min staleTime) and gated through `isFoodPhotoAvailable(setting)` (any non-empty `service_type`) from `services/api/aiSettingsApi.ts`.

Entry points: **AddSheet "Scan Food"** → `FoodScanScreen` (`Barcode | Label | Photo` switcher; Photo hidden when `pickerMode === 'meal-builder'`; re-tapping Photo refetches the AI setting); **FoodSearchScreen empty state** "Estimate from photo" → `FoodScan` with `initialMode: 'photo'`; **first-run intro** (`FoodPhotoIntroScreen`, persisted via `services/foodPhotoIntro.ts`, `@FoodPhoto:hasSeenIntro`).

Sub-stack `FoodPhotoFlow` (`src/navigation/FoodPhotoFlow.tsx`, presented modally; wraps itself in its own `KeyboardProvider`): `FoodPhotoImproveScreen` (capture + description + total weight) → `FoodPhotoEstimateReviewScreen` (review/edit via shared `FoodForm`) → `FoodPhotoLogEntryScreen` (meal type / servings → log). API: `POST /api/foods/estimate-food-photo` via `estimateFoodPhoto()` in `externalFoodSearchApi.ts` (raw `fetch` + proxy headers; throws typed `FoodPhotoEstimateError`). Hook: `useEstimateFoodPhoto`. Error→copy mapping in `mapEstimateError()`.

### Workout & Exercise Architecture

Two session types via discriminated union (`ExerciseSessionResponse`):
- **Preset** (`type: 'preset'`): grouped workout with named exercises and per-exercise sets (weight/reps). Created in `WorkoutAddScreen`, viewed/edited in `WorkoutDetailScreen`.
- **Individual** (`type: 'individual'`): single exercise with duration, optional distance, calories. Created in `ActivityAddScreen`, viewed/edited in `ActivityDetailScreen`.

**Draft system**: `workoutDraftService` persists in-progress forms to AsyncStorage (`@SessionDraft`). `useWorkoutForm` and `useActivityForm` share `useDraftPersistence` (300ms debounce + AppState background saves). Resume/discard prompt lives in `App.tsx`'s `handleStartExerciseForm`.

**Exercise selection**: `ExerciseSearchScreen` operates in `returnKey` mode only — returns via `CommonActions.setParams` + nonce pattern (`useSelectedExercise`). AddSheet navigates directly to `WorkoutAdd`/`ActivityAdd`/`PresetSearch`.

**External providers**: `useExternalProviders({ category })` filters by the provider's server-side `categories` array (`'food'` | `'exercise'` | `'other'`, default `'food'`), plus optional `supportsBarcode`. A legacy `filterSet` of provider types is still accepted as a fallback. Provider types are no longer hardcoded client-side.

**Workout timer (rest timer HUD)**: State in `stores/activeWorkoutStore` (zustand + AsyncStorage persist) — survives backgrounding and cold starts. Organized around an `activeSetId` cursor (forward-only) and a `rest` object (`ready`/`resting`/`paused`) representing the rest *before* `activeSetId`. Completing a set advances the cursor and starts the next rest. `ActiveWorkoutBar` is a sibling of the root navigator and deep-links into `WorkoutDetail` via the shared `navigationRef`. In `WorkoutDetailScreen`: tap the active set to complete + advance, tap a completed set to uncheck, long-press a later set to confirm a forward jump. Rest notifications via `services/notifications` (expo-notifications + expo-haptics; Android `workout-timer` channel set up in `initNotifications()`). Set IDs are preserved server-side across edits so the cursor stays bound to the right rows.

**Configurable rest duration**: `restPeriodSec` per-exercise on `WorkoutPresetExercise` (default `DEFAULT_REST_SEC = 90` from `RestPeriodChip.tsx`). `RestPeriodChip` opens `RestPeriodSheet`. Persisted in `useWorkoutForm` drafts and forwarded via `buildExercisesPayload`.

## Server API

All endpoints require auth headers (API key or session token); proxy headers are injected before auth headers when configured. `healthDataApi.ts` uses raw `fetch` but still injects proxy headers.

| Endpoint | Purpose | Service |
|----------|---------|---------|
| `POST /api/health-data` · `GET /api/identity/user` | Send health data / connection check | `healthDataApi` |
| `GET /api/daily-summary?date=` | Unified daily summary (goals + food + exercise + water) | `dailySummaryApi` |
| `GET /api/goals/for-date?date=` | Daily nutrition goals | `goalsApi` |
| `/api/food-entries` (GET `/by-date/{date}`, POST, PUT/DELETE `/{id}`) | Food entries CRUD | `foodEntriesApi` |
| `/api/food-entry-meals` (GET `/by-date/{date}`, GET/PUT/DELETE `/{id}`, POST) | Logged-meal grouped diary entries | `foodEntryMealsApi` |
| `GET /api/foods` · `/foods-paginated` · `/food-variants` · `/barcode/{barcode}` | Recent/top, search, variants, barcode lookup | `foodsApi` |
| `POST /api/foods` · `PUT /{id}` · `PUT /food-variants/{id}` · `DELETE /{id}` | Save/update food, update variant nutrition, delete | `foodsApi` |
| `POST /api/foods/scan-label` · `/estimate-food-photo` | Label scan / AI food-photo estimate | `foodsApi`, `externalFoodSearchApi` |
| `POST /api/ai/convert-unit` | AI cross-category unit conversion | `aiConversionApi` |
| `GET /api/chat/ai-service-settings/active` · `/api/global-settings/allow-user-ai-config` | Active AI config (gates Photo) / user AI config allowed | `aiSettingsApi` |
| `GET /api/v2/foods/{search,details,barcode}/...` (provider-agnostic) | External food search/details/barcode (OFF/USDA/FatSecret/Mealie); legacy `/api/foods/{provider}/search` still exists | `externalFoodSearchApi` |
| `GET /api/custom-nutrients` | User custom nutrient definitions | `customNutrientsApi` |
| `GET /api/preferences/nutrient-display` · `PUT /{viewGroup}/{platform}` | Nutrient display prefs (full-array replace) | `preferencesApi` |
| `/api/meals` (GET, `/recent`, `/search`, POST, PUT/DELETE `/{id}`) | Saved meals CRUD + search | `mealsApi` |
| `GET /api/meal-types` · `GET /api/external-providers` | Meal type defs / configured providers | `mealTypesApi`, `externalProvidersApi` |
| `GET /api/v2/exercise-entries/by-date` · `/history?page=&pageSize=` | Exercise entries by date / paginated history | `exerciseApi` |
| `GET /api/exercises/suggested` · `/api/v2/exercises/search` | Suggested / search local exercises | `exerciseApi` |
| `/api/exercise-preset-entries` · `/api/exercise-entries` (POST, PUT/DELETE `/{id}`) | Preset & individual exercise session CRUD | `exerciseApi` |
| `GET /api/exercises/search-external` · `POST /add-external` · `POST /api/freeexercisedb/add` | External exercise search / import (wger, Free Exercise DB) | `externalExerciseSearchApi` |
| `/api/workout-presets` (GET, `/search`, POST, PUT/DELETE `/{id}`) | Workout presets CRUD + search | `workoutPresetsApi` |
| `GET /api/measurements/check-in/{date}` · `/check-in-measurements-range/{start}/{end}` · `POST /check-in` | Health measurements / range / upsert | `measurementsApi` |
| `GET·POST /api/measurements/water-intake` · `GET /api/water-containers` | Water intake get / add-remove / container presets | `measurementsApi` |
| `POST /api/fasting/start` · `/end` · `GET /current` · `/stats` · `/history` | Fasting lifecycle + stats + history | `fastingApi` |
| `GET·PUT /api/user-preferences` · `POST /bootstrap-timezone` | User preferences (COALESCE) / first-launch tz bootstrap | `preferencesApi` |
| `GET /api/identity/profiles` | User profile | `profileApi` |

## Testing

```bash
pnpm test                                   # Single run (jest; coverage on by default)
pnpm run test:watch                         # Watch mode
pnpm run test:coverage                      # Coverage report
pnpm run test:run -- --watchman=false --runInBand   # CI-style single file/run
```

Tests in `__tests__/` mirror source structure. Mocks in `jest.setup.js`. Preset: `jest-expo` with `jsdom`; `collectCoverage` is on by default.

When writing or modifying tests, run the FULL suite (not just new tests) to catch mock pollution and regressions. Never introduce global mocks without checking for side effects on other test files. When fixing a bug a test could have caught, write a regression test that reproduces it. After file moves or import refactors, run the full suite immediately and verify asset/require paths.

**Testing Android code on macOS**: Jest loads `.ios.ts` by default — use `require('../../src/services/healthConnectService.ts')` to force the Android implementation.

## UI Components

Always use the project's shared UI primitives instead of raw React Native components:

- **`FormInput`** (`src/components/FormInput.tsx`): Themed `TextInput` drop-in. Handles border, background, padding, placeholder color, and the iOS text alignment / lineHeight bug. Use for all text inputs unless you need a custom wrapper layout.
- **`Button`** (`src/components/ui/Button.tsx`): Themed `Pressable` with variants `primary`, `secondary`, `outline`, `ghost`, `header`. Use instead of raw `TouchableOpacity`/`Pressable` for actions.

Before using SF Symbol names or icon identifiers, verify they exist in the project's icon set via substring/grep search rather than guessing.

## Reference

- **API docs** live in `docs/`: `food_api.md`, `external_providers.md`, `measurements_api.md`, `sync_api.md`, `healthkit.md`, `development.md`, `user_flows.md`, `technical-design-document.md`.
- **Build**: Android via GitHub Actions with release signing; iOS via EAS Build (`eas build --platform ios`).
- **Workflow**: when asked to plan something, ask clarifying questions before producing the plan — don't start exploring code or writing plans without confirming scope first.
