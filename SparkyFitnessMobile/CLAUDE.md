# CLAUDE.md

*Last updated: 2026-06-10*

SparkyFitness Mobile is a React Native (0.83) + Expo (SDK 55) app for syncing health data (HealthKit/Health Connect) to a personal server and displaying daily nutrition, exercise, workout tracking, and hydration summaries.

## Project Overview

TypeScript-first React Native / Expo app. Always ensure changes are type-safe and compile cleanly. Primary stack: React Navigation, React Native Skia + victory-native for charts, Reanimated for animations, Expo Background Task for sync, react-native-toast-message for notifications, Zustand for cross-screen state. Shared types via `@workspace/shared` (Zod schemas + types shared with the server).

## Commands

```bash
npx expo run:ios                               # Dev build
npx expo run:ios --device                      # Physical device
npx expo prebuild -c                           # Clean rebuild (after native changes)
pnpm test:watch                                # Watch mode
pnpm run test -- __tests__/path/to/test        # Single file
tsc --noEmit                                   # Type check only
```

## Architecture

### Navigation

- `App.tsx` — Root providers: `QueryClientProvider` → `GestureHandlerRootView` → `KeyboardProvider` → `BottomSheetModalProvider` → `NavigationContainer` → `SafeAreaProvider` → `Toast`. Every screen is wrapped with `withErrorBoundary(...)` (from `ScreenErrorBoundary`) so a crashing screen falls back to a graceful in-place error UI.
- **Root Stack** (`@react-navigation/stack`): `Onboarding` (when no server config) or `Tabs`, plus food/exercise/workout flows, settings subscreens, `Logs`, and `Sync`.
- **Tab Navigator**: Dashboard, Diary, Add (opens `AddSheet` bottom sheet), Library, Settings. `CustomTabBar` has a floating "Add" button; `TAB_BAR_HEIGHT = 56`.
- Tab icons: SF Symbols on iOS, Ionicons on Android (via `Icon`).

### Source Structure (`src/`)

- **components/** — UI primitives and feature components: dashboard cards, chart components (Skia + victory-native), diary views, food entry forms, swipe-to-delete + long-press delete rows (`SwipeableFoodRow`, `SwipeableExerciseRow`, `SwipeableIngredientRow`), serving quick-adjust (`ServingAdjustSheet`) and unit selection (`FoodUnitSelectorSheet`), shared input primitives (`SegmentedControl`, `StepperInput`, `CollapsibleSection`), dev-only seeding UI (`DevTools`), workout display/editing (`EditableExerciseCard` with `ExerciseStatsChip` showing best/last set, `EditableSetRow`, `WorkoutEditableExerciseList`, `RestPeriodChip`/`RestPeriodSheet`), workout execution (`ActiveWorkoutBar` — floats above every screen, exports `useActiveWorkoutBarPadding` and `navigationRef`), navigation (`CustomTabBar`), settings UI (`SettingsRow`/`SettingsRowGroup` — icon-tile rows with optional grouping into a rounded card with separators), what's-new (`WhatsNewBanner` — version-gated banner above tab content), auth (`MfaForm`), modals (`ReauthModal`, `ServerConfigModal`), and `ui/` primitives (`Button`, `toastConfig`).
- **screens/** — Top-level screens for onboarding (multi-step incl. theme switch + external food source config), dashboard, diary, sync, logs, `WhatsNewScreen` (version changelog); settings hub (`SettingsScreen`) with dedicated subscreens (`ServerSettingsScreen`, `AppSettingsScreen` for theme + haptics + sound effects, `CalorieSettingsScreen`, `FoodSettingsScreen`, `AboutScreen`); library hub (`LibraryScreen`) with subscreens for foods (`FoodsLibraryScreen`/`FoodDetailScreen`/`FoodFormScreen`/`EditBarcodeScreen`), meals (`MealsLibraryScreen`/`MealAddScreen`/`MealDetailScreen`/`MealTypeDetailScreen`), exercises (`ExercisesLibraryScreen`/`ExerciseDetailScreen`/`ExerciseFormScreen`), and workout presets (`WorkoutPresetsLibraryScreen`/`WorkoutPresetDetailScreen`/`WorkoutPresetFormScreen`); workouts/activities (add + detail), exercise/preset search, food search/scan/entry/view (`FoodEntryViewScreen`), logged-meal editing (`EditLoggedMealScreen`), food photo AI estimation (`FoodPhotoIntroScreen` + `FoodPhotoFlow` sub-stack: `FoodPhotoImproveScreen` → `FoodPhotoEstimateReviewScreen` → `FoodPhotoLogEntryScreen`), measurements (`MeasurementsAddScreen`). `DashboardScreen`/`DiaryScreen` support fling gestures for date navigation.
- **services/** — Organized into subdirectories:
  - `api/` — API clients (`apiClient` with proxy header injection, `authService`, `dailySummaryApi`, `goalsApi`, `exerciseApi`, `foodsApi`, `foodEntriesApi`, `foodEntryMealsApi` (logged-meal grouped entries), `mealsApi`, `measurementsApi`, `healthDataApi`, `aiSettingsApi`/`aiConversionApi` (AI gating + unit conversion), `errors`, etc.)
  - `healthconnect/` — Android health data read/aggregation/transformation/preferences
  - `healthkit/` — iOS equivalents plus `backgroundDelivery`
  - `shared/` — `preferences.ts` factory + `healthPermissionMigration.ts`
  - Top-level: `healthConnectService.ts`/`.ios.ts` (platform orchestration), `backgroundSyncService`, `autoSyncCoordinator` (in-memory lock + cooldown shared by background sync and sync-on-open), `healthDataDisplay` (health metric display formatting), `calculations` (BMR / Navy body-fat / calorie-balance / age), `storage`, `LogService`, `themeService`, `workoutDraftService`, `mealBuilderSelection` (cross-screen pending-ingredient handoff), `foodSearchPreferences` (last-used food search tab), `whatsNewBanner` (version-gated banner state), `diagnosticReportService`, `healthDiagnosticService` (Android-only), `seedHealthData`/`.ios.ts` (dev-only health-data seeding, surfaced via `DevTools`), `notifications` (rest-timer scheduling), `haptics` (global enable toggle persisted under `@HealthConnect:hapticsEnabled`; expose via `useHapticsEnabled` + `setHapticsEnabled`, gate calls behind `fireSuccessHaptic`), `sounds` (parallel global sound-effects toggle; `useSoundsEnabled` + `setSoundsEnabled`, both surfaced in `AppSettingsScreen`).
- **stores/** — Zustand stores (persisted via `zustand/middleware`). See **Workout timer** below for `activeWorkoutStore`.
- **hooks/** — React Query hooks organized by domain (food, food-entry-meals, meals, exercise/workout, workout presets, measurements, profile, preferences). AI hooks: `useActiveAiServiceSetting`, `useUserAiConfigAllowed`, `useUnitConversion` (AI cross-category unit conversion), `useEstimateFoodPhoto`. `useAuth` manages reauth/setup/api-key-switch modals. `useWidgetSync` pushes daily summary snapshots to iOS + Android home-screen widgets. Shared cache helpers: `invalidateExerciseCache`, `syncExerciseSessionInCache`, `refreshHealthSyncCache`. Query keys live in `hooks/queryKeys.ts`.
- **native/** — TS bridges to native modules (e.g., `CalorieWidgetBridge` for Android Glance widget reload).
- **types/** — TypeScript interfaces. Core exercise session types (`ExerciseSessionResponse`, `IndividualSessionResponse`, `PresetSessionResponse`, `ExerciseHistoryResponse`) come from `@workspace/shared`.
- **utils/** — `dateUtils`, `unitConversions` (kg/lbs, km/miles — server storage is metric), `concurrency` (`withTimeout`, `runTasksInBatches`), `syncUtils` (sync helpers), `workoutSession` (display helpers + stats + `buildExercisesPayload`), `activityDetails` (individual-session display helpers), `foodDetails` (food variant/nutrition transforms shared across food screens), `mealNutrition` / `nutrientUtils` (meal + nutrient aggregation), `mealBuilderDraft` (meal-builder ingredient draft mapping), `numericInput` (locale-tolerant decimal parsing with strict per-shape validation), `foodPhotoEstimate` (`mapEstimateError` copy mapping for the photo flow), `rateLimiter`.
- **constants/** — `meals.ts` (meal types, icons, time-based defaults), `exercise.ts` (exercise constants).
- **HealthMetrics.ts** — Health metric definitions filtered by platform and enabled status at runtime.
- **plugins/** — Expo config plugins applied at prebuild: `withCalorieWidget` (copies `targets/android-widget/` Kotlin + res into the generated Android project and wires up Glance widget receivers), `withGlanceAndroidSupport`, `withNetworkSecurityConfig`. Edit `targets/`, never the generated `android/` or `ios/` folders.

### Platform-Specific Code

- `healthConnectService.ts` — Android orchestration (imports from `healthconnect/`)
- `healthConnectService.ios.ts` — iOS orchestration (imports from `healthkit/`)

**IMPORTANT**: Both files implement their own `syncHealthData()` with substantial sync logic. They are NOT thin re-exports. Edit the platform-specific file directly for sync changes (e.g., `.ios.ts` for iOS).

Both orchestrators use batched concurrent metric fetching via `runTasksInBatches`: `METRIC_FETCH_CONCURRENCY = 3`, `METRIC_TIMEOUT_MS = 60_000`, auto-skip remaining batches on `TimeoutError`. Both exercise transformers emit a default "Working Set" with duration for each synced exercise session.

### Health Data Upload

`healthDataApi.ts` handles chunked upload with retry:
- `CHUNK_SIZE = 5_000` simple measurements per request. Exercise/Workout sessions are grouped by source and sent unsplit (the server range-deletes per source before inserting, so a source's sessions must stay in one request). Sleep sessions are chunked by `SESSION_CHUNK_SIZE = 50` — safe to split since the server merges sleep by natural key with no range-delete (issue #1180), and they are the expensive type to process server-side (issue #1263)
- `fetchWithTimeout` wraps fetch with `AbortController` (`FETCH_TIMEOUT_MS = 30_000`)
- `fetchWithRetry` adds exponential backoff (up to `MAX_RETRIES = 3`, skips 4xx); triggers `notifySessionExpired` on 401 for session auth

`services/autoSyncCoordinator.ts` mediates between background-task syncs and foreground sync-on-open: an in-memory `tryClaimAutoSync()` lock prevents double-fires within an app-open window, and a per-config `AUTO_SYNC_COOLDOWN_MS = 5min` cooldown stored under `@AutoSync:lastAutoSyncAt:<configId>` gates `shouldRunForegroundResumeAutoSync()`. Call `recordAutoSyncTime(configId)` after any successful auto-sync.

### React Query

- `staleTime: Infinity` on the global client — manual refresh only (some hooks override, e.g., preferences uses 30min)
- `useRefetchOnFocus(refetch, enabled)` — standard hook for refetching on screen focus
- Query keys are centralized in `hooks/queryKeys.ts` (static arrays + parameterized functions like `dailySummaryQueryKey(date)`, `measurementsRangeQueryKey(start, end)`, `exerciseSearchQueryKey(term)`)

### Styling (TailwindCSS v4 + Uniwind)

TailwindCSS v4 with Uniwind for React Native. Theme variables in `global.css`:
- `className="bg-surface text-text-primary rounded-md p-4"`
- `useCSSVariable('--color-accent-primary')` for JS access (used extensively in Skia charts)
- Themes: **Light**, **Dark**, **AMOLED** (true black), **System** — managed by `themeService.ts`, stored in AsyncStorage. On Android, `App.tsx` keeps the system navigation bar in sync via `expo-navigation-bar` (`NavigationBar.setStyle('dark' | 'light')`)
- CSS variable categories: backgrounds, borders, text, accents, tabs, forms, data colors (`calories`, `macro-*`, `hydration`, `exercise`), category colors (`cat-slate`/`cat-pink`/`cat-violet`/`cat-orange` — used for settings row icon tints), progress, status

### Charts

Custom rendering (calorie ring, gauges) uses `@shopify/react-native-skia`; data charts (bar charts) use `victory-native`. For animations, drive Skia paths from Reanimated `useSharedValue` + `useDerivedValue` — not Skia's deprecated animation API.

### iOS HealthKit Accuracy

For **cumulative metrics** (steps, calories), use `queryStatisticsForQuantity` with `cumulativeSum` to match Health app values. Raw samples produce incorrect totals.

**Using correct approach:** Steps (`getAggregatedStepsByDate`), Active Calories, Total Calories, Distance, Floors Climbed. **Fine with raw samples:** Heart Rate, Weight, Body Fat, Sleep, etc.

### Android Health Connect Aggregation

Cumulative metrics (Steps, Distance, Active/Total Calories, Floors) are aggregated via HC's native `aggregateGroupByPeriod` — one call per range, not per day. HC's source-priority dedup matches what the Health Connect UI shows, so callers do not Math.max/dedup in JS (issue #1279). `enrichExerciseSessions` attaches per-session calories+distance via `aggregateRecord` over each session's time window, scoped to the session's `dataOrigin`.

Read paths return a `{ records, error }` envelope (`readHealthRecordsDetailed`, `aggregateCumulativeMetricByDayDetailed`); the legacy non-detailed wrappers just unwrap `.records`. `backgroundSyncService` and `useSyncHealthData` skip persisting the last-synced timestamp when any metric returned a partial result or error — so a transient failure doesn't silently advance the cursor past unsynced data.

App manifest grants `android.permission.health.READ_HEALTH_DATA_HISTORY` (configured in `app.config.ts`) so reads can reach data older than 30 days.

**Patch — `react-native-health-connect@3.5.3`**: The library's `getAggregateGroupByPeriodRequest` only applied the `LocalDateTime` filter fix to `Steps`; every other record type still called `getTimeRangeFilter` (instant-based), which broke per-day grouping at DST boundaries and for any non-Steps cumulative metric. Patched at the repo root: `patches/react-native-health-connect@3.5.3.patch`, wired via `pnpm.patchedDependencies` in root `package.json`. The patch rewrites ~20 record types' `getAggregateGroupByPeriodRequest` to use `getTimeRangeFilterLocal`. Re-run `pnpm install` after changing the patch, then `npx expo prebuild -c` to rebuild Android. See `feedback_react_native_health_connect_local_filter`.

### Logging

`LogService.ts` is the single source of truth for app logs. Prefer `addLog(message, status?, details?)` over `console.*` everywhere (see `feedback_logging`).

- **Status type**: `LogStatus = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'`. Legacy `'SUCCESS'` is migrated to `'INFO'` on read via `migrateLogEntry`.
- **Two independent thresholds** sharing `LogThreshold = 'all' | 'no_debug' | 'warnings_errors' | 'errors_only'`: capture level (`log_capture_level`) drops below-threshold entries before storage; view filter (`log_view_filter` + `log_view_selected_statuses`) drives what `LogScreen` shows.
- Writes are buffered (batched flush with AppState-aware draining); `flushLogs()` is safe from shutdown paths.
- When adding log sites, pass a structured `details` array rather than stuffing context into `message` — `LogScreen` renders details as separate lines and `diagnosticReportService` preserves them.

### Authentication & Proxy Headers

Two auth modes per `ServerConfig.authType`:
- **`apiKey`** — API key sent as `Authorization: Bearer <API_KEY>`. Configured via `ServerConfigModal`.
- **`session`** — Session token via `authService.ts` (email/password, optional MFA via TOTP or email OTP). Configured via `OnboardingScreen` or `ReauthModal`.

Three auth-UI entry points: `OnboardingScreen` (first-time setup, initial route when no config), `ReauthModal` (shown by `useAuth` on 401 — supports server picker and "Use API Key Instead" fallback), `ServerConfigModal` (edit server/key/proxy headers from Settings). MFA logic is shared via `MfaForm` (`src/components/auth/MfaForm.tsx`).

**Proxy Headers**: Per-server custom HTTP headers for reverse proxy auth (Pangolin, Cloudflare Access). Stored in SecureStore as `ProxyHeader[]` on each `ServerConfig`. Injected globally via `proxyHeadersToRecord()` in `apiClient.ts` and raw fetch calls in `healthDataApi.ts`. During login flows, `setPendingProxyHeaders()`/`clearPendingProxyHeaders()` on `authService` manages headers before a config is saved.

### Shared Workspace (`@workspace/shared`)

Monorepo package at `../shared/` providing Zod schemas, TypeScript types, constants, and timezone utilities shared between server and mobile. Key exports:
- **Exercise/workout types**: `ExerciseSessionResponse` (discriminated union: `IndividualSessionResponse | PresetSessionResponse`), `ExerciseHistoryResponse`, `CreatePresetSessionRequest`, `ExerciseEntryResponse`, `ExerciseEntrySetResponse`, `ActivityDetailResponse`, `Pagination`
- **API schemas**: `dailySummaryResponseSchema`/`DailySummaryResponse`, `dailyGoalsResponseSchema`, `foodEntryResponseSchema`, `exerciseSessionResponseSchema`
- **Constants**: `MEASUREMENT_PRECISION`/`getPrecision()`, `CALORIE_CALCULATION_CONSTANTS`/`ACTIVITY_MULTIPLIERS`
- **Timezone utilities** (`shared/src/utils/timezone.ts`): day-string ops (`isDayString`, `addDays`, `compareDays`, `dayToPickerDate`, `localDateToDay`) and timezone conversions (`isValidTimeZone`, `todayInZone`, `instantToDay`, `userHourMinute`, `dayToUtcRange`, `dayRangeToUtcRange`)

### iOS Widget Extension

iOS home-screen widgets live under `targets/widget/` (managed by `@bacons/apple-targets` — configured in `app.config.ts` / `targets/widget/expo-target.config.js`). Two widgets:
- **Calorie widget** (`widgets.swift`, kind `widget`) — calorie balance (consumed/burned/remaining/progress ring)
- **Macro widget** (`macroWidget.swift`, kind `macroWidget`) — protein/carbs/fat/calories

Data flow: RN writes snapshots into the shared iOS app group (`Constants.expoConfig.extra.iosAppGroup`, defined in `app.identifiers.js`) via `ExtensionStorage` from `@bacons/apple-targets`. `useWidgetSync(summary)` on `DashboardScreen` writes `calorieSnapshot` + `macroSnapshot` when the daily summary for *today* changes, then calls `ExtensionStorage.reloadWidget(kind)`. Swift widgets read via `UserDefaults(suiteName:)` (see `SharedHelpers.swift`).

When changing widget display: update both the Swift view and the TS snapshot shape in `useWidgetSync`. When adding a widget, register its kind in `index.swift`, bump the reload call in `useWidgetSync`, and re-run `npx expo prebuild -c`.

App Icons live under `targets/widget/assets/AppIcon.appiconset/` (colocated because the config plugin owns the iOS asset catalog). Edit there, not the generated `ios/` files.

### Android Widget Extension

Android home-screen widgets are Glance-based and live under `targets/android-widget/` (Kotlin sources + `res/`). They are stamped into the generated Android project at prebuild by `plugins/withCalorieWidget.ts`, which copies the tree, expands `.kt.tmpl` files (substituting the resolved `applicationId`), registers each receiver in `AndroidManifest.xml`, and adds `CalorieWidgetPackage` to the React `MainApplication`. Two widgets ship today: `CalorieWidget` (kind `widget`) and `MacroWidget` (kind `macroWidget`), each with its own `Receiver`, `Module`, `*_widget_info.xml`, and `PREFS_*` namespace.

Data flow: `useWidgetSync` calls into `src/native/CalorieWidgetBridge.ts` (Android branch) which invokes the native module to push snapshots and reload Glance. Same `summary` payload as iOS — keep the snapshot shape in `useWidgetSync` aligned with both Swift views and Kotlin composables. After any change to `targets/android-widget/` or the plugin, run `npx expo prebuild -c`.

Pattern for adding a third widget is documented at the top of `plugins/withCalorieWidget.ts` (drop new `*.kt.tmpl` pair, add an `xml` info file, extend the receivers list, and add a kind-aware reload to `CalorieWidgetBridge`).

### Library Tab

The **Library** tab (`LibraryScreen`) is the entry point for all user-saved content — foods, meals, exercises, and workout presets. It surfaces "Create" tiles plus a recent-items preview per section, with "View all" pushing the section-specific paginated list:

- **Foods** — `FoodsLibraryScreen` → `FoodDetailScreen` → `FoodFormScreen` (modes: `create-food`, `edit-food`, `adjust-entry-nutrition`). Backed by `useFoodsLibrary`, `useFoodVariants`, `useDeleteFood`. Nutrition transforms (local variants, external variants, selected display values, editable payload) live in `utils/foodDetails.ts` and are shared across `FoodDetailScreen`, `FoodEntryAddScreen`, `FoodFormScreen`, and the food-photo review screen. `FoodForm` supports **equivalent serving sizes** — variants grouped by nutrient signature so e.g. "1 cup (240g)" + "1 oz (28g)" map back to the same base variant; equivalents are edited inline and persisted via `foodsApi` variant endpoints. Also includes an auto-scale-nutrition toggle that proportionally rescales nutrition values when the serving size changes, a `convertServingSizeOnUnitChange` opt-in that converts the value when switching between compatible units (g↔oz); for cross-category swaps (g→cup) it offers an AI-estimated conversion via `shouldOfferAiConversion` + `useUnitConversion` (`POST /api/ai/convert-unit`) rather than guessing, and a `headerChildren` slot for callers (e.g. estimate review) to render an above-form summary. `EditBarcodeScreen` manages additional barcodes for an existing food (so a scanned/manually-typed barcode finds the right food next time).
- **Meals** — `MealsLibraryScreen` → `MealDetailScreen` and `MealAddScreen` (meal builder). Cross-screen ingredient handoff uses `services/mealBuilderSelection.ts` (set/consume pending selection). `MealTypeDetailScreen` shows a single meal type's day view from the diary. A meal can be logged to the diary as a single grouped entry via `foodEntryMealsApi` (`/api/food-entry-meals`) and edited later in `EditLoggedMealScreen` (ingredient rows reuse `SwipeableIngredientRow` + `mealBuilderDraft`).
- **Exercises** — `ExercisesLibraryScreen` → `ExerciseDetailScreen` → `ExerciseFormScreen` for user-created exercises (advanced fields supported).
- **Workout Presets** — `WorkoutPresetsLibraryScreen` → `WorkoutPresetDetailScreen` → `WorkoutPresetFormScreen` for managing reusable presets that feed `WorkoutAddScreen`.

Edit/Delete actions are gated on `profile.id === <entity>.userId` (owner-only). Diary rows (`SwipeableFoodRow`, `SwipeableExerciseRow`) support both swipe-to-delete and long-press delete confirmation.

`useFoodsLibrary` (infinite query) uses `queryClient.resetQueries` instead of `query.refetch()` on focus/pull-to-refresh — `refetch()` re-downloads every cached page, so a user deep in the list pays for pages 1..N on every focus. Same pattern as `useExerciseHistory`. `loadMore` gates on `isFetching` (not just `isFetchingNextPage`) so pagination cannot overlap with a reset and leave gaps. Apply this pattern to other paginated library hooks (meals, exercises, presets) when revisiting them.

`BottomSheetPicker` and `CalendarSheet` pass `containerComponent={FullWindowOverlay}` (iOS only) so the sheets render in a UIWindow above any native modal presentation. Earlier versions wrapped modal-presented screens in a local `BottomSheetModalProvider`, but that polluted the root provider's bottom-inset state and left the AddSheet with stale padding after dismissal — using `FullWindowOverlay` per-sheet avoids the nested provider entirely.

### Food Photo Estimation

AI-powered nutrition estimate from a photo. Food photo is **attempt-all**: it works with any configured AI provider — the server's `dispatchAiRequest` tries whatever `service_type` is active and a genuinely unbuildable provider surfaces as `UNSUPPORTED_PROVIDER`. The flow is therefore gated only on "a provider is configured at all": availability is fetched via `useActiveAiServiceSetting` (React Query, 5-min staleTime, query key `activeAiServiceSettingQueryKey`) and gated through `isFoodPhotoAvailable(setting)` (any non-empty `service_type`) from `services/api/aiSettingsApi.ts`.

Entry points:
- **AddSheet "Scan Food"** tile → `FoodScanScreen` with a 3-segment switcher: `Barcode | Label | Photo`. The `photo` segment is hidden when `pickerMode === 'meal-builder'` (photo estimates always log to the diary). Re-tapping the active Photo segment refetches the AI setting — the user's "I configured AI in the web app, try again" gesture.
- **FoodSearchScreen empty state** → "Estimate from photo" button deep-links to `FoodScan` with `initialMode: 'photo'`.
- **First-run intro** (`FoodPhotoIntroScreen`, modal) shown once, persisted via `services/foodPhotoIntro.ts` (`@FoodPhoto:hasSeenIntro` AsyncStorage flag).

Sub-stack `FoodPhotoFlow` (`src/navigation/FoodPhotoFlow.tsx`, presented modally from the root stack — wraps itself in its own `KeyboardProvider` because native-stack modals don't always inherit the root provider's keyboard events):
1. `FoodPhotoImproveScreen` — capture/improve photo + description + total weight (g/oz).
2. `FoodPhotoEstimateReviewScreen` — review the AI estimate, edit fields via the shared `FoodForm`, then continue.
3. `FoodPhotoLogEntryScreen` — finalize meal type / servings and log.

API: `POST /api/foods/estimate-food-photo` via `estimateFoodPhoto()` in `externalFoodSearchApi.ts` (raw `fetch` with proxy headers; throws typed `FoodPhotoEstimateError` carrying a `FoodPhotoEstimateErrorCode` from `@workspace/shared`). The mutation hook is `useEstimateFoodPhoto`. Error → user copy mapping (gate vs. retry-in-place vs. dismiss) lives in `mapEstimateError()`.

### Workout & Exercise Architecture

Two session types via discriminated union (`ExerciseSessionResponse`):
- **Preset** (`type: 'preset'`): grouped workout with named exercises and per-exercise sets (weight/reps). Created in `WorkoutAddScreen`, viewed/edited in `WorkoutDetailScreen`.
- **Individual** (`type: 'individual'`): single exercise with duration, optional distance, calories. Created in `ActivityAddScreen`, viewed/edited in `ActivityDetailScreen`.

**Draft system**: `workoutDraftService` persists in-progress forms to AsyncStorage (`@SessionDraft`). `useWorkoutForm` and `useActivityForm` share `useDraftPersistence` (300ms debounce + AppState background saves). Resume/discard prompt lives in `App.tsx`'s `handleStartExerciseForm`.

**Exercise selection**: `ExerciseSearchScreen` operates in `returnKey` mode only — returns via `CommonActions.setParams` + nonce pattern (`useSelectedExercise`). AddSheet navigates directly to `WorkoutAdd`/`ActivityAdd`/`PresetSearch`.

**External providers**: `useExternalProviders` accepts an optional `filterSet` (defaults to `FOOD_PROVIDER_TYPES`). Exercise features pass `EXERCISE_PROVIDER_TYPES` (wger, free-exercise-db).

**Workout timer (rest timer HUD)**: State lives in `stores/activeWorkoutStore` (zustand + AsyncStorage persist) — survives backgrounding and cold starts. Organized around an `activeSetId` cursor (forward-only) and a `rest` object (`ready`/`resting`/`paused`) representing the rest *before* `activeSetId`. Completing a set advances the cursor and starts the next rest. `ActiveWorkoutBar` is a sibling of the root navigator and uses the shared `navigationRef` to deep-link into `WorkoutDetail`. In `WorkoutDetailScreen`: tap the active set to complete + advance, tap a completed set to uncheck, long-press a later set to confirm a forward jump. Rest notifications scheduled via `services/notifications` (expo-notifications + expo-haptics; Android `workout-timer` channel set up in `initNotifications()` from `App.tsx`). Set IDs are preserved server-side across edits so the cursor stays bound to the right rows.

**Configurable rest duration**: `restPeriodSec` per-exercise on `WorkoutPresetExercise` (default `DEFAULT_REST_SEC = 90` from `RestPeriodChip.tsx`). `RestPeriodChip` opens `RestPeriodSheet` for selection. Persisted in `useWorkoutForm` drafts and forwarded via `buildExercisesPayload`.

## Server API

All endpoints require auth headers (API key or session token). Proxy headers are injected before auth headers when configured. `healthDataApi.ts` uses raw `fetch` (not the shared `apiFetch`) but still injects proxy headers.

| Endpoint | Purpose | Service |
|----------|---------|---------|
| `POST /api/health-data` | Send health data array | `healthDataApi` |
| `GET /api/identity/user` | Connection check | `healthDataApi` |
| `GET /api/daily-summary?date={date}` | Unified daily summary (goals + food + exercise + water) | `dailySummaryApi` |
| `GET /api/goals/for-date?date={date}` | Daily nutrition goals | `goalsApi` |
| `GET /api/food-entries/by-date/{date}` | Food entries by date | `foodEntriesApi` |
| `POST /api/food-entries/` | Create food entry | `foodEntriesApi` |
| `PUT /api/food-entries/{id}` | Update food entry | `foodEntriesApi` |
| `DELETE /api/food-entries/{id}` | Delete food entry | `foodEntriesApi` |
| `GET /api/foods` | Recent and top foods | `foodsApi` |
| `GET /api/foods/foods-paginated` | Search local foods | `foodsApi` |
| `GET /api/foods/food-variants` | Food variants by food ID | `foodsApi` |
| `PUT /api/foods/food-variants/{id}` | Update a food variant's nutrition | `foodsApi` |
| `POST /api/foods` | Save custom food | `foodsApi` |
| `PUT /api/foods/{id}` | Update food metadata (name, brand) | `foodsApi` |
| `DELETE /api/foods/{id}` | Delete a food | `foodsApi` |
| `GET /api/foods/barcode/:barcode` | Barcode lookup | `foodsApi` |
| `POST /api/foods/scan-label` | Nutrition label scanning via image | `foodsApi` |
| `POST /api/foods/estimate-food-photo` | AI food photo nutrition estimate (any configured AI provider) | `externalFoodSearchApi` |
| `POST /api/ai/convert-unit` | AI cross-category unit conversion (e.g. cup→g) | `aiConversionApi` |
| `GET /api/chat/ai-service-settings/active` | Active AI service config (gates the Photo segment) | `aiSettingsApi` |
| `GET /api/global-settings/allow-user-ai-config` | Whether user-level AI config is permitted | `aiSettingsApi` |
| `GET /api/v2/foods/search/{provider}` | Provider-agnostic external food search (OFF/USDA/FatSecret/Mealie) | `externalFoodSearchApi` |
| `GET /api/v2/foods/details/{provider}/{externalId}` | External food details (e.g., FatSecret nutrients) | `externalFoodSearchApi` |
| `GET /api/v2/foods/barcode/{barcode}` | External barcode lookup across providers | `externalFoodSearchApi` |
| `GET /api/foods/{provider}/search` + `/fatsecret/nutrients` | Legacy direct-path external search (OFF/USDA/FatSecret/Mealie); v2 routes above are preferred | `externalFoodSearchApi` |
| `GET /api/meals` | All saved meals | `mealsApi` |
| `GET /api/meals/recent` | Recently used meals | `mealsApi` |
| `GET /api/meals/search` | Search meals | `mealsApi` |
| `POST /api/meals` | Create a meal | `mealsApi` |
| `PUT /api/meals/{id}` | Update a meal | `mealsApi` |
| `DELETE /api/meals/{id}` | Delete a meal | `mealsApi` |
| `POST /api/food-entry-meals` | Log a meal as a grouped diary entry | `foodEntryMealsApi` |
| `GET /api/food-entry-meals/by-date/{date}` | Logged meal entries by date | `foodEntryMealsApi` |
| `GET /api/food-entry-meals/{id}` | Logged meal entry with components | `foodEntryMealsApi` |
| `PUT /api/food-entry-meals/{id}` | Update a logged meal entry | `foodEntryMealsApi` |
| `DELETE /api/food-entry-meals/{id}` | Delete a logged meal entry | `foodEntryMealsApi` |
| `GET /api/meal-types` | Meal type definitions | `mealTypesApi` |
| `GET /api/external-providers` | Configured external providers | `externalProvidersApi` |
| `GET /api/v2/exercise-entries/by-date?selectedDate={date}` | Exercise entries by date | `exerciseApi` |
| `GET /api/v2/exercise-entries/history?page={p}&pageSize={n}` | Paginated exercise session history | `exerciseApi` |
| `GET /api/exercises/suggested?limit={n}` | Recent + popular exercises | `exerciseApi` |
| `GET /api/v2/exercises/search?searchTerm={term}` | Search local exercises | `exerciseApi` |
| `POST /api/exercise-preset-entries/` | Create preset workout session | `exerciseApi` |
| `PUT /api/exercise-preset-entries/{id}` | Update preset workout session | `exerciseApi` |
| `DELETE /api/exercise-preset-entries/{id}` | Delete preset workout session | `exerciseApi` |
| `POST /api/exercise-entries/` | Create individual exercise entry | `exerciseApi` |
| `PUT /api/exercise-entries/{id}` | Update individual exercise entry | `exerciseApi` |
| `DELETE /api/exercise-entries/{id}` | Delete individual exercise entry | `exerciseApi` |
| `GET /api/exercises/search-external` | Search external exercise providers | `externalExerciseSearchApi` |
| `POST /api/exercises/add-external` | Import wger exercise | `externalExerciseSearchApi` |
| `POST /api/freeexercisedb/add` | Import Free Exercise DB exercise | `externalExerciseSearchApi` |
| `GET /api/workout-presets` | List workout presets | `workoutPresetsApi` |
| `GET /api/workout-presets/search` | Search workout presets | `workoutPresetsApi` |
| `POST /api/workout-presets` | Create workout preset | `workoutPresetsApi` |
| `PUT /api/workout-presets/{id}` | Update workout preset | `workoutPresetsApi` |
| `DELETE /api/workout-presets/{id}` | Delete workout preset | `workoutPresetsApi` |
| `GET /api/measurements/check-in/{date}` | Health measurements | `measurementsApi` |
| `GET /api/measurements/check-in-measurements-range/{start}/{end}` | Measurements over date range | `measurementsApi` |
| `GET /api/measurements/water-intake/{date}` | Water intake for date | `measurementsApi` |
| `POST /api/measurements/water-intake` | Add/remove water intake | `measurementsApi` |
| `GET /api/water-containers` | Water container presets | `measurementsApi` |
| `GET /api/user-preferences` | User preferences | `preferencesApi` |
| `PUT /api/user-preferences` | Update user preferences (COALESCE — only updates provided fields) | `preferencesApi` |
| `POST /api/user-preferences/bootstrap-timezone` | First-launch timezone bootstrap | `preferencesApi` |
| `GET /api/identity/profiles` | User profile | `profileApi` |

## Testing

```bash
pnpm test                                   # Single run (jest; coverage collected by default)
pnpm run test:run                           # Single run (alias)
pnpm run test:watch                         # Watch mode
pnpm run test:coverage                      # Coverage report
pnpm run test:run -- --watchman=false --runInBand   # CI-style single file/run
```

Tests in `__tests__/` mirror source structure. Mocks in `jest.setup.js`. Preset: `jest-expo` with `jsdom` environment; `collectCoverage` is on by default in the jest config.

When writing or modifying tests, run the FULL test suite (not just new tests) to catch mock pollution and regressions. Never introduce global mocks without checking for side effects on other test files. When fixing a bug that could have been caught by a test, write a regression test that reproduces the bug and verifies the fix. After file moves or import refactors, run the full test suite immediately and verify asset/require paths.

**Testing Android code on macOS**: Jest loads `.ios.ts` by default — use `require('../../src/services/healthConnectService.ts')` to force the Android implementation.

## UI Components

Always use the project's shared UI primitives instead of raw React Native components:

- **`FormInput`** (`src/components/FormInput.tsx`): Themed `TextInput` drop-in replacement. Handles border, background, padding, placeholder color, and the iOS text alignment / lineHeight bug. Use for all text inputs unless you need a custom wrapper layout (e.g., a paste button inline).
- **`Button`** (`src/components/ui/Button.tsx`): Themed `Pressable` with variants `primary`, `secondary`, `outline`, `ghost`, `header`. Use instead of raw `TouchableOpacity` or `Pressable` for actions.

Before using SF Symbol names or icon identifiers, verify they exist in the project's icon set via substring/grep search rather than guessing.

## Reference

- **API docs** live in `docs/`: `food_api.md`, `external_providers.md`, `measurements_api.md`, `sync_api.md`, `healthkit.md`, `development.md`, `user_flows.md`, `technical-design-document.md`.
- **Build**: Android via GitHub Actions with release signing; iOS via EAS Build (`eas build --platform ios`).
- **Workflow**: when asked to plan something, ask clarifying questions before producing the plan — don't start exploring code or writing plans without confirming scope first.
