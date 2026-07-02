# AGENTS.md

*Last updated: 2026-06-24*

SparkyFitness Mobile is a React Native 0.83.6 + Expo SDK 55 app for syncing Apple Health / Health Connect data with the SparkyFitness backend, tracking nutrition, hydration, fasting, measurements, exercise, saved foods, meal templates, custom exercises, workout presets, iOS / Android widgets, and the active workout HUD.

This is the package guide for `SparkyFitnessMobile/`. Work from this directory for mobile implementation and validation. If a task crosses into the backend, frontend, or `shared/`, read that package guide too before editing outside mobile.

## Scope And Style

- TypeScript is strict. Keep changes type-safe and compiling cleanly.
- Prefer small, direct changes that fit the existing screen, hook, and service boundaries.
- For ambiguous bugs, prove which layer is failing before patching. One narrow diagnostic check beats speculative edits across multiple layers.
- Do not replace a working implementation with a rewrite unless the requester explicitly approves that direction.
- Run scripts from `SparkyFitnessMobile/`, except root package operations such as `pnpm install` for patched dependencies.
- Treat `android/` and `ios/` as generated output when possible. Edit `app.config.ts`, `plugins/`, `targets/`, JS/TS sources, or patch files first, then regenerate with prebuild when needed.

## Stack And Imports

- Primary stack: React 19.2, React Native 0.83.6, Expo SDK 55, React Navigation 7, TanStack Query 5, Uniwind / TailwindCSS v4, Reanimated 4, Skia, Victory Native, Expo Background Task / Task Manager / Notifications, Zustand.
- `@/*` maps to this package and `@workspace/shared` maps to `../shared/src/index.ts`.
- Prefer `@workspace/shared` schemas, constants, date/timezone helpers, and types over local duplicates.
- The app talks to the backend under `/api`; health uploads go to `POST /api/health-data`.
- Server-stored distance/weight units are metric. UI conversion belongs in mobile helpers such as `unitConversions.ts`.

## Commands

```bash
pnpm start
pnpm run ios
pnpm run android
pnpm run lint
pnpm run typecheck
pnpm run validate
pnpm run test:run -- --watchman=false --runInBand
pnpm exec jest --watchman=false --runInBand <test-path>
pnpm run test:coverage -- --watchman=false --runInBand
npx expo prebuild -c
```

- `pnpm run validate` runs typecheck and Expo lint.
- Use Watchman-disabled Jest commands in agent/sandbox runs; bare Jest often fails on macOS.
- `collectCoverage` is enabled in Jest config, so expect coverage output from normal test runs.
- Run `npx expo prebuild -c` after native dependency changes, permissions, app group or widget target changes, Expo plugin changes, native config edits, or patching native modules.
- After editing the root `patches/react-native-health-connect@3.5.3.patch`, run `pnpm install` from the repo root, then prebuild from mobile.

## App Shell And Navigation

- `App.tsx` is the root composition point. `App()` wraps `QueryClientProvider`, `KeyboardProvider`, `GestureHandlerRootView`, and `BottomSheetModalProvider`; `AppContent()` owns `NavigationContainer`, `SafeAreaProvider`, navigators, `AddSheet`, auth modals, the embedded/floating active-workout bars, the tab-bar `WhatsNewBanner`, and toasts.
- Startup initializes theme, haptics, sounds, notification prefs, logs, timezone bootstrap, background sync, pending cache refreshes, fasting/hydration card visibility, and platform health observers.
- Initial route comes from `getActiveServerConfig()`: no active config lands on `Onboarding`; otherwise users enter `Tabs`.
- Deep links are enabled only after startup confirms `Tabs`, so widget links do not bypass first-run onboarding.
- Navigation source of truth is `App.tsx` plus `src/types/navigation.ts`; update both and the linking config when routes change.
- Root stack uses `@react-navigation/native-stack`. Tabs use `@react-navigation/bottom-tabs`.
- Tabs are `Dashboard`, `Diary`, `Add`, `Library`, and `Settings`. `Add` is a center action in `CustomTabBar`, not a content screen.
- Native iOS Liquid Glass tabs use `@bottom-tabs/react-navigation` in `src/components/TabsLayout.tsx`; each content tab is wrapped in its own `createNativeStackNavigator` so the tab path still gets native headers.
- When adding a root-stack screen, add the route to `RootStackParamList` and register a matching `<Stack.Screen>` in `App.tsx` with `createStackScreenOptions(...)` or equivalent explicit iOS native-stack header options.
- Root-stack screens with a screen-owned React header are automatically checked by `__tests__/navigation/nativeHeaderContract.test.ts`; do not add screen-specific native-header allowlists.
- Root-stack screens with a screen-owned React header and a real back button must set `headerBackTitle` or `headerBackButtonDisplayMode: 'minimal'` in `App.tsx` so iOS back labels stay explicit or intentionally hidden; close/cancel modal headers do not need either option.
- If a root-stack screen has custom React-header actions beyond the native back button, mirror them with `unstable_headerLeftItems` or `unstable_headerRightItems` and hide the React header on iOS.
- If a root-stack screen is intentionally presented above `Tabs` instead of inside native-tabs mode, document it in `NATIVE_TABS_ROUTE_EXCLUSIONS` in `__tests__/navigation/nativeHeaderContract.test.ts` with a short reason.
- If a screen uses native header items (`unstable_headerRightItems` / `unstable_headerLeftItems`), hide its screen-owned React header behind `const usesNativeHeader = useNativeIOSHeadersActive()` (from `src/services/nativeTabBarPreference.ts`) with a guard such as `{!usesNativeHeader && <Header />}` or `usesNativeHeader ? null : <Header />`; otherwise iOS renders both headers. The hook is false on Android and on iOS 26+ when the Liquid Glass toggle is off, so the fallback header covers both paths; gate the `useLayoutEffect` that sets native header items on the same flag.
- When adding a tab, update `TabParamList`, `NativeTab.Screen`, and `FallbackTab.Screen`; for content tabs also add a tab-local native stack screen using `createIOSNativeHeaderOptions(...)`.
- `__tests__/navigation/nativeHeaderContract.test.ts` enforces this native-header wiring. If it fails, fix the route/type/navigator alignment instead of weakening the test.
- Current stack screens include onboarding/tabs, library/detail/form flows for foods/meals/exercises/presets, food entry view/edit, meal type detail and copy, `EditBarcode`, food search/entry/scan/photo flow, workout/activity add/detail, exercise/preset search, settings subscreens, logs, sync, measurements, fasting, and `WhatsNew`.
- `AddSheet` offers Food, Workout, Activity, Preset, Measurements, Scan Food, and Sync Health Data. Keep its present/dismiss refs intact to avoid Android re-present loops.
- `ActiveWorkoutBar` is mounted outside normal screen trees, uses the root navigation ref, and hides itself on modal/editor routes such as food search/forms/scan/photo, exercise search, workout/activity add, measurements, and barcode edit.
- Most screens are wrapped with `withErrorBoundary(...)`; `SettingsScreen` also uses section-level recovery so settings remain reachable.

## Source Map

- `src/components/` - reusable UI, charts, settings rows, custom tab bar, add sheet, workout HUD, form chrome, library rows, diary rows, serving sheets, food/workout editors, fasting UI, writeback UI, and `ui/` primitives.
- `src/components/auth/` - MFA UI shared by onboarding, setup, and reauth.
- `src/screens/` - top-level route destinations: dashboard, diary, settings, sync, logs, Whats New, fasting, food search/scan/photo, library CRUD flows, workout/activity flows, and measurement entry.
- `src/navigation/` - nested navigation such as `FoodPhotoFlow`.
- `src/hooks/` - TanStack Query hooks, auth/connection hooks, library/search/mutation hooks, measurement/water/check-in hooks, fasting hooks, workout form hooks, widget sync, query client, query keys, and cache helpers.
- `src/services/api/` - backend clients. `apiClient.ts` handles normal API auth/proxy headers; `healthDataApi.ts`, `aiSettingsApi.ts`, food-photo estimate, and other raw fetch paths must keep auth, proxy, timeout, and session-expiry behavior aligned.
- `src/services/healthconnect/` - Android Health Connect reads, native aggregation, transformation, enrichment, preferences, and writeback.
- `src/services/healthkit/` - iOS HealthKit reads, statistics aggregation, transformation, background delivery, preferences, and writeback.
- `src/services/shared/` - shared health helpers such as preference factories and permission migration.
- `src/services/` - platform health orchestration, writeback re-exports, background sync, auto-sync coordination, diagnostics, calculations, logging, storage, theme, haptics, sounds, notifications, food photo intro, meal selection, boolean preferences, card visibility, and workout drafts.
- `src/stores/` - Zustand stores, including the persisted active workout/rest timer store.
- `src/utils/` - date helpers, unit conversion, food details, meal nutrition, nutrient display, workout/session helpers, fasting formatting, numeric input, concurrency, sync utilities, photo estimate error mapping, and rate limiting.
- `src/constants/` - meal, exercise, fasting, and nutrient metadata.
- `src/native/` - JS bridges to native modules, including Android widget reloads.
- `plugins/`, `targets/widget/`, `targets/android-widget/` - Expo plugins and widget/native extension sources.

## React Query And Local State

- Query setup lives in `src/hooks/queryClient.ts`; keys live in `src/hooks/queryKeys.ts`.
- Default `staleTime` is `Infinity`, so mutations must explicitly invalidate or update affected caches.
- `useRefetchOnFocus(refetch, enabled)` is the standard focus-refresh hook.
- `useFoodsLibrary` is an intentional exception with an infinite query, finite stale window, and `resetQueries(...)` refreshes so focus/pull refresh reloads page 1 instead of every cached page.
- Meal mutations invalidate meals, recent meals, search, and details; food entry creation can affect recent meals.
- Exercise/workout preset list/search/detail invalidation belongs in their mutation hooks.
- `useUpsertCheckIn` updates measurement queries and calls `refreshHealthSyncCache(queryClient)`.
- `useWaterIntakeMutation` fetches `waterContainersQueryKey`, persists the selected container, and optimistically updates `dailySummaryQueryKey(date)`.
- Active-server switches clear React Query state before refetching connection state.
- Error-boundary retry flows call `queryClient.resetQueries()`.
- Local app-only booleans use `services/booleanPreference.ts` with `useSyncExternalStore`. Current users include haptics, sounds, notifications, hydration card visibility, and fasting card visibility.

## Health Sync

- `src/services/healthConnectService.ts` is Android orchestration; `src/services/healthConnectService.ios.ts` is iOS orchestration. They are substantial platform implementations, not thin wrappers.
- Both orchestrators batch metric reads with `runTasksInBatches`, a concurrency of 3, and per-metric timeouts. Preserve timeout and partial-error handling.
- Bootstrap timezone state before sync. `ensureTimezoneBootstrapped(...)` runs at startup and `healthDataApi.ts` enforces it before upload.
- Preserve `record_timezone` and `record_utc_offset_minutes` when available.
- Manual sync, sync-on-open, foreground-return sync, background sync, and iOS observer-triggered sync share coordination logic. Preserve claim/in-flight guards and cooldown recording.
- Health uploads are chunked. Simple measurements use large chunks; sleep sessions use smaller session chunks; exercise/workout records are grouped by source to match server delete-then-insert behavior.
- Sync result objects include `syncErrors`; callers should surface partial failures and avoid advancing `lastSyncedTime` when any metric read failed.
- `backgroundSyncService.ts` uses overlap windows for sessions and day-aligned rolling windows for cumulative metrics and nutrition. Do not collapse those into one naive window.
- On iOS, cumulative metrics should use HealthKit statistics queries, not raw sample summation.
- On Android, cumulative metrics (`Steps`, `Distance`, `ActiveCaloriesBurned`, `TotalCaloriesBurned`, `FloorsClimbed`) use Health Connect `aggregateGroupByPeriod` once per range. Native source-priority dedup should match Health Connect UI; do not reintroduce JS `Math.max` or source allowlist dedup.
- Android read helpers return `{ records, error }` via `readHealthRecordsDetailed` and `aggregateCumulativeMetricByDayDetailed`; legacy wrappers unwrap only records.
- Android exercise sessions are enriched with `aggregateRecord` for active/total calories and distance over the session window, scoped to `dataOrigin` and filtered for plausibility.
- iOS HealthKit locked-device failures surface as database-inaccessible warnings. Do not treat these as successful empty reads.
- `app.config.ts` grants `android.permission.health.READ_HEALTH_DATA_HISTORY` so Android can read data older than 30 days.
- Health Connect permission migrations belong in `services/shared/healthPermissionMigration.ts`, not UI-only state.
- Core check-in measurements use `measurementsApi.ts` and `MeasurementsAddScreen`; preserve `upsertCheckIn` omitted-vs-null semantics.

## Health Writeback

- Writeback sends Sparky diary nutrition and hydration back to Apple Health on iOS and Health Connect on Android.
- Platform split: `services/writeback.ios.ts` re-exports `healthkit/writeback.ts`; `services/writeback.ts` re-exports `healthconnect/writeback.ts`.
- `runWriteback()` runs after inbound sync in its own try/catch. Writeback failures must not block inbound sync results.
- Writeback is opt-in per metric and gated on write permissions. Android production permissions include `WRITE_NUTRITION` and `WRITE_HYDRATION`; other write permissions are dev-only.
- Imported health entries are skipped to avoid echo loops. iOS sets the app bundle id as the own-source guard; Android relies on source metadata.
- Per-day content-signature hashing skips unchanged days. Each run deletes prior tracked UUIDs then saves fresh records; failed deletes are retried next run.
- `HealthDataWriteback` on `SyncScreen` owns the remove flow. `BottomSheetPicker` offers all-time purge or date range through `DateRangeSheet`; both call `removeWrittenData(range)` and clear tracking.
- Inbound iOS nutrition sync reads food correlations with a rolling nutrition lookback and upserts by `(source, source_id)` server-side.

## Native Patch

- `react-native-health-connect` is declared as `^3.5.3`; the installed 3.5.3 build is patched from the repo root via `pnpm.patchedDependencies`.
- Patch file: `../patches/react-native-health-connect@3.5.3.patch`.
- The patch changes Android `getAggregateGroupByPeriodRequest` implementations from instant-based `getTimeRangeFilter` to local-date-time `getTimeRangeFilterLocal` for non-Steps record types. This protects per-day grouping around DST and local-day boundaries.
- After changing the patch or upgrading `react-native-health-connect`, run `pnpm install` from the repo root and then `npx expo prebuild -c` from mobile before Android validation.

## Food, Meals, Units, And Photo Estimates

- Food search spans local foods, online providers, meals, barcode scan, label scan, and AI photo estimates. Keep `FoodSearchScreen`, `FoodScanScreen`, `FoodEntryAddScreen`, `FoodFormScreen`, `FoodPhotoFlow`, and route params aligned.
- `LibraryScreen` is the hub for saved Foods, Meals, Exercises, and Workout Presets. Full lists live in `FoodsLibraryScreen`, `MealsLibraryScreen`, `ExercisesLibraryScreen`, and `WorkoutPresetsLibraryScreen`.
- Food detail/edit flow: `FoodDetailScreen`, `FoodFormScreen`, `FoodForm`, `FoodUnitSelectorSheet`, `useFoodVariants`, `useFoodsLibrary`, `useDeleteFood`, `foodsApi`, and `utils/foodDetails.ts`.
- `FoodForm` supports equivalent serving sizes grouped by nutrient signature, auto-scale nutrition, compatible unit conversion via `convertServingSizeOnUnitChange`, optional AI cross-category unit conversion, custom nutrients, and caller-provided `headerChildren`.
- `EditBarcodeScreen` lets users add or remove extra barcodes for a saved food. Keep `FoodDetailScreen`, `EditBarcodeScreen`, `foodsApi`, and the `EditBarcode` route params aligned.
- Meal templates use `MealAddScreen`, `MealDetailScreen`, `FoodSearch` / `FoodEntryAdd` with `pickerMode: 'meal-builder'`, and `services/mealBuilderSelection.ts` for pending ingredient handoff.
- Logged-meal grouped diary entries use `foodEntryMealsApi`, `FoodEntryViewScreen`, and `EditLoggedMealScreen`. Preserve stored component nutrition snapshots when editing.
- `MealTypeDetailScreen` owns single-meal-type day views and copy-to-another-day via `useCopyFoodEntries`; be careful with custom meal types and synthetic buckets.
- External food providers use provider-agnostic v2 endpoints where possible. Provider categories and barcode support come from server config; do not hardcode provider type allowlists unless preserving an explicit fallback.
- Photo mode is hidden in meal-builder mode because photo estimates log to the diary.
- `FoodPhotoFlow` is a modal native stack and wraps itself in a local `KeyboardProvider`.
- Photo availability fetches `GET /api/chat/ai-service-settings/active` through `aiSettingsApi.ts`; food photo is attempt-all, so `isFoodPhotoAvailable` gates only on a configured provider, not a specific provider type.
- Estimation posts to `POST /api/foods/estimate-food-photo` through `estimateFoodPhoto(...)` in `externalFoodSearchApi.ts` and uses typed `FoodPhotoEstimateError` codes from `@workspace/shared`.
- Food-photo request/response changes cross package boundaries: update shared schema and server route/service with mobile.
- Keep `auto_scale_online_imports` separate from Open Food Facts-specific scaling preferences in `FoodSettingsScreen`.

## Exercise, Workouts, And Fasting

- Exercise and workout preset flows use `ExerciseSearch`, `PresetSearch`, detail/form screens, paginated/search hooks, mutation hooks, and shared workout payload helpers in `utils/workoutSession.ts`.
- Session responses are discriminated unions from `@workspace/shared`: preset workouts and individual activity sessions have different shapes. Keep detail/edit screens type-safe.
- Workout/activity drafts are persisted by `workoutDraftService`; `useWorkoutForm`, `useActivityForm`, and `useDraftPersistence` own form state.
- Exercise selection returns via `CommonActions.setParams` and a nonce pattern through `useSelectedExercise`.
- Rest timer state lives in `stores/activeWorkoutStore.ts`; notifications are scheduled through `services/notifications.ts`.
- Set IDs are preserved server-side across workout edits so the active workout cursor stays attached to the right row.
- Rest duration is configurable per exercise via `RestPeriodChip` / `RestPeriodSheet` and is forwarded through `buildExercisesPayload`.
- Fasting uses `FastingDetailScreen`, `FastingCard`, `FastingProtocolSheet`, `useFasting`, `useFastingTimer`, `utils/fasting.ts`, and `services/api/fastingApi.ts`.
- `FastingGoalReconciler` is mounted headlessly on `DashboardScreen`; it owns goal-notification reconciliation and app-resume refetch even when the visible fasting card is hidden.
- Fasting goal notifications are gated by the app notifications toggle; ending/canceling a fast clears scheduled notifications.

## Dashboard, Diary, Measurements, And Nutrients

- `DashboardScreen` and `DiaryScreen` share date navigation patterns and support gesture-driven date movement.
- `DashboardScreen` drives hydration quick-add, card visibility, fasting summary, health trends, and widget sync.
- `DiaryScreen` owns meal type sections, measurement summaries, serving quick-adjust, swipe/long-press deletes, and AddSheet date propagation.
- `DashboardSettingsScreen` controls dashboard card visibility and custom nutrient display preferences.
- Custom nutrients are fetched via `useCustomNutrients` from `GET /api/custom-nutrients`; nutrient display preferences use full-array replace through `preferencesApi.ts`.
- Nutrient metadata and defaults live in `constants/nutrients.ts`; aggregation and visibility toggling live in `utils/nutrientUtils.ts`.
- Measurements and water routes are in `measurementsApi.ts`; date-sensitive flows should preserve calendar-day strings and shared timezone helpers.

## Auth, Networking, And Settings

- Server configs support `apiKey` and `session` auth. URLs/IDs are in AsyncStorage; API keys, session tokens, and proxy headers are in SecureStore.
- `OnboardingScreen` handles first-run setup, session sign-in, API keys, MFA, theme, external food source defaults, and finish-without-connection.
- `ServerSettingsScreen` handles server list management, active server switching, connection tests, web dashboard launch, and `ServerConfigModal`.
- `useAuth`, `ReauthModal`, `ServerConfigModal`, `authService.ts`, and `MfaForm` coordinate auth recovery, MFA, session expiry, and API-key fallback.
- Production rejects HTTP server URLs. Preserve HTTPS guards in onboarding, settings, raw fetch paths, and health sync.
- Proxy headers support reverse-proxy auth. They must be injected before auth headers in `apiClient.ts` and raw fetch clients.
- During login before a config is saved, `authService` manages pending proxy headers via `setPendingProxyHeaders()` / `clearPendingProxyHeaders()`.
- Prefer `getApiErrorMessage` / API error helpers over ad hoc error parsing in UI.

## Logging And Diagnostics

- `LogService.ts` is the single source of truth for app logs. Prefer `addLog(message, status?, details?)` over `console.*`.
- Valid log statuses are `DEBUG`, `INFO`, `WARNING`, and `ERROR`. Legacy `SUCCESS` is migrated to `INFO` on read.
- Capture and view filtering are separate thresholds; do not conflate storage filtering with `LogScreen` filtering.
- Use structured `details` arrays for diagnostic context instead of cramming multiline strings into `message`.
- `diagnosticReportService.ts` and `healthDiagnosticService.ts` power diagnostic exports. Android-only raw Health Connect diagnostics belong in `healthDiagnosticService.ts`.

## Styling And UI

- Styling uses Uniwind with TailwindCSS v4 tokens in `global.css`.
- Themes are Light, Dark, AMOLED, and System. `themeService.ts` owns persistence; `App.tsx` syncs Android navigation bar style.
- Many visual components read CSS variables with `useCSSVariable`, especially Skia charts and themed controls.
- `Icon.tsx` maps semantic names to SF Symbols on iOS and Ionicons on Android; verify identifiers before adding icons.
- Use shared primitives where they fit: `FormInput`, `Button`, `SettingsRow`, `SettingsRowGroup`, `SegmentedControl`, `StepperInput`, `BottomSheetPicker`, `CalendarSheet`, `DateRangeSheet`, and `FormScreenChrome`.
- `BottomSheetPicker`, `CalendarSheet`, and sheets shown over native modals use `FullWindowOverlay` on iOS to avoid nested-provider inset bugs.
- Keep button text and compact cards within their stable dimensions across mobile sizes. Avoid layout shifts from dynamic labels, loading states, or icon swaps.

## Widgets And Native Config

- iOS widgets live under `targets/widget/`, share data through the app group from `app.identifiers.js`, and reload through `ExtensionStorage` in `useWidgetSync`.
- Current iOS widgets are calorie and macro widgets. When changing display, update Swift views, shared helpers, TS snapshot shape, and reload kind handling together.
- Android widgets live under `targets/android-widget/`. `plugins/withCalorieWidget.ts` copies Kotlin/templates/resources, registers receivers, wires the native module package, and documents the pattern for adding another widget.
- `src/native/CalorieWidgetBridge.ts` is the JS bridge for Android widget snapshot writes and Glance reloads.
- Widget snapshot shape is owned by `useWidgetSync.ts`; keep it aligned with Swift views and Kotlin composables.
- `app.config.ts` controls bundle identifiers, Apple team IDs, iOS app group, Android permissions, navigation bar contrast, widget plugins, and production-only network security config.
- `APP_VARIANT` selects dev vs production behavior; dev builds request extra Android Health Connect write permissions for local testing/seeding.
- After editing `targets/`, native config plugins, app groups, permissions, or native bridge shape, run `npx expo prebuild -c`.

## Shared Workspace Contracts

- `@workspace/shared` lives at `../shared/` and is source-first in this workspace.
- Prefer shared schemas and constants for API request/response contracts, exercise/workout types, precision constants, calorie constants, and timezone utilities.
- Keep `YYYY-MM-DD` values as calendar-day strings until a database or external API boundary requires UTC instants.
- For day-string logic, prefer shared timezone helpers such as `isDayString`, `addDays`, `compareDays`, `localDateToDay`, `todayInZone`, `instantToDay`, `dayToUtcRange`, and `dayRangeToUtcRange`.
- Mobile API contract changes usually require matching server and often web checks. Food photo, shared schemas, nutrition, meal copy, and auth changes are common cross-package surfaces.

## Server API Orientation

All endpoints require auth headers, and proxy headers are injected before auth headers when configured. Key mobile clients:

- `healthDataApi.ts` - `POST /api/health-data`, identity checks, chunking, timeout, retry, session-expiry handling.
- `dailySummaryApi.ts`, `goalsApi.ts`, `measurementsApi.ts`, `preferencesApi.ts` - daily summary, goals, check-ins, water, timezone bootstrap, nutrient display preferences.
- `foodEntriesApi.ts`, `foodEntryMealsApi.ts`, `foodsApi.ts`, `mealsApi.ts`, `mealTypesApi.ts` - diary food entries, grouped logged meals, saved foods/variants/barcodes, saved meals, meal types.
- `externalFoodSearchApi.ts`, `aiSettingsApi.ts`, `aiConversionApi.ts` - provider-agnostic food search/details/barcode, label/photo estimate, AI availability, unit conversion.
- `exerciseApi.ts`, `externalExerciseSearchApi.ts`, `workoutPresetsApi.ts` - exercise history, suggested/search/import flows, preset/individual exercise sessions, workout presets.
- `fastingApi.ts` - `POST /api/fasting/start`, `POST /api/fasting/end`, and current/stats/history reads.
- `authService.ts`, `profileApi.ts`, `externalProvidersApi.ts`, `customNutrientsApi.ts` - auth/session/MFA, profile, configured providers, custom nutrient definitions.

When reviewing an API issue, trace screen/hook -> API client -> server route -> service/repository -> shared schema before judging the fix.

## Testing Guidance

- Tests live in `__tests__/` with `jest-expo`, `jsdom`, and `jest.setup.js`.
- Run related tests for the touched surface, then lint/typecheck for cross-cutting changes.
- Run the full single-run suite after broad refactors, shared mock changes, navigation rewiring, root provider changes, import-path moves, native config changes, public type changes, or global mock edits.
- Be careful with global mocks in `jest.setup.js`; mock pollution can fail unrelated files.
- On macOS, Jest resolves `.ios.ts` by default. Android-specific service tests should require the Android file explicitly:

```ts
const androidService = require('../../src/services/healthConnectService.ts');
```

- Health sync changes: rerun `useSyncHealthData`, `backgroundSyncService`, `healthDataApi`, `healthConnectService`, `healthConnectService.ios`, and relevant `services/healthconnect` / `services/healthkit` tests.
- Health writeback changes: rerun `healthconnect/writeback`, `healthkit/writeback`, writeback mapper tests, `HealthDataWriteback`, `backgroundSyncService`, notifications where relevant, and sync tests.
- Food library/form/unit/barcode changes: rerun `FoodForm`, `FoodUnitSelectorSheet`, `LibraryScreen`, `FoodDetailScreen`, `FoodFormScreen`, `EditBarcodeScreen`, `useFoodsLibrary`, `useFoodVariants`, `useDeleteFood`, `foodsApi`, `foodDetails`, and unit conversion tests.
- Meal template/logged-meal changes: rerun meals library/detail/add/edit screens, `MealTypeDetailScreen`, copy meal tests, food search/entry picker tests, meal hooks/API tests, and meal builder/nutrition utils.
- Exercise/workout/preset changes: rerun exercise/preset library/detail/form/search/mutation tests, workout/activity form and draft tests, active workout store tests, rest-period tests, and `workoutSession` tests.
- Fasting changes: rerun `FastingCard`, `FastingGoalReconciler`, `FastingDetailScreen`, `useFasting`, `useFastingTimer`, `fastingApi`, notification tests, and fasting utility/constant tests.
- Diary quick-adjust/delete changes: rerun swipe row, serving adjustment, food entry update/delete, meal-type detail, and exercise mutation tests.
- Food scan/photo changes: rerun food scan, food photo flow screens, AI settings/external food APIs, food photo intro, food photo utils, and haptics tests.
- Settings/auth/networking changes: rerun onboarding, server settings, server config modal, auth hooks/services, storage, API client, raw fetch client tests, and proxy-header tests.
- Widgets/HUD/tab/add-sheet changes: rerun `useWidgetSync`, active workout store, `AddSheet`, `CustomTabBar`, `ActiveWorkoutBar`, and error-boundary tests.

## Quick Routing

- Health sync bug: start at `healthConnectService.ts` or `.ios.ts`, then `services/healthconnect/` or `services/healthkit/`, `backgroundSyncService.ts`, `autoSyncCoordinator.ts`, `useSyncHealthData.ts`, `SyncScreen.tsx`, and `healthDataApi.ts`.
- Health writeback bug: inspect `HealthDataWriteback`, `services/writeback.ts` / `.ios.ts`, platform writeback modules, mapper files, tracking storage, app permissions, and inbound source filters.
- Food library/edit bug: inspect `LibraryScreen`, food library/detail/form/barcode screens, `FoodForm`, unit selector, food hooks, `foodsApi`, food unit types, and `foodDetails.ts`.
- Meal bug: inspect meals library/detail/add/edit screens, `MealTypeDetailScreen`, food picker routes, meal hooks/API, selection service, logged-meal API, and meal nutrition utils.
- Exercise/preset bug: inspect library/detail/form/search screens, related hooks/API, selected-exercise handoff, rest-period controls, and workout session helpers.
- Workout/activity/HUD bug: inspect `AddSheet`, workout/activity screens, workout form hooks, `workoutDraftService`, `activeWorkoutStore`, `ActiveWorkoutBar`, rest notifications, and detail screen set interactions.
- Fasting bug: inspect `FastingDetailScreen`, `FastingCard`, `FastingGoalReconciler`, `useFasting`, `useFastingTimer`, `fastingApi`, `notifications`, and card visibility preferences.
- Measurements/hydration bug: inspect dashboard/diary/measurements screens, summaries/gauges, measurement/water/check-in hooks, API, date helpers, widget sync, writeback, and unit conversions.
- Scan/photo bug: inspect food scan/search, `FoodPhotoFlow`, photo screens, AI setting hook/API, estimate hook/API, intro persistence, haptics, icon usage, and route params.
- Widget/deep-link bug: inspect `useWidgetSync`, `CalorieWidgetBridge`, widget targets, widget plugins, `app.config.ts`, `app.identifiers.js`, `App.tsx`, and dashboard.
- Settings/diagnostics bug: inspect settings screens, `SettingsRow`, haptics/theme/sounds/notification services, diagnostics services, `DevTools`, and screen error boundaries.

## Priority Rule

- For work inside `SparkyFitnessMobile/`, this file is the package guide.
- If a task also changes another package, combine this with that package guide instead of stretching this file to cover the whole monorepo.
