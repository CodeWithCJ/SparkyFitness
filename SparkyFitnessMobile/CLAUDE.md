# CLAUDE.md

*Last updated: 2026-04-11*

SparkyFitness Mobile is a React Native (0.81) + Expo (SDK 54) app for syncing health data (HealthKit/Health Connect) to a personal server and displaying daily nutrition, exercise, workout tracking, and hydration summaries.

## Project Overview

This is a React Native / Expo app using TypeScript. Primary language is TypeScript. Always ensure changes are type-safe and compile cleanly before presenting them as complete. Primary stack: React Navigation (dynamic/JSX config), React Native Skia for charts/graphics, victory-native for bar charts, Reanimated for animations, Expo Background Task for sync, react-native-toast-message for notifications. Shared types via `@workspace/shared` monorepo package (Zod schemas + TypeScript types shared between server and mobile). All 1500+ tests must pass and type check cleanly after changes.

## Commands

```bash
npx expo run:ios                               # Dev build
npx expo run:ios --device                      # Physical device
npx expo prebuild -c                           # Clean rebuild (after native changes)
pnpm test:watch                                      # Watch mode
pnpm run test -- __tests__/path/to/test    # Single file
tsc --noEmit                                   # Type check only
```

## Architecture

### Navigation

- `App.tsx` — Root providers: `QueryClientProvider` → `GestureHandlerRootView` → `KeyboardProvider` → `BottomSheetModalProvider` → `NavigationContainer` → `SafeAreaProvider` → `Toast`. Every screen is wrapped with `withErrorBoundary(...)` (from `ScreenErrorBoundary`) before being registered with the navigator, so a crashing screen falls back to a graceful in-place error UI instead of crashing the whole app.
- **Root Stack Navigator** (`@react-navigation/stack`): `Onboarding` (shown when no server config exists) + `Tabs` screen + food entry flow (`FoodSearch`, `FoodForm`, `FoodEntryAdd`, `FoodEntryView`, `FoodScan`) + exercise/workout flow (`ExerciseSearch` (modal), `PresetSearch`, `WorkoutAdd`, `ActivityAdd`, `WorkoutDetail`, `ActivityDetail`) + settings subscreens (`CalorieSettings`, `FoodSettings`) + `Logs` + `Sync` screen. Dynamic initial route: `Onboarding` if no `ServerConfig` exists, otherwise `Tabs`.
- **Tab Navigator** (`@react-navigation/bottom-tabs`): **Dashboard** (default), **Diary**, **Add** (opens `AddSheet` bottom sheet — Food, Exercise drill-down (Workout/Activity/Preset), Sync Health Data, Barcode Scan), **Workouts** (exercise history), **Settings**. Uses `CustomTabBar` — custom tab bar with a floating circular "Add" button raised above the bar. `TAB_BAR_HEIGHT = 56` exported for layout calculations.
- Tab icons: SF Symbols on iOS, Ionicons on Android (via `Icon` component). Tab-specific icons: `tab-dashboard` (grid), `tab-workouts` (dumbbell)

### Source Structure (`src/`)

- **components/** — UI components organized by feature: dashboard cards (CalorieRingCard, MacroCard, MacroSummaryCard, ExerciseProgressCard, HydrationGauge, StepsBarChart, ProgressRing), chart components (ChartTouchOverlay, WeightLineChart, HealthTrendsPager — PagerView swiping between StepsBarChart and WeightLineChart), diary views (FoodSummary with meal-type grouping and delete, ExerciseSummary, SwipeableFoodRow with delete via ReanimatedSwipeable, ServingAdjustSheet for quick quantity changes), food entry (FoodForm — reusable nutrition input form with FoodFormData interface), workout display (WorkoutCard — session card using shared helpers from `utils/workoutSession.ts`), workout editing (EditableExerciseCard — single exercise with image/name; delegates set rendering to `EditableSetList`, EditableSetList — shared header/add-row container wrapping a list of `EditableSetRow`s, used by both workout editing and activity editing, EditableSetRow — weight+reps inputs with swipe-to-delete via ReanimatedSwipeable, WorkoutEditableExerciseList — container for exercise cards with `mode` prop for add vs detail contexts), workout execution (ActiveWorkoutBar — persistent global HUD rendered as a sibling of the root navigator, drives the workout timer UI and exposes `navigationRef` for cross-screen navigation), navigation (CustomTabBar — themed custom tab bar with floating Add button), shared UI (DateNavigator, BottomSheetPicker, CalendarSheet, CollapsibleSection, SegmentedControl, Icon, ConnectionStatus, AddSheet, FormInput, StepperInput — generic +/− stepper with text input used for serving sizes and set weight/reps, StatusView — reusable empty/loading/error states, EmptyDayIllustration — SVG shown when no data, SafeImage — image wrapper with error handling and proxy headers, ScreenErrorBoundary — class-based boundary + `withErrorBoundary` HOC that logs via `LogService`, shows a themed fallback, and offers Retry/Go Back), settings UI (ServerConfig, ServerConfigModal — unified server URL/API key/proxy headers editing, AppearanceSettings, SyncFrequency, HealthDataSync — shows per-metric values with loading states), auth (MfaForm — shared MFA component with TOTP/email OTP support, used by ReauthModal and OnboardingScreen), modals (ReauthModal — session re-authentication with server picker and API key fallback, PrivacyPolicyModal, DevTools), and `ui/` low-level primitives (Button, toastConfig — themed toast variants for react-native-toast-message)
- **screens/** — OnboardingScreen (first-time setup: server URL input with clipboard paste + reachability check, auth via SegmentedControl toggle between Sign In/API Key modes, full MFA support via shared MfaForm), DashboardScreen (daily summary with calorie ring, macros, exercise, hydration, steps bar chart), DiaryScreen (food & exercise entries by date), SettingsScreen (server config management, appearance, sync navigation, logs navigation, diagnostic report sharing, privacy policy, dev tools — uses ReauthModal and ServerConfigModal for auth/server management), SyncScreen (health data sync — full-screen stack screen, accessed from Settings; includes health diagnostic report sharing on Android), LogScreen (app log viewer — root stack screen, accessed from Settings), WorkoutsScreen (paginated exercise history grouped by date — tapping preset sessions navigates to WorkoutDetail, individual sessions to ActivityDetail), WorkoutAddScreen (create/edit preset workouts with per-exercise set tracking — uses `useWorkoutForm` reducer + `useExerciseSetEditing`, auto-saves drafts), ActivityAddScreen (create/edit individual exercise activities with duration/distance/calories — uses `useActivityForm` reducer, auto-saves drafts), ActivityDetailScreen (read-only detail for `IndividualSessionResponse` with inline field editing for name/duration/calories/distance/heartRate/notes), ExerciseSearchScreen (full-screen modal with Search/Online tabs — `returnKey` mode only, returns selected exercise to caller via `CommonActions.setParams` + nonce pattern), PresetSearchScreen (browse/search workout presets — selecting a preset navigates to WorkoutAdd with the template), WorkoutDetailScreen (detail view for `PresetSessionResponse` with inline edit capabilities — uses `useWorkoutForm`, `useExerciseSetEditing`, `WorkoutEditableExerciseList`; integrates the live workout timer via `useActiveWorkoutStore` — tap a set to start the workout / mark complete / start its rest timer), FoodSearchScreen (multi-source food search with Search/Online/Meals tabs, "+" button navigates to FoodForm in create-food mode), FoodScanScreen (camera-based barcode + nutrition label scanner using expo-camera — barcode mode scans EAN-13/EAN-8/UPC-A/UPC-E and looks up via `lookupBarcode`, label mode captures photo and sends to `scanNutritionLabel` API, navigates to FoodEntryAdd or FoodForm), FoodFormScreen (dual-mode: `create-food` for manual food creation via `saveFood` + `createFoodEntry`, or `adjust-entry-nutrition` for editing nutrition values and returning to the caller screen), FoodEntryAddScreen (create food entry with variant/quantity/meal type selection), FoodEntryViewScreen (view/edit/delete existing food entry — supports editing quantity, meal type, date, and nutrition via FoodForm). DashboardScreen and DiaryScreen support **fling gestures** for date navigation (swipe left/right via `react-native-gesture-handler` `Gesture.Fling` + `Gesture.Race`)
- **services/** — Organized into subdirectories:
  - `api/` — API clients: `apiClient` (shared fetch wrapper with proxy header injection), `authService` (login, MFA, session management), `dailySummaryApi` (unified daily summary endpoint — fetches goals, food entries, exercise sessions, and water intake in a single `/api/daily-summary` call), `goalsApi`, `foodEntriesApi`, `foodsApi` (includes barcode lookup and nutrition label scanning), `externalFoodSearchApi`, `mealsApi`, `mealTypesApi`, `externalProvidersApi`, `exerciseApi` (comprehensive: history, search, CRUD for preset sessions and individual entries, suggested exercises), `externalExerciseSearchApi` (search + import from wger/Free Exercise DB), `workoutPresetsApi` (list/search presets), `measurementsApi`, `preferencesApi` (GET and PUT for user preferences including timezone), `profileApi`, `healthDataApi`
  - `healthconnect/` — Android health data: `index`, `dataAggregation`, `dataTransformation`, `preferences`
  - `healthkit/` — iOS health data: `index`, `dataAggregation`, `dataTransformation`, `preferences`, `backgroundDelivery` (HealthKit background delivery management)
  - `shared/` — `preferences.ts` factory used by both platforms (`createPreferenceFunctions(storagePrefix, logTag)`), `healthPermissionMigration.ts` (cross-platform permission migration — re-requests permissions for enabled metrics when a new required version is detected)
  - Top-level: `healthConnectService.ts`/`.ios.ts` (platform orchestration), `backgroundSyncService`, `storage`, `LogService`, `themeService`, `calculations`, `seedHealthData.ts`/`.ios.ts`, `workoutDraftService` (AsyncStorage-backed draft persistence for in-progress workout/activity forms), `healthDataDisplay` (centralized health metric display formatting — `fetchHealthDisplayData` returns per-metric formatted strings), `diagnosticReportService` (general app diagnostic report builder — collects app/device info, sync status, sanitized logs, health metrics, preferences, cache states for sharing), `healthDiagnosticService` (Android-only Health Connect record diagnostic report — reads raw records with privacy-aware rounding, exports `shareHealthDiagnosticReport`), `notifications` (expo-notifications + expo-haptics wrapper for the workout rest timer — `initNotifications`, `ensureNotificationPermission`, `scheduleRestNotification`, `cancelScheduledNotification`, `fireRestCompleteHaptic`; sets up the `workout-timer` Android channel and uses a silent foreground handler so only the haptic/sound fire when the app is in front)
- **stores/** — Zustand stores (persisted to AsyncStorage via `zustand/middleware`). `activeWorkoutStore` (`@SparkyFitness/active-workout`) holds the currently-running workout timer state: active session snapshot, flattened `steps` list, `completedSetIds`, and `activeRest` (with `state: 'running' | 'paused' | 'complete'`, absolute `endsAt`, scheduled notification id, and a monotonic `instanceToken` used to reject stale async schedule resolutions). Exposes `startWorkout`/`startWorkoutAtSet`/`clearWorkout`/`toggleSetComplete`/`pauseRest`/`resumeRest`/`dismissRest`/`markRestComplete`/`reconcileWithSession`.
- **hooks/** — React Query hooks for food (`useDailySummary` (uses unified `/api/daily-summary` endpoint, computes calories/macros/exercise/water via `select` transform), `useFoods`, `useFoodSearch`, `useFoodVariants`, `useExternalFoodSearch`, `useMeals`, `useMealSearch`, `useMealTypes`, `useDeleteFoodEntry`, `useUpdateFoodEntry`, `useSaveFood`, `useAddFoodEntry` (optionally saves food then creates entry)), exercise/workout (`useExerciseHistory` (paginated with cursor), `useSuggestedExercises`, `useExerciseSearch`, `useExternalExerciseSearch` (infinite query), `useWorkoutPresets`, `useWorkoutPresetSearch`, `useExerciseMutations` (consolidated: exports `useCreateWorkout`, `useUpdateWorkout`, `useDeleteWorkout`, `useCreateExerciseEntry`, `useUpdateExerciseEntry`, `useDeleteExerciseEntry`), `useWorkoutForm` (reducer + draft persistence — exports `getWorkoutDraftSubmission` pure function for building API payloads), `useActivityForm` (reducer + draft persistence — exports `getActivityDraftSubmission` pure function), `useDraftPersistence` (extracted generic draft auto-save hook with 300ms debounce + AppState background saves, used by both form hooks), `useExerciseSetEditing` (manages active set editing state for workout forms — tracks `activeSetKey`/`activeSetField`, handles add/remove exercise with confirmation), `useSelectedExercise` (nonce-based exercise return from ExerciseSearch), `useExerciseImageSource` (resolves exercise image URIs with proxy headers)), shared (`useMeasurements`, `useMeasurementsRange` (exports `StepsDataPoint`, `StepsRange`, `WeightDataPoint` types), `usePreferences` (auto-syncs device timezone to server preferences with exponential backoff retry), `useProfile`, `useRefetchOnFocus`, `useServerConnection`, `useSyncHealthData` (accepts `showToasts` option — fires toast notifications on sync start/success/error), `useWaterIntakeMutation`, `useExternalProviders`, `useDebounce`, `useDebouncedSearch` (generic reusable debounced search with React Query)), `useAuth` (manages three modal states: `showReauthModal` for session expiry, `showSetupModal` for no configs, `showApiKeySwitchModal` for auth mode switching; exports `handleSwitchToApiKey`, `handleSwitchToApiKeyDone`, `switchToApiKeyConfig`, `expiredConfigId`) + `invalidateExerciseCache` (shared cache invalidation for all exercise mutations) + `syncExerciseSessionInCache` (optimistic cache update for exercise history and daily summary) + query client config (`queryClient.ts`) and query key definitions (`queryKeys.ts`)
- **types/** — TypeScript interfaces: `dailySummary`, `foodEntries` (extended with variant/meal/micronutrient/serving_unit fields), `foods` (FoodItem, FoodDefaultVariant with comprehensive nutrient fields, FoodSearchResponse), `foodInfo` (FoodInfoItem — normalized bridge between local/external/meal sources), `externalFoods` (ExternalFoodItem, ExternalFoodVariant), `meals` (Meal, MealFood), `mealTypes` (MealType), `exercise` (Exercise with category/equipment/muscles/calories_per_hour/source, SuggestedExercisesResponse), `externalExercises` (ExternalExerciseItem, PaginatedExternalExerciseSearchResult), `workoutPresets` (WorkoutPreset, WorkoutPresetExercise, WorkoutPresetSet), `drafts` (WorkoutDraft, ActivityDraft, FormDraft union), `externalProviders` (includes `EXERCISE_PROVIDER_TYPES` alongside `FOOD_PROVIDER_TYPES`), `navigation` (RootStackParamList with Onboarding + exercise/workout screens, TabParamList with Workouts tab), `goals` (expanded with detailed nutrient targets: individual fat types, vitamins, minerals, meal timing percentages, custom nutrients), `measurements` (CheckInMeasurement, CheckInMeasurementRange), `preferences`, `profile`, `healthRecords` (includes `ExerciseSet` for exercise set data), `diagnosticReport` (general diagnostic report types), `healthDiagnosticReport` (Health Connect diagnostic report types + version constant), `mobileHealthData.d.ts`, `global.d.ts`. Core exercise session types (`ExerciseSessionResponse`, `IndividualSessionResponse`, `PresetSessionResponse`, `ExerciseHistoryResponse`, etc.) come from `@workspace/shared`.
- **utils/** — `dateUtils.ts` (date formatting/arithmetic), `syncUtils.ts` (sync duration/interval types), `unitConversions.ts` (weight kg/lbs and distance km/miles conversions — server storage is metric), `activityDetails.ts` (parses `ActivityDetailResponse[]` from synced sessions into human-readable summaries for Garmin/Withings providers), `concurrency.ts` (`withTimeout`, `runTasksInBatches`, `createConcurrencyLimiter` — used by health sync services), `workoutSession.ts` (shared workout display helpers: `getWorkoutIcon`, `getSourceLabel`, `formatDuration`, `getFirstImage`, `getSessionCalories`, `getWorkoutSummary`, `CATEGORY_ICON_MAP`, plus workout stats: `calculateExerciseStats`, `calculateCaloriesBurned`, `calculateActiveCalories`, `calculateExerciseDuration`, and `buildExercisesPayload` for API payload construction with weight unit conversion), `numericInput.ts` (locale-tolerant decimal parsing — `parseDecimalInput` accepts `.` or `,` decimal separators and `.`/`,`/space thousands separators, uses strict per-shape regex validation so malformed input like `1..5` or `1,2,3` returns `NaN` rather than being silently normalized; `DECIMAL_INPUT_REGEX` is the permissive keystroke filter), `rateLimiter.ts` (sliding window `RateLimiter` class for API call rate limiting)
- **constants/** — `meals.ts` (meal type config, icons, labels, time-based defaults), `exercise.ts` (currently empty — category-based routing removed in favor of explicit AddSheet navigation)
- **HealthMetrics.ts** — Health metric definitions filtered by platform and enabled status at runtime

### Platform-Specific Code

- `healthConnectService.ts` — Android orchestration layer (imports from `healthconnect/`)
- `healthConnectService.ios.ts` — iOS orchestration layer (imports from `healthkit/`)

**IMPORTANT**: Both files implement their own `syncHealthData()` with substantial sync logic. They are NOT thin re-exports. Edit the platform-specific file directly for sync changes (e.g., `.ios.ts` for iOS).

Both platform orchestrators use batched concurrent metric fetching via `runTasksInBatches` from `utils/concurrency`: `METRIC_FETCH_CONCURRENCY = 3` parallel queries, `METRIC_TIMEOUT_MS = 60_000` per metric, auto-skip remaining batches on `TimeoutError`.

Each platform subdirectory (`healthconnect/`, `healthkit/`) contains parallel modules for data reading, aggregation, transformation, and preference management. Both platform exercise transformers emit a default "Working Set" with duration for each synced exercise session. The Android `EXERCISE_MAP` covers the full `ExerciseType` enum from `react-native-health-connect`.

### Health Data Upload

`healthDataApi.ts` handles chunked upload with retry:
- `CHUNK_SIZE = 5_000` records per request; session-type records (sleep, exercise, workout) are grouped by source and sent unsplit
- `fetchWithTimeout` wraps fetch with `AbortController` (`FETCH_TIMEOUT_MS = 30_000`)
- `fetchWithRetry` adds exponential backoff (up to `MAX_RETRIES = 3`, skips retries on 4xx); triggers `notifySessionExpired` on 401 for session auth

### React Query

- `staleTime: Infinity` on the global client — manual refresh only (some hooks override, e.g., preferences uses 30min)
- `useRefetchOnFocus(refetch, enabled)` — standard hook for refetching on screen focus
- Query keys: static arrays (`serverConnectionQueryKey`, `preferencesQueryKey`, `profileQueryKey`, `waterContainersQueryKey`, `foodsQueryKey`, `mealsQueryKey`, `externalProvidersQueryKey`, `mealTypesQueryKey`, `exerciseHistoryQueryKey`, `exerciseHistoryResetQueryKey`, `suggestedExercisesQueryKey`, `workoutPresetsQueryKey`) and parameterized functions (`dailySummaryQueryKey(date)`, `measurementsQueryKey(date)`, `measurementsRangeQueryKey(startDate, endDate)`, `goalsQueryKey(date)`, `foodSearchQueryKey(searchTerm)`, `mealSearchQueryKey(searchTerm)`, `externalFoodSearchQueryKey(providerType, searchTerm, providerId)`, `foodVariantsQueryKey(foodId)`, `exerciseSearchQueryKey(searchTerm)`, `externalExerciseSearchQueryKey(providerType, searchTerm, providerId?)`, `workoutPresetSearchQueryKey(searchTerm)`) — exported from `hooks/queryKeys.ts`

### Styling (TailwindCSS v4 + Uniwind)

TailwindCSS v4 with Uniwind for React Native. Theme variables defined in `global.css`:
- `className="bg-surface text-text-primary rounded-md p-4"`
- `useCSSVariable('--color-accent-primary')` for JS access (used extensively in Skia charts)
- Themes: **Light**, **Dark**, **AMOLED** (true black), **System** — managed by `themeService.ts`, stored in AsyncStorage
- CSS variable categories: backgrounds (`background`/`surface`/`raised`/`chrome`), borders (`border`/`border-subtle`/`border-strong`/`chrome-border`), text (`text-primary`/`text-secondary`/`text-muted`), accents (`accent-primary`/`accent-muted`), tabs, forms (`form-enabled`/`form-disabled`), data colors (`calories`/`macro-protein`/`macro-carbs`/`macro-fat`/`macro-fiber`/`hydration`/`exercise`), progress (`progress-track`/`progress-overfill`), status backgrounds + text (`success`/`warning`/`danger`)

### Charts

Charts use `@shopify/react-native-skia` for custom rendering (calorie ring, gauges) and `victory-native` for data charts (bar charts). For animations, use **Reanimated hooks** (not Skia's deprecated animation API):

```tsx
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withTiming } from 'react-native-reanimated';

const progress = useSharedValue(0);

useEffect(() => {
  progress.value = withTiming(targetValue, { duration: 500 });
}, [targetValue]);

const path = useDerivedValue(() => {
  const p = Skia.Path.Make();
  p.addArc(oval, -90, progress.value * 360);
  return p;
});
```

### iOS HealthKit Accuracy

For **cumulative metrics** (steps, calories), use `queryStatisticsForQuantity` with `cumulativeSum` to match Health app values. Raw samples produce incorrect totals.

**Using correct approach:** Steps (`getAggregatedStepsByDate`), Active Calories, Total Calories, Distance, Floors Climbed

**Fine with raw samples:** Heart Rate, Weight, Body Fat, Sleep, etc.

### Authentication & Proxy Headers

The app supports two auth modes per `ServerConfig.authType`:
- **`apiKey`** — API key sent as `Authorization: Bearer <API_KEY>` (original mode). Configured via `ServerConfigModal`.
- **`session`** — Session token-based auth via `authService.ts` (login with email/password, optional MFA via TOTP or email OTP). Configured via `OnboardingScreen` or `ReauthModal`.

**Auth UI Flow**: Three entry points:
1. **`OnboardingScreen`** — First-time setup. Shown as initial route when no `ServerConfig` exists. Server URL input with reachability check and clipboard paste, then auth via SegmentedControl toggle between Sign In (email/password + MFA) and API Key modes.
2. **`ReauthModal`** — Session re-authentication. Shown by `useAuth` hook on 401/session expiry. Supports server picker for multi-config setups and "Use API Key Instead" fallback.
3. **`ServerConfigModal`** — Server URL, API key, and proxy headers editing from Settings. Also handles API key switch flow.

`useAuth` hook manages three modal states: `showReauthModal` (session expired), `showSetupModal` (no configs → navigates to Onboarding), `showApiKeySwitchModal` (auth mode switching). MFA logic is extracted into a shared `MfaForm` component (`src/components/auth/MfaForm.tsx`) used by both `OnboardingScreen` and `ReauthModal`.

**Proxy Headers**: Per-server custom HTTP headers for reverse proxy auth (Pangolin, Cloudflare Access, etc.). Stored in SecureStore as `ProxyHeader[]` on each `ServerConfig`. Injected globally into all API requests via `proxyHeadersToRecord()` in `apiClient.ts` and raw fetch calls in `healthDataApi.ts`. Proxy headers UI is integrated directly into `ServerConfigModal`. During login flows, `setPendingProxyHeaders()`/`clearPendingProxyHeaders()` on `authService` manages headers before a config is saved.

### Shared Workspace (`@workspace/shared`)

Monorepo package at `../shared/` providing Zod schemas, TypeScript types, constants, and timezone utilities shared between server and mobile. The mobile app imports from `@workspace/shared`. Key exports:
- **Exercise/workout types**: `ExerciseSessionResponse` (discriminated union: `IndividualSessionResponse | PresetSessionResponse`), `ExerciseHistoryResponse`, `CreatePresetSessionRequest`, `ExerciseEntryResponse`, `ExerciseEntrySetResponse`, `ActivityDetailResponse`, `Pagination`
- **API schemas**: `dailySummaryResponseSchema`/`DailySummaryResponse` (aggregates goals + food entries + exercise sessions + water intake), `dailyGoalsResponseSchema`, `foodEntryResponseSchema`, `exerciseSessionResponseSchema`
- **Constants**: `MEASUREMENT_PRECISION`/`getPrecision()` for decimal formatting, `CALORIE_CALCULATION_CONSTANTS`/`ACTIVITY_MULTIPLIERS` for step/calorie math
- **Timezone utilities** (`shared/src/utils/timezone.ts`): `isDayString`, `addDays`, `compareDays`, `dayToPickerDate`, `localDateToDay` for day-string operations; `isValidTimeZone`, `todayInZone`, `instantToDay`, `userHourMinute`, `instantHourMinute`, `dayToUtcRange`, `dayRangeToUtcRange` for timezone-aware conversions

### Workout & Exercise Architecture

Two session types via discriminated union (`ExerciseSessionResponse`):
- **Preset** (`type: 'preset'`): Grouped workout with named exercises and per-exercise sets (weight/reps). Created via `WorkoutAddScreen`, viewed/edited via `WorkoutDetailScreen`.
- **Individual** (`type: 'individual'`): Single exercise activity with duration, optional distance, calories. Created via `ActivityAddScreen`, viewed/edited via `ActivityDetailScreen`.

**Draft system**: `workoutDraftService` persists in-progress forms to AsyncStorage (`@SessionDraft`). Both `useWorkoutForm` and `useActivityForm` use `useDraftPersistence` (extracted generic hook) for auto-saving on changes (300ms debounce) and app backgrounding. Draft detection is handled in `App.tsx`'s `handleStartExerciseForm` (triggered from AddSheet) — prompts resume vs. discard when an active draft exists. `workoutDraftService.loadActiveDraft()` returns a draft only if it has meaningful data.

**Exercise selection**: `ExerciseSearchScreen` operates in `returnKey` mode only — returns selected exercise to the caller via `CommonActions.setParams` + nonce pattern. Has Search/Online tabs (no Workouts tab). The AddSheet provides explicit Workout/Activity/Preset buttons that navigate directly to `WorkoutAdd`, `ActivityAdd`, or `PresetSearch`.

**External providers**: `useExternalProviders` accepts optional `filterSet` param (defaults to `FOOD_PROVIDER_TYPES`). Exercise features pass `EXERCISE_PROVIDER_TYPES` (wger, free-exercise-db). Import creates a local `Exercise` object.

**Cache invalidation**: `invalidateExerciseCache()` shared utility called by all exercise mutation hooks — removes history pages, signals reset, invalidates suggested exercises and daily summary.

**Workout timer (rest timer HUD)**: Live rest timer and set-completion tracker for preset workouts. State lives in `stores/activeWorkoutStore` (zustand with AsyncStorage persist) so it survives app backgrounding and cold starts. `ActiveWorkoutBar` renders as a sibling of the root navigator (not inside a screen) so it floats above every screen — it uses the shared `navigationRef` from its module to deep-link into `WorkoutDetail` for the active session. `WorkoutDetailScreen` reads/writes the store to drive the "tap to start", set-complete, and rest timer UI. Rest notifications are scheduled via `services/notifications` using `expo-notifications` on both platforms plus `expo-haptics` for completion haptics; the Android `workout-timer` channel is set up in `initNotifications()`, called from `App.tsx` on mount. Set IDs on a preset workout are preserved across edits (server-side in `exerciseService`) so the active rest timer and completed-set state stay correctly bound to rows after an inline edit.

## Server API

All endpoints require auth headers (API key or session token). Custom proxy headers are injected before auth headers when configured.

**Note**: `healthDataApi.ts` uses raw `fetch` (not the shared `apiFetch` wrapper) but still injects proxy headers.

| Endpoint | Purpose | Service |
|----------|---------|---------|
| `POST /api/health-data` | Send health data array | `healthDataApi` |
| `GET /auth/user` | Connection check | `healthDataApi` |
| `GET /api/daily-summary?date={date}` | Unified daily summary (goals + food + exercise + water) | `dailySummaryApi` |
| `GET /api/goals/for-date?date={date}` | Daily nutrition goals | `goalsApi` |
| `GET /api/food-entries/by-date/{date}` | Food entries by date | `foodEntriesApi` |
| `POST /api/food-entries/` | Create food entry | `foodEntriesApi` |
| `PUT /api/food-entries/{id}` | Update food entry | `foodEntriesApi` |
| `DELETE /api/food-entries/{id}` | Delete food entry | `foodEntriesApi` |
| `GET /api/foods` | Recent and top foods | `foodsApi` |
| `GET /api/foods/foods-paginated` | Search local foods | `foodsApi` |
| `GET /api/foods/food-variants` | Food variants by food ID | `foodsApi` |
| `POST /api/foods` | Save custom food | `foodsApi` |
| `GET /api/foods/barcode/:barcode` | Barcode lookup | `foodsApi` |
| `POST /api/foods/scan-label` | Nutrition label scanning via image | `foodsApi` |
| `GET /api/foods/openfoodfacts/search` | Search Open Food Facts | `externalFoodSearchApi` |
| `GET /api/foods/usda/search` | Search USDA FoodData Central | `externalFoodSearchApi` |
| `GET /api/foods/fatsecret/search` | Search FatSecret | `externalFoodSearchApi` |
| `GET /api/foods/fatsecret/nutrients` | FatSecret detailed nutrients | `externalFoodSearchApi` |
| `GET /api/foods/mealie/search` | Mealie recipe search | `externalFoodSearchApi` |
| `GET /api/meals` | All saved meals | `mealsApi` |
| `GET /api/meals/search` | Search meals | `mealsApi` |
| `GET /api/meal-types` | Meal type definitions | `mealTypesApi` |
| `GET /api/external-providers` | Configured external providers | `externalProvidersApi` |
| `GET /api/v2/exercise-entries/by-date?selectedDate={date}` | Exercise entries by date | `exerciseApi` |
| `GET /api/v2/exercise-entries/history?page={p}&pageSize={n}` | Paginated exercise session history | `exerciseApi` |
| `GET /api/exercises/suggested?limit={n}` | Recent + popular exercises | `exerciseApi` |
| `GET /api/exercises/search?searchTerm={term}` | Search local exercises | `exerciseApi` |
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
| `GET /api/measurements/check-in/{date}` | Health measurements | `measurementsApi` |
| `GET /api/measurements/check-in-measurements-range/{start}/{end}` | Measurements over date range | `measurementsApi` |
| `GET /api/measurements/water-intake/{date}` | Water intake for date | `measurementsApi` |
| `POST /api/measurements/water-intake` | Add/remove water intake | `measurementsApi` |
| `GET /api/water-containers` | Water container presets | `measurementsApi` |
| `GET /api/user-preferences` | User preferences | `preferencesApi` |
| `PUT /api/user-preferences` | Update user preferences (COALESCE — only updates provided fields) | `preferencesApi` |
| `GET /api/auth/profiles` | User profile | `profileApi` |

## Testing

```bash
pnpm test                                   # Watch mode
pnpm run test:run                           # Single run
pnpm run test:coverage                      # Coverage report
```

Tests in `__tests__/` mirror source structure (`hooks/`, `services/`). Mocks in `jest.setup.js`. Preset: `jest-expo` with `jsdom` environment.

When writing or modifying tests, run the FULL test suite (not just new tests) to catch mock pollution and regressions in existing tests. Never introduce global mocks without checking for side effects on other test files.

When fixing a bug that could have been caught by a test, write a regression test that reproduces the bug and verifies the fix.

### Testing Android Code on macOS

Jest loads `.ios.ts` by default. Use explicit require for Android:

```ts
const androidService = require('../../src/services/healthConnectService.ts');
```

## UI Components

**Always use the project's shared UI primitives instead of raw React Native components:**

- **`FormInput`** (`src/components/FormInput.tsx`): Themed `TextInput` drop-in replacement. Handles border, background, padding, placeholder color, and the iOS text alignment / lineHeight bug. Use for all text inputs unless the input needs a custom wrapper layout (e.g., a paste button inline).
- **`Button`** (`src/components/ui/Button.tsx`): Themed `Pressable` with variants: `primary`, `secondary`, `outline`, `ghost`, `header`. Use instead of raw `TouchableOpacity` or `Pressable` for actions.

Before using SF Symbol names or icon identifiers, verify they exist in the project's icon set. Use substring/grep search on the icon definitions rather than guessing names.

## After Refactors

After making file moves or import refactors, always run the full test suite immediately and verify asset/require paths are correct before reporting completion.

## API Documentation

Detailed API docs live in `docs/`:
- `food_api.md` — Food entry creation payloads and response formats
- `external_providers.md` — External food provider integration (FatSecret, Open Food Facts, USDA, Nutritionix, Mealie, Tandoor)
- `measurements_api.md` — Measurement range and custom measurement endpoints
- `sync_api.md` — Health data sync API
- `healthkit.md` — HealthKit integration details
- `development.md` — Development setup and conventions
- `user_flows.md` — User flow documentation
- `technical-design-document.md` — Technical design overview

## Build & Release

- **Android**: GitHub Actions with release signing
- **iOS**: EAS Build (`eas build --platform ios`)

## Workflow

- When asked to plan something, always ask clarifying questions before producing the plan. Do not start exploring code or writing plans without confirming scope with the user first.
