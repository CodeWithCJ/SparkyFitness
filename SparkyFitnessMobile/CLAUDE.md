# CLAUDE.md

*Last updated: 2026-04-22*

SparkyFitness Mobile is a React Native (0.81) + Expo (SDK 54) app for syncing health data (HealthKit/Health Connect) to a personal server and displaying daily nutrition, exercise, workout tracking, and hydration summaries.

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

- **components/** — UI primitives and feature components: dashboard cards, chart components (Skia + victory-native), diary views, food entry forms, workout display/editing (`EditableExerciseCard`, `EditableSetRow`, `WorkoutEditableExerciseList`, `RestPeriodChip`/`RestPeriodSheet`), workout execution (`ActiveWorkoutBar` — floats above every screen, exports `useActiveWorkoutBarPadding` and `navigationRef`), navigation (`CustomTabBar`), settings UI, auth (`MfaForm`), modals (`ReauthModal`, `ServerConfigModal`), and `ui/` primitives (`Button`, `toastConfig`).
- **screens/** — Top-level screens for onboarding, dashboard, diary, settings, sync, logs, library (`LibraryScreen` tab + `FoodsLibraryScreen` paginated list + `FoodDetailScreen`), workouts/activities (add + detail), exercise/preset search, food search/scan/form/entry. `DashboardScreen`/`DiaryScreen` support fling gestures for date navigation.
- **services/** — Organized into subdirectories:
  - `api/` — API clients (`apiClient` with proxy header injection, `authService`, `dailySummaryApi`, `exerciseApi`, `foodsApi`, `healthDataApi`, etc.)
  - `healthconnect/` — Android health data read/aggregation/transformation/preferences
  - `healthkit/` — iOS equivalents plus `backgroundDelivery`
  - `shared/` — `preferences.ts` factory + `healthPermissionMigration.ts`
  - Top-level: `healthConnectService.ts`/`.ios.ts` (platform orchestration), `backgroundSyncService`, `storage`, `LogService`, `themeService`, `workoutDraftService`, `diagnosticReportService`, `healthDiagnosticService` (Android-only), `notifications` (rest-timer scheduling), `haptics`.
- **stores/** — Zustand stores (persisted via `zustand/middleware`). See **Workout timer** below for `activeWorkoutStore`.
- **hooks/** — React Query hooks organized by domain (food, exercise/workout, measurements, profile, preferences). `useAuth` manages reauth/setup/api-key-switch modals. Shared cache helpers: `invalidateExerciseCache`, `syncExerciseSessionInCache`, `refreshHealthSyncCache`. Query keys live in `hooks/queryKeys.ts`.
- **types/** — TypeScript interfaces. Core exercise session types (`ExerciseSessionResponse`, `IndividualSessionResponse`, `PresetSessionResponse`, `ExerciseHistoryResponse`) come from `@workspace/shared`.
- **utils/** — `dateUtils`, `unitConversions` (kg/lbs, km/miles — server storage is metric), `concurrency` (`withTimeout`, `runTasksInBatches`), `workoutSession` (display helpers + stats + `buildExercisesPayload`), `numericInput` (locale-tolerant decimal parsing with strict per-shape validation), `rateLimiter`.
- **constants/** — `meals.ts` (meal types, icons, time-based defaults).
- **HealthMetrics.ts** — Health metric definitions filtered by platform and enabled status at runtime.

### Platform-Specific Code

- `healthConnectService.ts` — Android orchestration (imports from `healthconnect/`)
- `healthConnectService.ios.ts` — iOS orchestration (imports from `healthkit/`)

**IMPORTANT**: Both files implement their own `syncHealthData()` with substantial sync logic. They are NOT thin re-exports. Edit the platform-specific file directly for sync changes (e.g., `.ios.ts` for iOS).

Both orchestrators use batched concurrent metric fetching via `runTasksInBatches`: `METRIC_FETCH_CONCURRENCY = 3`, `METRIC_TIMEOUT_MS = 60_000`, auto-skip remaining batches on `TimeoutError`. Both exercise transformers emit a default "Working Set" with duration for each synced exercise session.

### Health Data Upload

`healthDataApi.ts` handles chunked upload with retry:
- `CHUNK_SIZE = 5_000` records per request; session-type records (sleep, exercise, workout) are grouped by source and sent unsplit
- `fetchWithTimeout` wraps fetch with `AbortController` (`FETCH_TIMEOUT_MS = 30_000`)
- `fetchWithRetry` adds exponential backoff (up to `MAX_RETRIES = 3`, skips 4xx); triggers `notifySessionExpired` on 401 for session auth

### React Query

- `staleTime: Infinity` on the global client — manual refresh only (some hooks override, e.g., preferences uses 30min)
- `useRefetchOnFocus(refetch, enabled)` — standard hook for refetching on screen focus
- Query keys are centralized in `hooks/queryKeys.ts` (static arrays + parameterized functions like `dailySummaryQueryKey(date)`, `measurementsRangeQueryKey(start, end)`, `exerciseSearchQueryKey(term)`)

### Styling (TailwindCSS v4 + Uniwind)

TailwindCSS v4 with Uniwind for React Native. Theme variables in `global.css`:
- `className="bg-surface text-text-primary rounded-md p-4"`
- `useCSSVariable('--color-accent-primary')` for JS access (used extensively in Skia charts)
- Themes: **Light**, **Dark**, **AMOLED** (true black), **System** — managed by `themeService.ts`, stored in AsyncStorage
- CSS variable categories: backgrounds, borders, text, accents, tabs, forms, data colors (`calories`, `macro-*`, `hydration`, `exercise`), progress, status

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

**Using correct approach:** Steps (`getAggregatedStepsByDate`), Active Calories, Total Calories, Distance, Floors Climbed. **Fine with raw samples:** Heart Rate, Weight, Body Fat, Sleep, etc.

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

### Food Library

The **Library** tab (`LibraryScreen`) is the entry point for browsing saved foods. It shows "Create food" tiles + a 3-item preview of recent foods, with "View all" pushing `FoodsLibraryScreen` (paginated, infinite-scroll search over `/api/foods/foods-paginated`). Rows push `FoodDetailScreen`, which renders nutrition via `FoodNutritionSummary`, exposes a serving-variant picker (`useFoodVariants`), and offers Log / Edit / Delete. Edit jumps to `FoodFormScreen` in `edit-food` mode (a third mode alongside `create-food` and `adjust-entry-nutrition`); Delete uses `useDeleteFood`. Edit/Delete are gated on `profile.id === food.userId` (owner-only). Nutrition value transforms (local variants, external variants, selected display values, editable payload) live in `utils/foodDetails.ts` and are shared across `FoodDetailScreen`, `FoodEntryAddScreen`, and `FoodFormScreen`.

`useFoodsLibrary` (infinite query) uses `queryClient.resetQueries` instead of `query.refetch()` on focus/pull-to-refresh — `refetch()` re-downloads every cached page, so a user deep in the list pays for pages 1..N on every focus. Same pattern as `useExerciseHistory`. `loadMore` gates on `isFetching` (not just `isFetchingNextPage`) so pagination cannot overlap with a reset and leave gaps.

`BottomSheetPicker` and `CalendarSheet` pass `containerComponent={FullWindowOverlay}` (iOS only) so the sheets render in a UIWindow above any native modal presentation. Earlier versions wrapped modal-presented screens in a local `BottomSheetModalProvider`, but that polluted the root provider's bottom-inset state and left the AddSheet with stale padding after dismissal — using `FullWindowOverlay` per-sheet avoids the nested provider entirely.

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
| `PUT /api/foods/food-variants/{id}` | Update a food variant's nutrition | `foodsApi` |
| `POST /api/foods` | Save custom food | `foodsApi` |
| `PUT /api/foods/{id}` | Update food metadata (name, brand) | `foodsApi` |
| `DELETE /api/foods/{id}` | Delete a food | `foodsApi` |
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

Tests in `__tests__/` mirror source structure. Mocks in `jest.setup.js`. Preset: `jest-expo` with `jsdom` environment.

When writing or modifying tests, run the FULL test suite (not just new tests) to catch mock pollution and regressions. Never introduce global mocks without checking for side effects on other test files. When fixing a bug that could have been caught by a test, write a regression test that reproduces the bug and verifies the fix.

### Testing Android Code on macOS

Jest loads `.ios.ts` by default. Use explicit require for Android:

```ts
const androidService = require('../../src/services/healthConnectService.ts');
```

## UI Components

Always use the project's shared UI primitives instead of raw React Native components:

- **`FormInput`** (`src/components/FormInput.tsx`): Themed `TextInput` drop-in replacement. Handles border, background, padding, placeholder color, and the iOS text alignment / lineHeight bug. Use for all text inputs unless you need a custom wrapper layout (e.g., a paste button inline).
- **`Button`** (`src/components/ui/Button.tsx`): Themed `Pressable` with variants `primary`, `secondary`, `outline`, `ghost`, `header`. Use instead of raw `TouchableOpacity` or `Pressable` for actions.

Before using SF Symbol names or icon identifiers, verify they exist in the project's icon set via substring/grep search rather than guessing.

## After Refactors

After file moves or import refactors, always run the full test suite immediately and verify asset/require paths are correct before reporting completion.

## API Documentation

Detailed API docs live in `docs/`: `food_api.md`, `external_providers.md`, `measurements_api.md`, `sync_api.md`, `healthkit.md`, `development.md`, `user_flows.md`, `technical-design-document.md`.

## Build & Release

- **Android**: GitHub Actions with release signing
- **iOS**: EAS Build (`eas build --platform ios`)

## Workflow

- When asked to plan something, always ask clarifying questions before producing the plan. Do not start exploring code or writing plans without confirming scope with the user first.
