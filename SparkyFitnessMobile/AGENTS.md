# AGENTS.md

*Last updated: 2026-05-20*

SparkyFitness Mobile is a React Native 0.81.5 + Expo SDK 54 app for syncing HealthKit / Health Connect data to the SparkyFitness backend, tracking daily nutrition, hydration, measurements, and exercise, managing saved foods, meal templates, custom exercises, and workout presets, and powering iOS / Android widgets plus the in-app active workout HUD.

This file is the package guide for `SparkyFitnessMobile/`. Use it for work in this directory. This app lives in a monorepo, so if a task crosses into the backend, frontend, or `shared/`, read the matching guide there before editing outside this package.

## Project Overview

This package uses TypeScript with `strict` mode enabled. Keep changes type-safe and compile cleanly before calling them complete.

Primary stack:
- React 19 + React Native 0.81.5
- Expo SDK 54
- React Navigation 7
- TanStack Query 5
- Uniwind + TailwindCSS v4
- Reanimated 4
- Skia + Victory Native
- Expo Background Task / Task Manager / Notifications
- Zustand for active workout state

Work from `SparkyFitnessMobile/` for implementation and validation. Do not treat the monorepo root as the mobile app entrypoint.

`tsconfig.json` currently defines:
- `@/*` for local package imports
- `@workspace/shared` for `../shared/src/index.ts`
- `allowImportingTsExtensions: true`

The app talks to the SparkyFitness backend primarily under `/api` and sends health sync payloads to `POST /api/health-data`.

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
pnpm exec jest --watchman=false --runInBand --ci --coverage --maxWorkers=2
npx expo prebuild -c
```

- Use `pnpm run test:run -- --watchman=false --runInBand` for an agent-safe full Jest run.
- Do not use bare `pnpm test` or bare `jest` in sandboxed agent runs; Watchman regularly fails.
- If you need coverage or CI-style output in an agent run, prefer the `pnpm exec jest ...` forms above over the plain package scripts.
- `pnpm run validate` currently runs `typecheck` and `lint`.
- Run `npx expo prebuild -c` after native dependency changes, permission changes, app group changes, widget target changes, Expo plugin changes, or native config changes.

## Architecture

### App Shell

- `App.tsx` is the root composition point.
- Root providers are layered as `QueryClientProvider` -> `KeyboardProvider` -> `GestureHandlerRootView` -> `BottomSheetModalProvider` -> `NavigationContainer` -> `SafeAreaProvider`.
- `App.tsx` also mounts the global `AddSheet`, `ReauthModal`, `ServerConfigModal`, floating `ActiveWorkoutBar`, and safe-area-aware toast host.
- `App.tsx` bridges safe-area insets into Uniwind, drives React Navigation colors from CSS variables, and keeps the Android navigation bar style aligned with the current theme.
- App startup initializes theme state, haptic preferences, notifications, log service, timezone bootstrap, background sync, pending cache refresh flushes, and iOS HealthKit observers from the root.
- Initial routing is decided at startup with `getActiveServerConfig()`: users without an active server config land on `Onboarding`, otherwise they enter `Tabs`.
- Deep linking is intentionally gated until the user reaches `Tabs`, so widget links are ignored during first-run onboarding but work afterward.

### Navigation

- The navigation source of truth is `App.tsx` plus `src/types/navigation.ts`.
- Root navigation is a single native stack containing:
  - `Onboarding`
  - `Tabs`
  - `FoodsLibrary`
  - `MealsLibrary`
  - `ExercisesLibrary`
  - `WorkoutPresetsLibrary`
  - `FoodDetail`
  - `MealDetail`
  - `ExerciseDetail`
  - `WorkoutPresetDetail`
  - `FoodSearch`
  - `FoodEntryAdd`
  - `FoodForm`
  - `ExerciseForm`
  - `WorkoutPresetForm`
  - `FoodScan`
  - `FoodPhotoIntro`
  - `FoodPhotoFlow`
  - `MealAdd`
  - `FoodEntryView`
  - `EditLoggedMeal`
  - `MealTypeDetail`
  - `ExerciseSearch`
  - `PresetSearch`
  - `WorkoutAdd`
  - `ActivityAdd`
  - `WorkoutDetail`
  - `ActivityDetail`
  - `Logs`
  - `Sync`
  - `MeasurementsAdd`
  - `CalorieSettings`
  - `FoodSettings`
  - `ServerSettings`
  - `AppSettings`
  - `About`
- Tabs are `Dashboard`, `Diary`, `Add`, `Library`, and `Settings`.
- `CustomTabBar` in `src/components/CustomTabBar.tsx` owns the tab UI. `Add` is a center action button, not a real content screen.
- Tapping `Add` opens `src/components/AddSheet.tsx`, whose main grid offers Food, Exercise, Measurements, and Scan Food, plus a secondary Sync Health Data action. The Exercise tile drills into Workout, Activity, and Preset flows.
- `AddSheet` keeps present / dismiss state in refs to avoid Android re-present loops after dismissal. Preserve that guard behavior when changing bottom-sheet entry points.
- `Library` is the aggregate library dashboard. `src/screens/LibraryScreen.tsx` shows create tiles for Food, Meal, Exercise, and Preset; count rows for Foods, Meals, Exercises, and Workout presets; and a recent preview mixing recently used foods, recently logged meals, and suggested / recent exercises.
- `src/screens/FoodsLibraryScreen.tsx`, `MealsLibraryScreen.tsx`, `ExercisesLibraryScreen.tsx`, and `WorkoutPresetsLibraryScreen.tsx` are the full searchable library lists. Foods, exercises, and workout presets use paginated library hooks; meals use the meal search/list hooks.
- `src/screens/FoodDetailScreen.tsx` handles serving-variant selection plus owner-only edit/delete for local foods. `src/screens/FoodFormScreen.tsx` supports `create-food`, `edit-food`, and `adjust-entry-nutrition` flows, including library, meal-builder, online-import, label-scan, and food-photo handoffs.
- `src/screens/FoodScanScreen.tsx` has Barcode, Label, and Photo modes. Photo mode is hidden in meal-builder mode because photo estimates always log to the diary.
- Food photo estimation routes through `FoodPhotoIntro` and the nested `src/navigation/FoodPhotoFlow.tsx` modal stack: `FoodPhotoImproveScreen` -> `FoodPhotoEstimateReviewScreen` -> `FoodPhotoLogEntryScreen`.
- `src/screens/MealAddScreen.tsx` handles create/edit meal templates. Meal building routes through `FoodSearch` / `FoodEntryAdd` with `pickerMode: 'meal-builder'` and returns selected ingredients through the meal-builder selection service.
- `src/screens/MealDetailScreen.tsx` shows per-serving vs total nutrition, logs a meal through `FoodEntryAdd`, and exposes owner-only edit/delete actions. Logged meals with `food_entry_meal_id` open `EditLoggedMealScreen` for date, meal type, servings, and delete changes.
- `src/screens/ExerciseFormScreen.tsx` creates/edits custom exercises, including advanced equipment, muscle, instruction, level, force, and mechanic fields. `ExerciseDetailScreen` shows exercise metadata/images and owner-only edit/delete actions.
- `src/screens/WorkoutPresetFormScreen.tsx` creates/edits workout presets using the shared editable exercise/set components. `WorkoutPresetDetailScreen` displays preset sets/rest times, can start a workout, and exposes owner-only edit/delete actions.
- Workout creation still starts from the Add sheet and stack routes. There is no dedicated workouts tab in the current navigation tree.
- The tab bar embeds `ActiveWorkoutBar` above itself. Stack screens use the floating variant instead.
- `DashboardScreen` and `DiaryScreen` use `DateNavigator` plus `CalendarSheet` for day selection. `DashboardScreen` also drives hydration quick-add through `useWaterIntakeMutation` and `HydrationGauge`. `DiaryScreen` uses fling gestures for date navigation, shows `MeasurementsSummary`, and mounts `ServingAdjustSheet` for quick food-entry serving adjustments.
- Food and exercise diary rows support swipe-to-delete plus long-press delete menus. Food rows can also open `ServingAdjustSheet` when serving data is available.
- Current deep links use the `sparkyfitnessmobile://` prefix and route `scan` -> `FoodScan` and `search` -> `FoodSearch`.
- `SettingsScreen` is now a hub rather than the full settings editor. It links to `ServerSettings`, `Sync`, `CalorieSettings`, `FoodSettings`, `AppSettings`, `Logs`, and `About`, and owns diagnostic-report sharing plus the privacy modal entry point.
- `ServerSettingsScreen` owns server list management, active-server switching, connection testing, opening the web dashboard, and `ServerConfigModal` add/edit flows.
- `CalorieSettingsScreen` owns calorie goal adjustment mode, including adaptive TDEE, dynamic/fixed goals, percentage earn-back, device projection, BMR inclusion, activity level, and negative-adjustment preferences.
- `FoodSettingsScreen` owns default food providers, default barcode providers, Open Food Facts value scaling, and barcode fallback preferences.
- `AppSettingsScreen` owns app theme selection and the persisted haptic-feedback toggle. `AboutScreen` owns app version metadata plus project, docs, and privacy-policy links.
- There are no per-tab nested stack navigators right now. When changing routes, update `src/types/navigation.ts`, `App.tsx`, and the linking config together.

### Source Structure (`src/`)

- `components/` - reusable UI including the custom tab bar, add sheet, workout HUD, auth/config modals, `SettingsRow`, charts, settings controls, form chrome, library search/footer rows, swipeable diary rows, serving adjustment sheets, measurement summaries, and food-library / workout UI such as `CreateTile`, `FoodLibraryRow`, `MealLibraryRow`, `FoodNutritionSummary`, and `WorkoutEditableExerciseList`
- `components/auth/` - MFA-related auth UI used by onboarding, setup, and reauth flows
- `components/ui/` - shared primitives such as `Button` and the toast configuration
- `screens/` - top-level screens including onboarding, dashboard, diary, the library tab, full food/meal/exercise/preset library and detail flows, measurement entry, sync, settings, logs, food entry, meal builder, food photo estimation, and exercise flows
- `hooks/` - TanStack Query hooks, auth and connection hooks, widget sync, food / meal / exercise / workout preset library/search/mutation hooks, measurement range, water intake, check-in hooks, workout/activity/preset form hooks, food photo estimation hooks, draft persistence, and query client setup
- `services/api/` - backend-facing API clients for auth, paginated food library and variant management, meal templates, custom exercises, workout presets, workouts, daily summary, measurements, preferences, AI settings, food-photo estimation, and related lookups
- `services/healthconnect/` - Android Health Connect reading, aggregation, transformation, and preference logic
- `services/healthkit/` - iOS HealthKit reading, aggregation, transformation, background delivery, and preference logic
- `services/shared/` - platform-shared helpers used by both health stacks
- `services/` - also contains background sync, auto-sync coordination, diagnostics, theme state, haptic preferences, storage, notifications, food-photo intro persistence, health display helpers, and workout draft persistence
- `native/` - TypeScript bridge wrappers for app-native modules, currently the Android calorie/macro widget bridge
- `stores/` - Zustand state, currently including `activeWorkoutStore.ts`
- `constants/`, `types/`, `utils/` - app-wide config, contracts, and helpers
- `plugins/`, `targets/widget/`, and `targets/android-widget/` - Expo config plugins and widget source/templates for native widget targets

### Widgets, Workout HUD, and Error Boundaries

- `src/stores/activeWorkoutStore.ts` persists the active workout session, completed-set cursor, and rest timer state. It also coordinates local rest notifications.
- `src/components/ActiveWorkoutBar.tsx` is a persistent workout HUD that renders outside normal screen trees and relies on the root navigation ref.
- Many screens reserve bottom space with `useActiveWorkoutBarPadding(...)`. If you change the bar, update padding logic and verify affected screens.
- `ActiveWorkoutBar` suppresses itself by root route name for modal/editor flows including `FoodSearch`, `FoodEntryAdd`, `FoodForm`, `FoodScan`, `FoodPhotoIntro`, `FoodPhotoFlow`, `ExerciseSearch`, `WorkoutAdd`, `ActivityAdd`, and `MeasurementsAdd`.
- `DashboardScreen` pushes today's daily summary to widgets through `src/hooks/useWidgetSync.ts`.
- The iOS widget target lives under `targets/widget/` and shares data through the app group configured by `app.config.ts` and `app.identifiers.js`.
- Android calorie and macro widgets are backed by `targets/android-widget/` templates, `src/native/CalorieWidgetBridge.ts`, and the generated Kotlin files under `android/app/src/main/java/.../widget/`.
- Android widget native wiring is generated by `plugins/withGlanceAndroidSupport.ts` and `plugins/withCalorieWidget.ts`, both registered from `app.config.ts`.
- Most screens are wrapped with `withErrorBoundary(...)` from `src/components/ScreenErrorBoundary.tsx`.
- `SettingsScreen` also uses `SectionErrorBoundary` so server-config recovery remains reachable even if non-critical settings content crashes.

### Platform-Specific Code

- `src/services/healthConnectService.ts` is the Android orchestration layer.
- `src/services/healthConnectService.ios.ts` is the iOS orchestration layer.

These are not thin wrappers. Both contain substantial sync logic. For sync changes, edit the correct platform file directly instead of assuming one side re-exports the other.

- `src/services/backgroundSyncService.ts` coordinates background sync timing, session overlap windows, per-day aggregation windows, cache refresh behavior, and overlap protection across manual and OS-triggered syncs.
- `src/services/autoSyncCoordinator.ts` coordinates sync-on-open claims so cold-start, foreground-return, manual, and observer-triggered syncs do not pile on top of each other.
- `src/services/workoutDraftService.ts` persists the in-progress workout/activity draft used by the Add sheet and exercise forms.

### React Query and State

- Query setup lives in `src/hooks/queryClient.ts`.
- Query keys live in `src/hooks/queryKeys.ts`.
- The default query client uses `staleTime: Infinity`. The app relies on explicit invalidation and refetches, not background polling.
- The food library is an intentional exception: `useFoodsLibrary(...)` uses an infinite query keyed by `foodsLibraryQueryKey(searchTerm)` with a shorter stale window and `resetQueries(...)`-based refreshes so pull-to-refresh and focus refetch only page 1 instead of replaying every cached page.
- Library dashboard data combines `useFoods`, `useRecentMeals`, `useMeals`, `useSuggestedExercises`, and count queries for foods, exercises, and workout presets. Keep the dashboard preview and the full library screens in sync when changing library contracts.
- Meal mutations invalidate `meals`, `recentMeals`, meal search, and detail caches through `useMeals.ts`. Food entry creation also touches recent-meal state when logging a meal.
- Exercise and workout-preset library screens use paginated/search hooks (`useExercisesLibrary`, `useWorkoutPresetsLibrary`, `useExerciseSearch`, `useWorkoutPresetSearch`) with cache invalidation in the related mutation hooks.
- `useUpsertCheckIn` updates `measurementsQueryKey(entryDate)` directly and calls `refreshHealthSyncCache(queryClient)` so health-sync-dependent summary caches stay current after manual measurement edits.
- `useWaterIntakeMutation` fetches `waterContainersQueryKey`, stores the selected container in AsyncStorage, and optimistically updates `dailySummaryQueryKey(date)` by the active container serving volume.
- `useActiveAiServiceSetting` uses `activeAiServiceSettingQueryKey` with a finite stale window so the food-photo gate can refresh when AI provider config changes server-side.
- Settings changes that swap the active server clear query state before refetching. Preserve that behavior when adjusting auth or multi-server flows.
- Error-boundary retry flows call `queryClient.resetQueries()`. Keep that in mind when changing screen-level recovery behavior.

### Food Search, Units, and Photo Estimates

- Food search spans local foods, online providers, meal templates, barcode scan, label scan, and AI photo estimates. Keep `FoodSearchScreen`, `FoodScanScreen`, `FoodEntryAddScreen`, `FoodFormScreen`, and `src/types/navigation.ts` aligned when changing handoffs.
- `FoodForm` owns auto-scale nutrition behavior, optional serving-unit selection through `FoodUnitSelectorSheet`, and the `convertServingSizeOnUnitChange` opt-in used by estimate review. Compatible swaps such as `g` <-> `oz` convert the serving size; incompatible swaps preserve the entered number and require manual nutrition review.
- Food settings in `FoodSettingsScreen` own default online/barcode providers, Open Food Facts serving-value scaling (`auto_scale_open_food_facts_imports`), and Open Food Facts barcode fallback.
- `FoodFormScreen` uses `auto_scale_online_imports` to decide whether imported or adjusted food values should expose auto-scale nutrition defaults. Keep this separate from the Open Food Facts scaling preference.
- The photo estimate provider gate fetches `GET /api/chat/ai-service-settings/active` through `src/services/api/aiSettingsApi.ts`; `isFoodPhotoAvailable(...)` is driven by `FOOD_PHOTO_PROVIDER_LABELS` in `src/utils/foodPhotoEstimate.ts`.
- `FoodPhotoFlow` is a nested native stack presented from the root stack and wraps itself in a local `KeyboardProvider`; keep that wrapper if the improve/review/log-entry screens continue to use keyboard-controller components inside the modal.
- Food photo estimation posts to `POST /api/foods/estimate-food-photo` through `estimateFoodPhoto(...)` in `src/services/api/externalFoodSearchApi.ts`, using proxy/auth headers and typed `FoodPhotoEstimateError` codes from `@workspace/shared`.
- Food photo contracts cross package boundaries: update `shared/src/schemas/api/FoodPhotoEstimate.api.zod.ts` and the server estimate route/service when mobile request or response shapes change.

### Styling

- Styling uses Uniwind with TailwindCSS v4 tokens defined in `global.css`.
- Many visual components read CSS variables from JS via `useCSSVariable`.
- Skia is used for custom charts and gauges; Victory Native is used for chart-style visualizations.
- `src/components/Icon.tsx` is the cross-platform icon abstraction. It maps semantic icon names to SF Symbols on iOS and Ionicons on Android. Verify symbol names before adding new icons.
- Settings rows use `SettingsRow` / `SettingsRowGroup`, semantic icon names from `Icon.tsx`, and category color tokens from `global.css` such as `--color-cat-slate`, `--color-cat-pink`, `--color-cat-violet`, `--color-cat-orange`, `--color-calories`, and `--color-hydration`.

### Authentication and Networking

- The app supports two auth modes per server config: `apiKey` and `session`.
- First-run connection setup is handled by `src/screens/OnboardingScreen.tsx`, which supports URL validation, session sign-in, API keys, MFA, and a finish-without-connection path into Settings.
- Ongoing config management is handled in two places:
  - `ServerSettingsScreen`, reached from `SettingsScreen`, via `useServerConfigs`, `useServerConnection`, and `ServerConfigModal`
  - global auth recovery flows via `useAuth()`, `ReauthModal`, and the root-level `ServerConfigModal`
- Server configs live in `src/services/storage.ts`. IDs and URLs are stored in AsyncStorage; API keys, session tokens, and proxy headers are stored in SecureStore.
- `src/services/api/apiClient.ts` injects proxy headers and auth headers into standard API requests.
- `src/services/api/healthDataApi.ts` uses raw `fetch`, but still injects proxy headers and auth headers, plus its own timeout/retry/chunking logic. If auth behavior changes, verify both codepaths.
- `src/services/api/aiSettingsApi.ts` and the food-photo estimate path in `src/services/api/externalFoodSearchApi.ts` also use raw `fetch`; keep proxy headers, auth headers, session-expiry handling, and production HTTPS guards aligned with other API clients.
- In production, HTTP server URLs are rejected. Preserve the HTTPS guard in onboarding, settings, API fetches, and health sync paths.
- Active-server switches clear the React Query cache before refetching connection state. Preserve that behavior when changing `ServerSettingsScreen` or server-config storage.

## Native and Monorepo Rules

- Keep mobile changes isolated to this package unless the task truly crosses package boundaries.
- If you import from `@workspace/shared`, confirm the shared contract already exists or coordinate the change in `shared/`.
- `android/` and `ios/` are generated Expo native projects. Treat `app.config.ts`, Expo plugin configuration, target config, and dependency setup as the main source of truth when possible.
- `app.config.ts` currently controls bundle identifiers, Apple team IDs, the iOS app group, Android permissions, Android navigation bar contrast, widget plugins, and production-only plugin inclusion.
- `APP_VARIANT` selects dev vs production behavior, and `EXPO_DEV_BUNDLE_IDENTIFIER` can override the dev bundle identifier.
- Dev builds request extra Android Health Connect write permissions for local testing and seeding.
- `./plugins/withGlanceAndroidSupport` and `./plugins/withCalorieWidget` are registered for widget support. Production builds additionally include `./plugins/withNetworkSecurityConfig`.
- If you touch widget behavior, app-group storage, native widget modules, or widget target metadata, inspect `app.config.ts`, `app.identifiers.js`, `targets/widget/`, `targets/android-widget/`, `src/hooks/useWidgetSync.ts`, `src/native/CalorieWidgetBridge.ts`, and the widget config plugins together.

## Health Sync Rules

- For cumulative metrics such as steps and calories, use aggregated statistics / aggregation APIs rather than raw sample summation so results match the Health app / Health Connect totals.
- Bootstrap timezone state before sync work. `ensureTimezoneBootstrapped(...)` is part of app startup and `healthDataApi.ts` also enforces it before upload.
- Preserve timezone metadata on synced records when available. Do not strip or rename `record_timezone` or `record_utc_offset_minutes` without coordinating with the server.
- Background sync uses overlap windows for session metrics and day-level aggregation windows for cumulative metrics. Do not collapse those into a single naive query window.
- Manual sync, sync-on-open, foreground-return sync, and iOS observer-triggered sync all share coordination logic. Preserve claim / in-flight guards so one trigger path does not duplicate another.
- Health uploads are chunked, and `SleepSession`, `ExerciseSession`, and `Workout` records are grouped by source to match the server's delete-then-insert behavior. Do not split those groups across arbitrary chunks.
- Health Connect permission versioning and migration logic belongs in service/shared helpers such as `src/services/shared/healthPermissionMigration.ts`, not as ad hoc UI-only state in `SyncScreen`.
- Exercise-session transformations on both platforms emit a default `Working Set`. Keep backend payload expectations in mind when changing exercise sync.
- Core check-in measurements such as weight, height, steps, and body fat use `src/services/api/measurementsApi.ts` and `MeasurementsAddScreen`. Keep units normalized through `src/utils/unitConversions.ts` and preserve `null` vs omitted semantics in `upsertCheckIn`: omitted leaves a field unchanged, `null` clears it.
- On Android, background sync may require `BackgroundAccessPermission`. On iOS, HealthKit observers and background delivery are coordinated through the service layer. Preserve those platform differences.

## Testing

```bash
pnpm exec jest --watchman=false --runInBand <test-path>
pnpm run test:run -- --watchman=false --runInBand
pnpm run lint
pnpm run typecheck
```

Tests live in `__tests__/` and use the `jest-expo` preset, `jsdom` test environment, and `jest.setup.js`.

- Run the full single-run suite after broad refactors, shared mock changes, navigation rewiring, root provider changes, or import-path moves.
- Be careful with global mocks in `jest.setup.js` or shared test utilities. Mock pollution can show up far from the file you touched.
- On macOS, Jest resolves `.ios.ts` by default. For Android-specific tests, explicitly require the Android file:

```ts
const androidService = require('../../src/services/healthConnectService.ts');
```

- If you change workout/activity draft or form flows, rerun the related tests:
  - `__tests__/hooks/useWorkoutForm.test.ts`
  - `__tests__/hooks/useActivityForm.test.ts`
  - `__tests__/hooks/useDraftPersistence.test.ts`
  - `__tests__/services/workoutDraftService.test.ts`
  - `__tests__/services/workoutDraftService.loadActiveDraft.test.ts`
- If you change onboarding, setup, or auth recovery flows, rerun the related tests:
  - `__tests__/components/ServerConfigModal.test.tsx`
  - `__tests__/screens/ServerSettingsScreen.test.tsx`
  - `__tests__/hooks/useAuth.test.ts`
  - `__tests__/hooks/useServerConnection.test.ts`
  - `__tests__/screens/OnboardingScreen.test.tsx`
  - `__tests__/services/storage.test.ts`
  - `__tests__/services/authService.test.ts`
  - `__tests__/services/apiClient.test.ts`
- If you change health sync orchestration or payload shaping, rerun the related tests:
  - `__tests__/hooks/useSyncHealthData.test.ts`
  - `__tests__/services/backgroundSyncService.test.ts`
  - `__tests__/services/healthDataApi.test.ts`
  - `__tests__/services/healthConnectService.test.ts`
  - `__tests__/services/healthConnectService.ios.test.ts`
  - the relevant platform tests under `__tests__/services/healthconnect/` or `__tests__/services/healthkit/`
- If you change the library tab, saved-food browsing, food detail/edit flows, or food pagination utilities, rerun the related tests:
  - `__tests__/components/FoodForm.test.tsx`
  - `__tests__/components/FoodUnitSelectorSheet.test.tsx`
  - `__tests__/screens/LibraryScreen.test.tsx`
  - `__tests__/screens/FoodDetailScreen.test.tsx`
  - `__tests__/screens/FoodFormScreen.test.tsx`
  - `__tests__/hooks/useFoodsLibrary.test.ts`
  - `__tests__/hooks/useDeleteFood.test.ts`
  - `__tests__/hooks/useUnitConversion.test.ts`
  - `__tests__/services/foodsApi.test.ts`
  - `__tests__/utils/foodDetails.test.ts`
- If you change meal template creation, meal-library browsing, meal search, meal detail/edit/delete, or meal-builder picker flows, rerun the related tests:
  - `__tests__/screens/MealsLibraryScreen.test.tsx`
  - `__tests__/screens/MealDetailScreen.test.tsx`
  - `__tests__/screens/MealAddScreen.test.tsx`
  - `__tests__/screens/EditLoggedMealScreen.test.tsx`
  - `__tests__/screens/FoodSearchScreen.test.tsx`
  - `__tests__/screens/FoodEntryAddScreen.test.tsx`
  - `__tests__/hooks/useAddFoodEntryMeal.test.ts`
  - `__tests__/hooks/useMeals.test.ts`
  - `__tests__/hooks/useMealSearch.test.ts`
  - `__tests__/services/mealsApi.test.ts`
  - `__tests__/utils/mealBuilderDraft.test.ts`
  - `__tests__/utils/mealNutrition.test.ts`
- If you change custom exercise library/search/detail/form flows or exercise mutation behavior, rerun the related tests:
  - `__tests__/screens/ExercisesLibraryScreen.test.tsx`
  - `__tests__/screens/ExerciseDetailScreen.test.tsx`
  - `__tests__/screens/ExerciseFormScreen.test.tsx`
  - `__tests__/hooks/useExerciseSearch.test.ts`
  - `__tests__/hooks/useExerciseMutations.test.ts`
  - `__tests__/services/api/exerciseApi.test.ts`
  - `__tests__/services/api/externalExerciseSearchApi.test.ts`
- If you change workout preset library/search/detail/form flows, rerun the related tests:
  - `__tests__/screens/WorkoutPresetsLibraryScreen.test.tsx`
  - `__tests__/screens/WorkoutPresetDetailScreen.test.tsx`
  - `__tests__/screens/WorkoutPresetFormScreen.test.tsx`
  - `__tests__/hooks/useWorkoutPresetsLibrary.test.ts`
  - `__tests__/hooks/useWorkoutPresetSearch.test.ts`
  - `__tests__/hooks/useWorkoutPresets.test.ts`
  - `__tests__/services/api/workoutPresetsApi.test.ts`
  - `__tests__/utils/workoutSession.test.ts`
- If you change diary quick-adjust, swipe delete, or food/exercise row deletion behavior, rerun the related tests:
  - `__tests__/components/SwipeableFoodRow.test.tsx`
  - `__tests__/hooks/useDeleteFoodEntry.test.ts`
  - `__tests__/hooks/useUpdateFoodEntry.test.ts`
  - `__tests__/hooks/useCreateExerciseEntry.test.ts`
  - `__tests__/hooks/useExerciseMutations.test.ts`
- If you change barcode, nutrition-label scan, or food-photo estimate flows, rerun the related tests:
  - `__tests__/screens/FoodScanScreen.test.tsx`
  - `__tests__/screens/FoodPhotoImproveScreen.test.tsx`
  - `__tests__/screens/FoodPhotoEstimateReviewScreen.test.tsx`
  - `__tests__/screens/FoodPhotoLogEntryScreen.test.tsx`
  - `__tests__/screens/FoodSearchScreen.test.tsx`
  - `__tests__/services/aiSettingsApi.test.ts`
  - `__tests__/services/externalFoodSearchApi.test.ts`
  - `__tests__/services/foodPhotoIntro.test.ts`
  - `__tests__/utils/foodPhotoEstimate.test.ts`
  - `__tests__/services/haptics.test.ts`
- If you change app settings, theme, haptic behavior, or settings-row chrome, rerun the related tests:
  - `__tests__/services/haptics.test.ts`
  - `__tests__/services/notifications.test.ts`
  - `__tests__/stores/activeWorkoutStore.test.ts`
- If you change manual measurements, measurement summaries, hydration, or check-in API behavior, rerun the related tests:
  - `__tests__/hooks/useMeasurements.test.ts`
  - `__tests__/hooks/useMeasurementsRange.test.ts`
  - `__tests__/hooks/useWaterIntakeMutation.test.ts`
  - `__tests__/services/measurementsApi.test.ts`
  - `__tests__/utils/unitConversions.test.ts`
- If you change widgets, active workout state, or tab/add-sheet behavior, rerun the related tests:
  - `__tests__/hooks/useWidgetSync.test.ts`
  - `__tests__/stores/activeWorkoutStore.test.ts`
  - `__tests__/components/AddSheet.test.tsx`
  - `__tests__/components/CustomTabBar.test.tsx`
  - `__tests__/components/ScreenErrorBoundary.test.tsx`
- Run `pnpm run lint` and `pnpm run typecheck` when changes affect multiple files, public types, hooks, navigation contracts, app config, or native wiring.

## After Refactors

- After file moves or import refactors, run the full Jest suite immediately and verify asset and `require(...)` paths before reporting completion.
- If you change routes, modal entry points, or the add sheet, verify `src/types/navigation.ts`, `App.tsx`, deep-link config, and any route-param consumers stay aligned.
- If you change the food-photo route, verify `FoodScan`, `FoodPhotoIntro`, `FoodPhotoFlow`, `FoodSearchScreen`'s photo CTA, `ActiveWorkoutBar` hidden routes, `src/types/navigation.ts`, and the shared/server estimate contract together.
- If you change settings navigation or server/app/about settings screens, keep `SettingsScreen`, `ServerSettingsScreen`, `AppSettingsScreen`, `AboutScreen`, `SettingsRow`, `src/types/navigation.ts`, `App.tsx`, and `src/components/Icon.tsx` aligned.
- If you change saved-food or unit-selection flows, keep `LibraryScreen`, `FoodsLibraryScreen`, `FoodDetailScreen`, `FoodFormScreen`, `FoodUnitSelectorSheet`, `useUnitConversion`, `src/types/navigation.ts`, and the `updatedItem` / `returnKey` handoff aligned so edits return to the correct screen with refreshed values.
- If you change meal-template or logged-meal flows, keep `LibraryScreen`, `MealsLibraryScreen`, `MealDetailScreen`, `MealAddScreen`, `EditLoggedMealScreen`, `FoodSearchScreen`, `FoodEntryAddScreen`, meal picker modes, and the meal-builder selection handoff aligned.
- If you change custom exercise or workout preset flows, keep `LibraryScreen`, `ExercisesLibraryScreen`, `WorkoutPresetsLibraryScreen`, detail/form screens, `ExerciseSearch`, route params, mutation invalidations, and selected-exercise / preset handoffs aligned.
- If you change measurements, hydration, or diary quick edit flows, keep `DiaryScreen`, `DashboardScreen`, `HydrationGauge`, `MeasurementsSummary`, `MeasurementsAddScreen`, `useMeasurements`, `useMeasurementsRange`, `useWaterIntakeMutation`, `useUpsertCheckIn`, and unit conversion helpers aligned.
- If you change the custom tab bar, active workout HUD, or bottom sheet flows, sanity-check safe-area spacing and `useActiveWorkoutBarPadding(...)` behavior on both iOS and Android paths.
- If you change widget plumbing, verify `DashboardScreen`, `useWidgetSync.ts`, `src/native/CalorieWidgetBridge.ts`, the app group config, `targets/widget/`, `targets/android-widget/`, and widget plugins stay in sync.
- If you change permissions, target config, plugins, app group config, or native dependencies, rerun `npx expo prebuild -c`.

## Quick Routing

- Health sync bug:
  inspect `src/services/healthConnectService.ts` or `src/services/healthConnectService.ios.ts`, then `src/services/backgroundSyncService.ts`, `src/services/autoSyncCoordinator.ts`, `src/screens/SyncScreen.tsx`, and the matching platform folder under `src/services/healthconnect/` or `src/services/healthkit/`
- Onboarding, auth, or server-config bug:
  inspect `src/screens/OnboardingScreen.tsx`, `src/screens/ServerSettingsScreen.tsx`, `src/components/ServerConfigModal.tsx`, `src/components/ReauthModal.tsx`, `src/hooks/useAuth.ts`, `src/hooks/useServerConfigs.ts`, `src/hooks/useServerConnection.ts`, `src/services/api/authService.ts`, `src/services/api/apiClient.ts`, `src/services/api/healthDataApi.ts`, and `src/services/storage.ts`
- Food library, custom food, or saved-food detail bug:
  inspect `src/screens/LibraryScreen.tsx`, `src/screens/FoodsLibraryScreen.tsx`, `src/screens/FoodDetailScreen.tsx`, `src/screens/FoodFormScreen.tsx`, `src/components/FoodForm.tsx`, `src/components/FoodUnitSelectorSheet.tsx`, `src/components/FoodLibraryRow.tsx`, `src/hooks/useFoodsLibrary.ts`, `src/hooks/useDeleteFood.ts`, `src/hooks/useUnitConversion.ts`, `src/services/api/foodsApi.ts`, `src/types/foodInfo.ts`, `src/types/foodUnitVariants.ts`, and `src/utils/foodDetails.ts`
- Meal template, logged-meal, meal-library, or meal-builder bug:
  inspect `src/screens/LibraryScreen.tsx`, `src/screens/MealsLibraryScreen.tsx`, `src/screens/MealDetailScreen.tsx`, `src/screens/MealAddScreen.tsx`, `src/screens/EditLoggedMealScreen.tsx`, `src/screens/FoodSearchScreen.tsx`, `src/screens/FoodEntryAddScreen.tsx`, `src/components/MealLibraryRow.tsx`, `src/hooks/useMeals.ts`, `src/hooks/useMealSearch.ts`, `src/hooks/useFoodEntryMealDetails.ts`, `src/hooks/useUpdateFoodEntryMeal.ts`, `src/hooks/useDeleteFoodEntryMeal.ts`, `src/services/api/mealsApi.ts`, `src/types/meals.ts`, `src/types/foodEntryMeals.ts`, `src/utils/mealBuilderDraft.ts`, and `src/utils/mealNutrition.ts`
- Custom exercise library/detail/form bug:
  inspect `src/screens/LibraryScreen.tsx`, `src/screens/ExercisesLibraryScreen.tsx`, `src/screens/ExerciseDetailScreen.tsx`, `src/screens/ExerciseFormScreen.tsx`, `src/hooks/useExercisesLibrary.ts`, `src/hooks/useExerciseSearch.ts`, `src/hooks/useExerciseMutations.ts`, `src/services/api/exerciseApi.ts`, `src/types/exercise.ts`, and `src/hooks/useExerciseImageSource.ts`
- Workout preset library/detail/form bug:
  inspect `src/screens/LibraryScreen.tsx`, `src/screens/WorkoutPresetsLibraryScreen.tsx`, `src/screens/WorkoutPresetDetailScreen.tsx`, `src/screens/WorkoutPresetFormScreen.tsx`, `src/screens/PresetSearchScreen.tsx`, `src/screens/ExerciseSearchScreen.tsx`, `src/hooks/useWorkoutPresets.ts`, `src/hooks/useWorkoutPresetsLibrary.ts`, `src/hooks/useWorkoutPresetSearch.ts`, `src/hooks/useWorkoutPresetForm.ts`, `src/hooks/useWorkoutPresetMutations.ts`, `src/services/api/workoutPresetsApi.ts`, `src/types/workoutPresets.ts`, and `src/utils/workoutSession.ts`
- Workout or activity flow bug:
  inspect `src/components/AddSheet.tsx`, `src/screens/WorkoutAddScreen.tsx`, `src/screens/ActivityAddScreen.tsx`, `src/screens/WorkoutDetailScreen.tsx`, `src/screens/ActivityDetailScreen.tsx`, `src/services/workoutDraftService.ts`, `src/stores/activeWorkoutStore.ts`, and the relevant form hooks in `src/hooks/`
- Active workout HUD or rest timer bug:
  inspect `src/components/ActiveWorkoutBar.tsx`, `src/stores/activeWorkoutStore.ts`, `src/services/notifications.ts`, and any screen using `useActiveWorkoutBarPadding(...)`
- Measurements, hydration, or check-in bug:
  inspect `src/screens/DiaryScreen.tsx`, `src/screens/DashboardScreen.tsx`, `src/screens/MeasurementsAddScreen.tsx`, `src/components/MeasurementsSummary.tsx`, `src/components/HydrationGauge.tsx`, `src/hooks/useMeasurements.ts`, `src/hooks/useMeasurementsRange.ts`, `src/hooks/useWaterIntakeMutation.ts`, `src/hooks/useUpsertCheckIn.ts`, `src/services/api/measurementsApi.ts`, `src/types/measurements.ts`, `src/utils/unitConversions.ts`, and `src/utils/dateUtils.ts`
- Diary quick-adjust or swipe-delete bug:
  inspect `src/screens/DiaryScreen.tsx`, `src/screens/MealTypeDetailScreen.tsx`, `src/components/FoodSummary.tsx`, `src/components/ExerciseSummary.tsx`, `src/components/SwipeableFoodRow.tsx`, `src/components/SwipeableExerciseRow.tsx`, `src/components/ServingAdjustSheet.tsx`, `src/hooks/useDeleteFoodEntry.ts`, `src/hooks/useUpdateFoodEntry.ts`, and `src/hooks/useExerciseMutations.ts`
- Barcode scan, nutrition-label scan, or food-photo estimate bug:
  inspect `src/screens/FoodScanScreen.tsx`, `src/screens/FoodPhotoIntroScreen.tsx`, `src/navigation/FoodPhotoFlow.tsx`, `src/screens/FoodPhotoImproveScreen.tsx`, `src/screens/FoodPhotoEstimateReviewScreen.tsx`, `src/screens/FoodPhotoLogEntryScreen.tsx`, `src/screens/FoodSearchScreen.tsx`, `src/hooks/useActiveAiServiceSetting.ts`, `src/hooks/useEstimateFoodPhoto.ts`, `src/services/api/aiSettingsApi.ts`, `src/services/api/externalFoodSearchApi.ts`, `src/services/foodPhotoIntro.ts`, `src/utils/foodPhotoEstimate.ts`, `src/services/haptics.ts`, `src/components/Icon.tsx`, and the `FoodScan` / `FoodPhotoFlow` route params in `src/types/navigation.ts`
- Widget or deep-link bug:
  inspect `src/hooks/useWidgetSync.ts`, `src/native/CalorieWidgetBridge.ts`, `targets/widget/`, `targets/android-widget/`, `plugins/withCalorieWidget.ts`, `plugins/withGlanceAndroidSupport.ts`, `app.config.ts`, `app.identifiers.js`, `App.tsx`, and `src/screens/DashboardScreen.tsx`
- Food or calorie settings bug:
  inspect `src/screens/FoodSettingsScreen.tsx`, `src/screens/CalorieSettingsScreen.tsx`, `src/hooks/usePreferences.ts`, `src/hooks/useExternalProviders.ts`, `src/services/api/preferencesApi.ts`, `src/types/preferences.ts`, and `src/hooks/queryKeys.ts`
- Settings or diagnostics bug:
  inspect `src/screens/SettingsScreen.tsx`, `src/screens/ServerSettingsScreen.tsx`, `src/screens/AppSettingsScreen.tsx`, `src/screens/AboutScreen.tsx`, `src/components/SettingsRow.tsx`, `src/services/haptics.ts`, `src/services/themeService.ts`, `src/services/diagnosticReportService.ts`, `src/services/healthDiagnosticService.ts`, `src/components/DevTools.tsx`, and `src/components/ScreenErrorBoundary.tsx`
- Theme or styling issue:
  inspect `global.css`, `src/services/themeService.ts`, `src/components/Icon.tsx`, `src/components/CustomTabBar.tsx`, `src/components/SettingsRow.tsx`, and the affected component

## Priority Rule

- For work inside `SparkyFitnessMobile/`, this file is the package guide.
- If a task also changes another package, combine this guide with the relevant package guide instead of stretching this one to cover the whole monorepo.
