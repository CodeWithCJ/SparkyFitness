# AGENTS.md

*Last updated: 2026-04-21*

SparkyFitness Mobile is a React Native 0.81.5 + Expo SDK 54 app for syncing HealthKit / Health Connect data to the SparkyFitness backend, tracking daily nutrition and exercise, managing workouts, and powering iOS widgets plus the in-app active workout HUD.

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
- App startup initializes theme state, notifications, log service, timezone bootstrap, background sync, pending cache refresh flushes, and iOS HealthKit observers from the root.
- Initial routing is decided at startup with `getActiveServerConfig()`: users without an active server config land on `Onboarding`, otherwise they enter `Tabs`.
- Deep linking is intentionally gated until the user reaches `Tabs`, so widget links are ignored during first-run onboarding but work afterward.

### Navigation

- The navigation source of truth is `App.tsx` plus `src/types/navigation.ts`.
- Root navigation is a single native stack containing:
  - `Onboarding`
  - `Tabs`
  - `FoodSearch`
  - `FoodEntryAdd`
  - `FoodForm`
  - `FoodScan`
  - `FoodEntryView`
  - `ExerciseSearch`
  - `PresetSearch`
  - `WorkoutAdd`
  - `ActivityAdd`
  - `WorkoutDetail`
  - `ActivityDetail`
  - `Logs`
  - `Sync`
  - `CalorieSettings`
  - `FoodSettings`
- Tabs are `Dashboard`, `Diary`, `Add`, `Workouts`, and `Settings`.
- `CustomTabBar` in `src/components/CustomTabBar.tsx` owns the tab UI. `Add` is a center action button, not a real content screen.
- Tapping `Add` opens `src/components/AddSheet.tsx`, which offers Food, Sync Health Data, Barcode Scan, and an Exercise submenu for Workout, Activity, and Preset flows.
- The tab bar embeds `ActiveWorkoutBar` above itself. Stack screens use the floating variant instead.
- `DiaryScreen` uses fling gestures for date navigation. Be careful with gesture changes because they can affect nested scrolling and sheet interactions.
- Current deep links use the `sparkyfitnessmobile://` prefix and route `scan` -> `FoodScan` and `search` -> `FoodSearch`.
- There are no per-tab nested stack navigators right now. When changing routes, update `src/types/navigation.ts`, `App.tsx`, and the linking config together.

### Source Structure (`src/`)

- `components/` - reusable UI including the custom tab bar, add sheet, workout HUD, auth/config modals, charts, settings controls, and food/workout UI
- `components/auth/` - MFA-related auth UI used by onboarding, setup, and reauth flows
- `components/ui/` - shared primitives such as `Button` and the toast configuration
- `screens/` - top-level screens including onboarding, dashboard, diary, workouts, sync, settings, logs, food entry, and exercise flows
- `hooks/` - TanStack Query hooks, auth and connection hooks, widget sync, workout/activity form hooks, draft persistence, and query client setup
- `services/api/` - backend-facing API clients for auth, food, workouts, daily summary, measurements, preferences, and related lookups
- `services/healthconnect/` - Android Health Connect reading, aggregation, transformation, and preference logic
- `services/healthkit/` - iOS HealthKit reading, aggregation, transformation, background delivery, and preference logic
- `services/shared/` - platform-shared helpers used by both health stacks
- `services/` - also contains background sync, auto-sync coordination, diagnostics, theme state, storage, notifications, health display helpers, and workout draft persistence
- `stores/` - Zustand state, currently including `activeWorkoutStore.ts`
- `constants/`, `types/`, `utils/` - app-wide config, contracts, and helpers

### Widgets, Workout HUD, and Error Boundaries

- `src/stores/activeWorkoutStore.ts` persists the active workout session, completed-set cursor, and rest timer state. It also coordinates local rest notifications.
- `src/components/ActiveWorkoutBar.tsx` is a persistent workout HUD that renders outside normal screen trees and relies on the root navigation ref.
- Many screens reserve bottom space with `useActiveWorkoutBarPadding(...)`. If you change the bar, update padding logic and verify affected screens.
- `DashboardScreen` pushes today's daily summary to iOS widgets through `src/hooks/useWidgetSync.ts`.
- The iOS widget target lives under `targets/widget/` and shares data through the app group configured by `app.config.ts` and `app.identifiers.js`.
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
- Settings changes that swap the active server clear query state before refetching. Preserve that behavior when adjusting auth or multi-server flows.
- Error-boundary retry flows call `queryClient.resetQueries()`. Keep that in mind when changing screen-level recovery behavior.

### Styling

- Styling uses Uniwind with TailwindCSS v4 tokens defined in `global.css`.
- Many visual components read CSS variables from JS via `useCSSVariable`.
- Skia is used for custom charts and gauges; Victory Native is used for chart-style visualizations.
- `src/components/Icon.tsx` is the cross-platform icon abstraction. It maps semantic icon names to SF Symbols on iOS and Ionicons on Android. Verify symbol names before adding new icons.

### Authentication and Networking

- The app supports two auth modes per server config: `apiKey` and `session`.
- First-run connection setup is handled by `src/screens/OnboardingScreen.tsx`, which supports URL validation, session sign-in, API keys, MFA, and a finish-without-connection path into Settings.
- Ongoing config management is handled in two places:
  - `SettingsScreen` via `ServerConfigComponent` + `ServerConfigModal`
  - global auth recovery flows via `useAuth()`, `ReauthModal`, and the root-level `ServerConfigModal`
- Server configs live in `src/services/storage.ts`. IDs and URLs are stored in AsyncStorage; API keys, session tokens, and proxy headers are stored in SecureStore.
- `src/services/api/apiClient.ts` injects proxy headers and auth headers into standard API requests.
- `src/services/api/healthDataApi.ts` uses raw `fetch`, but still injects proxy headers and auth headers, plus its own timeout/retry/chunking logic. If auth behavior changes, verify both codepaths.
- In production, HTTP server URLs are rejected. Preserve the HTTPS guard in onboarding, settings, API fetches, and health sync paths.

## Native and Monorepo Rules

- Keep mobile changes isolated to this package unless the task truly crosses package boundaries.
- If you import from `@workspace/shared`, confirm the shared contract already exists or coordinate the change in `shared/`.
- `android/` and `ios/` are generated Expo native projects. Treat `app.config.ts`, Expo plugin configuration, target config, and dependency setup as the main source of truth when possible.
- `app.config.ts` currently controls bundle identifiers, Apple team IDs, the iOS app group, Android permissions, and production-only plugin inclusion.
- `APP_VARIANT` selects dev vs production behavior, and `EXPO_DEV_BUNDLE_IDENTIFIER` can override the dev bundle identifier.
- Dev builds request extra Android Health Connect write permissions for local testing and seeding.
- Production builds additionally include `./plugins/withNetworkSecurityConfig`.
- If you touch widget behavior, app-group storage, or widget target metadata, inspect `app.config.ts`, `app.identifiers.js`, `targets/widget/`, and `src/hooks/useWidgetSync.ts` together.

## Health Sync Rules

- For cumulative metrics such as steps and calories, use aggregated statistics / aggregation APIs rather than raw sample summation so results match the Health app / Health Connect totals.
- Bootstrap timezone state before sync work. `ensureTimezoneBootstrapped(...)` is part of app startup and `healthDataApi.ts` also enforces it before upload.
- Preserve timezone metadata on synced records when available. Do not strip or rename `record_timezone` or `record_utc_offset_minutes` without coordinating with the server.
- Background sync uses overlap windows for session metrics and day-level aggregation windows for cumulative metrics. Do not collapse those into a single naive query window.
- Manual sync, sync-on-open, foreground-return sync, and iOS observer-triggered sync all share coordination logic. Preserve claim / in-flight guards so one trigger path does not duplicate another.
- Health uploads are chunked, and `SleepSession`, `ExerciseSession`, and `Workout` records are grouped by source to match the server's delete-then-insert behavior. Do not split those groups across arbitrary chunks.
- Health Connect permission versioning and migration logic belongs in service/shared helpers such as `src/services/shared/healthPermissionMigration.ts`, not as ad hoc UI-only state in `SyncScreen`.
- Exercise-session transformations on both platforms emit a default `Working Set`. Keep backend payload expectations in mind when changing exercise sync.
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
  - `__tests__/hooks/useAuth.test.ts`
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
- If you change the custom tab bar, active workout HUD, or bottom sheet flows, sanity-check safe-area spacing and `useActiveWorkoutBarPadding(...)` behavior on both iOS and Android paths.
- If you change widget plumbing, verify `DashboardScreen`, `useWidgetSync.ts`, the app group config, and `targets/widget/` stay in sync.
- If you change permissions, target config, plugins, app group config, or native dependencies, rerun `npx expo prebuild -c`.

## Quick Routing

- Health sync bug:
  inspect `src/services/healthConnectService.ts` or `src/services/healthConnectService.ios.ts`, then `src/services/backgroundSyncService.ts`, `src/services/autoSyncCoordinator.ts`, `src/screens/SyncScreen.tsx`, and the matching platform folder under `src/services/healthconnect/` or `src/services/healthkit/`
- Onboarding, auth, or server-config bug:
  inspect `src/screens/OnboardingScreen.tsx`, `src/components/ServerConfigModal.tsx`, `src/components/ReauthModal.tsx`, `src/hooks/useAuth.ts`, `src/services/api/authService.ts`, `src/services/api/apiClient.ts`, `src/services/api/healthDataApi.ts`, and `src/services/storage.ts`
- Workout or activity flow bug:
  inspect `src/components/AddSheet.tsx`, `src/screens/WorkoutsScreen.tsx`, `src/screens/WorkoutAddScreen.tsx`, `src/screens/ActivityAddScreen.tsx`, `src/screens/WorkoutDetailScreen.tsx`, `src/screens/ActivityDetailScreen.tsx`, `src/services/workoutDraftService.ts`, `src/stores/activeWorkoutStore.ts`, and the relevant form hooks in `src/hooks/`
- Active workout HUD or rest timer bug:
  inspect `src/components/ActiveWorkoutBar.tsx`, `src/stores/activeWorkoutStore.ts`, `src/services/notifications.ts`, and any screen using `useActiveWorkoutBarPadding(...)`
- Widget or deep-link bug:
  inspect `src/hooks/useWidgetSync.ts`, `targets/widget/`, `app.config.ts`, `app.identifiers.js`, `App.tsx`, and `src/screens/DashboardScreen.tsx`
- Settings or diagnostics bug:
  inspect `src/screens/SettingsScreen.tsx`, `src/services/diagnosticReportService.ts`, `src/services/healthDiagnosticService.ts`, `src/components/DevTools.tsx`, and `src/components/ScreenErrorBoundary.tsx`
- Theme or styling issue:
  inspect `global.css`, `src/services/themeService.ts`, `src/components/Icon.tsx`, `src/components/CustomTabBar.tsx`, and the affected component

## Priority Rule

- For work inside `SparkyFitnessMobile/`, this file is the package guide.
- If a task also changes another package, combine this guide with the relevant package guide instead of stretching this one to cover the whole monorepo.
