# AGENTS.md

*Last updated: 2026-05-26*

SparkyFitness Mobile is a React Native 0.81.5 + Expo SDK 54 app for syncing HealthKit / Health Connect data to the SparkyFitness backend, tracking nutrition, hydration, measurements, exercise, saved foods, meal templates, custom exercises, workout presets, iOS / Android widgets, and the active workout HUD.

This is the package guide for `SparkyFitnessMobile/`. Work from this directory for mobile implementation and validation. If a task crosses into the backend, frontend, or `shared/`, read that package's guide before editing outside mobile.

## Stack And Imports

- TypeScript is strict. Keep changes type-safe and compile cleanly.
- Primary stack: React 19, React Native 0.81.5, Expo SDK 54, React Navigation 7, TanStack Query 5, Uniwind / TailwindCSS v4, Reanimated 4, Skia, Victory Native, Expo Background Task / Task Manager / Notifications, Zustand.
- `@/*` maps to this package and `@workspace/shared` maps to `../shared/src/index.ts`.
- The app talks to the backend under `/api`; health uploads go to `POST /api/health-data`.
- For shared contracts, prefer existing `@workspace/shared` schemas/constants/types over local duplicates.

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
pnpm exec jest --watchman=false --runInBand --coverage
npx expo prebuild -c
```

- `pnpm run validate` runs typecheck and lint.
- Use the Watchman-disabled Jest forms above in agent/sandbox runs; bare Jest often fails on macOS.
- Run `npx expo prebuild -c` after native dependency changes, permissions, app group or widget target changes, Expo plugin changes, native config edits, or patching native modules.

## App Shell And Navigation

- `App.tsx` is the root composition point. It layers `QueryClientProvider`, `KeyboardProvider`, `GestureHandlerRootView`, `BottomSheetModalProvider`, `NavigationContainer`, `SafeAreaProvider`, global sheets/modals, `ActiveWorkoutBar`, and toasts.
- Startup initializes theme/haptics, notifications, logs, timezone bootstrap, background sync, pending cache refreshes, and iOS HealthKit observers.
- Initial route comes from `getActiveServerConfig()`: no active config lands on `Onboarding`; otherwise users enter `Tabs`.
- Deep links are gated until `Tabs` so widget links do not bypass first-run onboarding.
- Navigation source of truth is `App.tsx` plus `src/types/navigation.ts`; update both and the linking config when routes change.
- Tabs are `Dashboard`, `Diary`, `Add`, `Library`, and `Settings`. `Add` is a center action in `CustomTabBar`, not a content screen.
- Current stack screens include onboarding/tabs, library/detail/form flows for foods/meals/exercises/presets, `EditBarcode`, food search/entry/scan/photo flow, workout/activity add/detail, settings subscreens, logs, sync, measurements, and `WhatsNew`.
- `AddSheet` offers Food, Exercise, Measurements, Scan Food, and Sync Health Data. Keep its present/dismiss refs intact to avoid Android re-present loops.
- `ActiveWorkoutBar` is mounted outside normal screen trees, uses the root navigation ref, and hides itself on modal/editor routes such as food search/forms/scan/photo, exercise search, workout/activity add, measurements, and barcode edit.

## Key Feature Surfaces

- `LibraryScreen` is the hub for saved Foods, Meals, Exercises, and Workout Presets. Full lists live in `FoodsLibraryScreen`, `MealsLibraryScreen`, `ExercisesLibraryScreen`, and `WorkoutPresetsLibraryScreen`.
- Food detail/edit flow: `FoodDetailScreen`, `FoodFormScreen`, `FoodForm`, `FoodUnitSelectorSheet`, `useFoodVariants`, `useFoodsLibrary`, `useDeleteFood`, `foodsApi`, and `utils/foodDetails.ts`.
- `FoodForm` supports equivalent serving sizes grouped by nutrient signature, auto-scale nutrition, compatible unit conversion via `convertServingSizeOnUnitChange`, and caller-provided `headerChildren`.
- `EditBarcodeScreen` lets users add or remove extra barcodes for a saved food. Keep `FoodDetailScreen`, `EditBarcodeScreen`, `foodsApi`, and the `EditBarcode` route params aligned.
- Meal templates use `MealAddScreen`, `MealDetailScreen`, `FoodSearch` / `FoodEntryAdd` with `pickerMode: 'meal-builder'`, and `services/mealBuilderSelection.ts` for pending ingredient handoff.
- Exercise and workout preset flows use `ExerciseSearch`, `PresetSearch`, detail/form screens, paginated/search hooks, mutation hooks, and shared workout payload helpers in `utils/workoutSession.ts`.
- Workout/activity drafts are persisted by `workoutDraftService`; `useWorkoutForm`, `useActivityForm`, and `useDraftPersistence` own the form state.
- Rest timer state lives in `stores/activeWorkoutStore.ts`; notifications are scheduled through `services/notifications.ts`.
- `DashboardScreen` and `DiaryScreen` share date navigation patterns. `DashboardScreen` drives hydration quick-add and widget sync; `DiaryScreen` owns meal type sections, measurement summaries, serving quick-adjust, and swipe/long-press deletes.
- `SettingsScreen` is a hub for server, sync, calorie, food, app, logs, about, diagnostics/privacy, and `WhatsNew`. Dedicated screens own the detailed settings.
- `WhatsNewBanner` is version-gated above tab content and navigates to `WhatsNewScreen`; dev reset wiring lives in `DevTools` and `services/whatsNewBanner.ts`.

## Source Map

- `components/` - reusable UI, charts, settings rows, custom tab bar, add sheet, workout HUD, form chrome, library rows, diary rows, serving sheets, food/workout editors, and `ui/` primitives.
- `components/auth/` - MFA UI used by onboarding/setup/reauth.
- `screens/` - top-level screens and route destinations.
- `hooks/` - TanStack Query hooks, auth/connection hooks, library/search/mutation hooks, measurement/water/check-in hooks, workout form hooks, widget sync, query client, query keys, and cache helpers.
- `services/api/` - backend clients. `apiClient.ts` handles normal API auth/proxy headers; `healthDataApi.ts`, `aiSettingsApi.ts`, and food-photo estimate use raw `fetch` and must keep auth/proxy/session-expiry behavior aligned.
- `services/healthconnect/` - Android Health Connect reads, native aggregation, transformation, enrichment, and preferences.
- `services/healthkit/` - iOS HealthKit reads, statistics aggregation, transformation, background delivery, and preferences.
- `services/shared/` - shared health helpers such as preference factories and permission migration.
- `services/` - background sync, auto-sync coordination, diagnostics, logging, storage, theme, haptics, notifications, food photo intro, meal selection, and workout drafts.
- `native/`, `plugins/`, `targets/widget/`, `targets/android-widget/` - widget/native bridge and Expo plugin sources. Treat generated `android/` and `ios/` as build output when possible.

## React Query And State

- Query setup lives in `src/hooks/queryClient.ts`; keys live in `src/hooks/queryKeys.ts`.
- Default `staleTime` is `Infinity`, so mutations must explicitly invalidate or update affected caches.
- `useFoodsLibrary` is an intentional exception with an infinite query, finite stale window, and `resetQueries(...)` refreshes so focus/pull refresh reloads page 1 instead of every cached page.
- Meal mutations invalidate meals, recent meals, search, and details; food entry creation can affect recent meals.
- Exercise/workout preset list/search/detail invalidation belongs in their mutation hooks.
- `useUpsertCheckIn` updates `measurementsQueryKey(entryDate)` and calls `refreshHealthSyncCache(queryClient)`.
- `useWaterIntakeMutation` fetches `waterContainersQueryKey`, persists the selected container, and optimistically updates `dailySummaryQueryKey(date)`.
- Active-server switches clear React Query state before refetching connection state.
- Error-boundary retry flows call `queryClient.resetQueries()`.

## Health Sync

- `src/services/healthConnectService.ts` is Android orchestration; `src/services/healthConnectService.ios.ts` is iOS orchestration. They are substantial platform implementations, not thin wrappers.
- Bootstrap timezone state before sync. `ensureTimezoneBootstrapped(...)` runs at startup and `healthDataApi.ts` enforces it before upload.
- Preserve `record_timezone` and `record_utc_offset_minutes` when available.
- Manual sync, sync-on-open, foreground-return sync, background sync, and iOS observer-triggered sync share coordination logic. Preserve claim/in-flight guards.
- Health uploads are chunked. `SleepSession`, `ExerciseSession`, and `Workout` records are grouped by source to match server delete-then-insert behavior.
- Sync result objects include `syncErrors`; callers should surface partial failures and avoid advancing `lastSyncedTime` when any metric read failed.
- `backgroundSyncService.ts` uses overlap windows for sessions and day-aligned windows for cumulative metrics. Do not collapse those into one naive window.
- On iOS, cumulative metrics should use HealthKit statistics queries, not raw sample summation.
- On Android, cumulative metrics (`Steps`, `Distance`, `ActiveCaloriesBurned`, `TotalCaloriesBurned`, `FloorsClimbed`) use Health Connect `aggregateGroupByPeriod` once per range. Native source-priority dedup should match Health Connect UI; do not reintroduce JS `Math.max` or source allowlist dedup.
- Android read helpers return `{ records, error }` via `readHealthRecordsDetailed` and `aggregateCumulativeMetricByDayDetailed`; legacy wrappers unwrap only records.
- Android exercise sessions are enriched with `aggregateRecord` for active/total calories and distance over the session window, scoped to `dataOrigin` and filtered for plausibility.
- `app.config.ts` grants `android.permission.health.READ_HEALTH_DATA_HISTORY` so Android can read data older than 30 days.
- Health Connect permission migrations belong in `services/shared/healthPermissionMigration.ts`, not UI-only state.
- Core check-in measurements use `measurementsApi.ts` and `MeasurementsAddScreen`; preserve `upsertCheckIn` omitted-vs-null semantics.

## Native Patch

- `react-native-health-connect` is declared as `^3.5.3` in the mobile package; the installed `3.5.3` build is patched from the repo root with `pnpm.patchedDependencies`.
- Patch file: `../patches/react-native-health-connect@3.5.3.patch`.
- The patch changes Android `getAggregateGroupByPeriodRequest` implementations from instant-based `getTimeRangeFilter` to local-date-time `getTimeRangeFilterLocal` for non-Steps record types. This protects per-day grouping around DST and local-day boundaries.
- After changing the patch or upgrading `react-native-health-connect`, run `pnpm install` from the repo root and then `npx expo prebuild -c` from mobile before Android validation.

## Food Search, Units, And Photo Estimates

- Food search spans local foods, online providers, meals, barcode scan, label scan, and AI photo estimates. Keep `FoodSearchScreen`, `FoodScanScreen`, `FoodEntryAddScreen`, `FoodFormScreen`, and route params aligned.
- Photo mode is hidden in meal-builder mode because photo estimates log to the diary.
- `FoodPhotoFlow` is a modal native stack and wraps itself in a local `KeyboardProvider`.
- Photo availability fetches `GET /api/chat/ai-service-settings/active` through `aiSettingsApi.ts`; food photo is attempt-all (any configured AI provider works), so `isFoodPhotoAvailable` gates only on a provider being configured.
- Estimation posts to `POST /api/foods/estimate-food-photo` through `estimateFoodPhoto(...)` in `externalFoodSearchApi.ts` and uses typed `FoodPhotoEstimateError` codes from `@workspace/shared`.
- Food-photo request/response changes cross package boundaries: update shared schema and server route/service with mobile.
- Keep `auto_scale_online_imports` separate from Open Food Facts-specific scaling preferences in `FoodSettingsScreen`.

## Auth, Networking, And Settings

- Server configs support `apiKey` and `session` auth. URLs/IDs are in AsyncStorage; API keys, session tokens, and proxy headers are in SecureStore.
- `OnboardingScreen` handles first-run setup, session sign-in, API keys, MFA, theme, external food source defaults, and finish-without-connection.
- `ServerSettingsScreen` handles server list management, active server switching, connection tests, web dashboard launch, and `ServerConfigModal`.
- `useAuth`, `ReauthModal`, `ServerConfigModal`, and `authService.ts` coordinate auth recovery and session expiry.
- Production rejects HTTP server URLs. Preserve HTTPS guards in onboarding, settings, raw fetch paths, and health sync.
- Proxy headers must be injected before auth headers in `apiClient.ts` and raw fetch clients.

## Styling And UI

- Styling uses Uniwind with TailwindCSS v4 tokens in `global.css`.
- Many visual components read CSS variables with `useCSSVariable`.
- `Icon.tsx` maps semantic names to SF Symbols on iOS and Ionicons on Android; verify identifiers before adding icons.
- Use shared primitives like `FormInput`, `Button`, `SettingsRow`, `SettingsRowGroup`, `BottomSheetPicker`, and `CalendarSheet` where they fit.
- `BottomSheetPicker` and `CalendarSheet` use `FullWindowOverlay` on iOS so sheets appear over native modals without nested provider inset bugs.
- Most screens are wrapped with `withErrorBoundary(...)`; `SettingsScreen` also uses `SectionErrorBoundary` so recovery paths stay reachable.

## Widgets And Native Config

- iOS widgets live under `targets/widget/`, share data through the app group from `app.identifiers.js`, and reload through `ExtensionStorage` in `useWidgetSync`.
- Android widgets live under `targets/android-widget/`; `plugins/withCalorieWidget.ts` copies Kotlin/templates/resources and wires receivers/native modules at prebuild.
- `src/native/CalorieWidgetBridge.ts` is the JS bridge for Android widget reloads.
- Widget snapshot shape is owned by `useWidgetSync.ts`; keep it aligned with Swift views and Kotlin composables.
- `app.config.ts` controls bundle identifiers, Apple team IDs, iOS app group, Android permissions, navigation bar contrast, widget plugins, and production-only network security config.
- `APP_VARIANT` selects dev vs production behavior; dev builds request extra Android Health Connect write permissions for local testing/seeding.

## Testing Guidance

- Tests live in `__tests__/` with `jest-expo`, `jsdom`, and `jest.setup.js`.
- Run related tests for the touched surface, then lint/typecheck for cross-cutting changes.
- Run the full single-run suite after broad refactors, shared mock changes, navigation rewiring, root provider changes, import-path moves, native config changes, or public type changes.
- Be careful with global mocks in `jest.setup.js`; mock pollution can fail unrelated files.
- On macOS, Jest resolves `.ios.ts` by default. Android-specific service tests should require the Android file explicitly:

```ts
const androidService = require('../../src/services/healthConnectService.ts');
```

- Health sync changes: rerun `useSyncHealthData`, `backgroundSyncService`, `healthDataApi`, `healthConnectService`, `healthConnectService.ios`, and relevant `services/healthconnect` / `services/healthkit` tests.
- Food library/form/unit/barcode changes: rerun `FoodForm`, `FoodUnitSelectorSheet`, `LibraryScreen`, `FoodDetailScreen`, `FoodFormScreen`, `EditBarcodeScreen`, `useFoodsLibrary`, `useFoodVariants`, `useDeleteFood`, `foodsApi`, `foodDetails`, and unit conversion tests.
- Meal template/logged-meal changes: rerun meals library/detail/add/edit screens, food search/entry picker tests, meal hooks/API tests, and meal builder/nutrition utils.
- Exercise/workout/preset changes: rerun exercise/preset library/detail/form/search/mutation tests, workout form/draft tests, and `workoutSession` tests.
- Diary quick-adjust/delete changes: rerun swipe row, serving adjustment, food entry update/delete, and exercise mutation tests.
- Food scan/photo changes: rerun food scan, food photo flow screens, AI settings/external food APIs, food photo intro, food photo utils, and haptics tests.
- Settings/auth/networking changes: rerun onboarding, server settings, server config modal, auth hooks/services, storage, API client, and raw fetch client tests.
- Widgets/HUD/tab/add-sheet changes: rerun `useWidgetSync`, active workout store, `AddSheet`, `CustomTabBar`, and error boundary tests.

## Quick Routing

- Health sync bug: start at `healthConnectService.ts` or `.ios.ts`, then `services/healthconnect/` or `services/healthkit/`, `backgroundSyncService.ts`, `autoSyncCoordinator.ts`, `useSyncHealthData.ts`, `SyncScreen.tsx`, and `healthDataApi.ts`.
- Food library/edit bug: inspect `LibraryScreen`, food library/detail/form/barcode screens, `FoodForm`, unit selector, food hooks, `foodsApi`, food unit types, and `foodDetails.ts`.
- Meal bug: inspect meals library/detail/add/edit screens, food picker routes, meal hooks/API, selection service, and meal utils.
- Exercise/preset bug: inspect library/detail/form/search screens, related hooks/API, selected-exercise handoff, and workout session helpers.
- Workout/activity/HUD bug: inspect `AddSheet`, workout/activity screens, workout form hooks, `workoutDraftService`, `activeWorkoutStore`, `ActiveWorkoutBar`, and notifications.
- Measurements/hydration bug: inspect dashboard/diary/measurements screens, summaries/gauges, measurement/water/check-in hooks, API, date helpers, and unit conversions.
- Scan/photo bug: inspect food scan/search, `FoodPhotoFlow`, photo screens, AI setting hook/API, estimate hook/API, intro persistence, haptics, icon usage, and route params.
- Widget/deep-link bug: inspect `useWidgetSync`, `CalorieWidgetBridge`, widget targets, widget plugins, `app.config.ts`, `app.identifiers.js`, `App.tsx`, and dashboard.
- Settings/diagnostics bug: inspect settings screens, `SettingsRow`, haptics/theme services, diagnostics services, `DevTools`, and screen error boundaries.

## Priority Rule

- For work inside `SparkyFitnessMobile/`, this file is the package guide.
- If a task also changes another package, combine this with that package's guide instead of stretching this file to cover the whole monorepo.
