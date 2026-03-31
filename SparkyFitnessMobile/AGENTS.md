# AGENTS.md

*Last updated: 2026-03-31*

SparkyFitness Mobile is a React Native (0.81) + Expo (SDK 54) app for syncing HealthKit / Health Connect data to the SparkyFitness backend and displaying daily nutrition, exercise, hydration, and related health summaries.

This file is the package guide for `SparkyFitnessMobile/`. Use it for work in this directory. This app lives in a monorepo, so if a task crosses into the backend, frontend, or `shared/`, read the matching guide there before editing outside this package.

## Project Overview

This is a React Native / Expo app using TypeScript with `strict` mode enabled. Always keep changes type-safe and compile cleanly before calling them complete.

Primary stack: React Navigation, TanStack Query, Uniwind/TailwindCSS v4, React Native Skia, Victory Native, Reanimated, Expo Background Task, React Native Keyboard Controller, and React Native Toast Message.

Work from `SparkyFitnessMobile/` for implementation and validation. Do not treat the monorepo root as the mobile app entrypoint.

`tsconfig.json` defines:
- `@/*` for local package imports
- `@workspace/shared` for `../shared/src/index.ts`

The app talks to the SparkyFitness backend primarily under `/api` and sends health sync payloads to `POST /api/health-data`.

## Commands

```bash
pnpm start
pnpm run ios
pnpm run android
pnpm run lint
pnpm run test:run -- --watchman=false --runInBand
pnpm exec jest --watchman=false --runInBand <test-path>
pnpm exec tsc --noEmit
npx expo prebuild -c
```

- Use `pnpm run test:run -- --watchman=false --runInBand` for an agent-safe full Jest run.
- Do not use bare `pnpm test` or bare `jest` in sandboxed agent runs; Watchman regularly fails.
- Use `pnpm exec jest --watchman=false --runInBand <test-path>` for targeted test runs.
- Run `npx expo prebuild -c` after native dependency changes, permission changes, or native config changes.

## Architecture

### App Shell

- `App.tsx` is the root composition point.
- Root providers are layered as `QueryClientProvider` -> `KeyboardProvider` -> `GestureHandlerRootView` -> `BottomSheetModalProvider` -> `NavigationContainer` -> `SafeAreaProvider`.
- A safe-area-aware toast host is mounted from `App.tsx` with `src/components/ui/toastConfig.tsx`.
- App startup initializes theme state, log service, timezone bootstrap, background sync, and iOS observers from the root.
- Initial routing is decided at startup: users without an active server config land on `Onboarding`, otherwise they enter `Tabs`.

### Navigation

- The current navigation source of truth is `App.tsx`.
- Root navigation is a single stack containing `Onboarding`, the tab shell, food-entry screens, exercise screens, `Logs`, and `Sync`.
- Tabs are `Dashboard`, `Diary`, `Add`, `Workouts`, and `Settings`.
- `CustomTabBar` in `src/components/CustomTabBar.tsx` owns the tab UI. `Add` is a center action button, not a normal screen.
- Tapping `Add` opens `src/components/AddSheet.tsx`, which offers Food, Barcode Scan, Sync Health Data, and an Exercise submenu for Workout, Activity, and Preset flows.
- Detailed sync configuration now lives on `SyncScreen`, reached from `Settings`. The Add sheet's sync action triggers the sync mutation directly without navigating.
- Flow screens include `FoodSearch`, `FoodEntryAdd`, `FoodForm`, `FoodScan`, `FoodEntryView`, `ExerciseSearch`, `PresetSearch`, `WorkoutAdd`, `ActivityAdd`, `WorkoutDetail`, and `ActivityDetail`.
- There are no per-tab nested stack navigators right now. When changing routes, update `src/types/navigation.ts` and `App.tsx` together.
- `DiaryScreen` uses fling gestures for date navigation. Be careful with gesture changes because they can affect nested scrolling and sheet interactions.

### Source Structure (`src/`)

- `components/` - reusable UI including the custom tab bar, add sheet, auth/config modals, charts, settings controls, and food/workout UI
- `components/auth/` - MFA-related auth UI used by onboarding and server config flows
- `components/ui/` - shared primitives such as `Button` and toast configuration
- `screens/` - top-level screens including onboarding, dashboard, diary, workouts, sync, settings, logs, food entry, and exercise flows
- `hooks/` - TanStack Query hooks, auth and connection hooks, workout/activity form hooks, draft persistence, and query client setup
- `services/api/` - backend-facing API clients for auth, food, workouts, daily summary, measurements, preferences, and related lookups
- `services/healthconnect/` - Android health data reading, aggregation, transformation, and preference logic
- `services/healthkit/` - iOS health data reading, aggregation, transformation, background delivery, and preference logic
- `services/shared/` - platform-shared helpers used by both health stacks
- `services/` - also contains background sync, diagnostics, theme state, storage, health display helpers, and workout draft persistence
- `constants/`, `utils/`, `types/` - app-wide config, helpers, and contracts

### Platform-Specific Code

- `src/services/healthConnectService.ts` - Android orchestration layer
- `src/services/healthConnectService.ios.ts` - iOS orchestration layer

**IMPORTANT**: These are not thin wrappers. Both contain substantial sync logic. For sync changes, edit the correct platform file directly instead of assuming one side re-exports the other.

- `src/services/backgroundSyncService.ts` coordinates background sync timing, session overlap windows, chunked uploads, and overlap protection across manual and OS-triggered syncs.
- `src/services/workoutDraftService.ts` persists the in-progress workout/activity draft used by the Add sheet and exercise forms.

### React Query

- Query setup lives in `src/hooks/queryClient.ts`.
- Query keys live in `src/hooks/queryKeys.ts`.
- The app leans on manual invalidation and explicit refetch patterns. Do not assume a polling-heavy model.
- Settings changes that swap the active server clear query state before refetching. Preserve that behavior when adjusting auth or multi-server flows.

### Styling

- Styling uses Uniwind with TailwindCSS v4 tokens defined in `global.css`.
- Many visual components read CSS variables from JS via `useCSSVariable`.
- Skia is used for custom charts and gauges; Victory Native is used for chart-style visualizations.
- `src/components/Icon.tsx` is the cross-platform icon abstraction. It maps semantic icon names to SF Symbols on iOS and Ionicons on Android. Verify symbol names before adding new icons.

### Authentication & Networking

- The app supports two auth modes per server config: `apiKey` and `session`.
- First-run connection setup is handled by `src/screens/OnboardingScreen.tsx`, which supports URL validation, session sign-in, API keys, and MFA.
- Ongoing config management is handled by `src/components/ServerConfigModal.tsx`, while expired sessions flow through `src/components/ReauthModal.tsx` and `src/hooks/useAuth.ts`.
- Server configs, active-config switching, and proxy headers live in `src/services/storage.ts`.
- `src/services/api/apiClient.ts` injects proxy headers into standard API requests.
- `src/services/api/healthDataApi.ts` uses raw `fetch`, but still injects proxy headers and auth headers. If auth behavior changes, verify both codepaths.
- In production, HTTP server URLs are rejected. Preserve the HTTPS guard in onboarding, settings, and health sync paths.

## Native / Monorepo Rules

- Keep mobile changes isolated to this package unless the task truly crosses package boundaries.
- If you import from `@workspace/shared`, confirm the shared contract already exists or coordinate the change in `shared/`.
- `android/` and `ios/` are generated Expo native projects. Treat `app.config.ts`, Expo plugin configuration, and dependency setup as the main source of truth when possible.
- `app.config.ts` controls bundle identifiers, permissions, and plugin inclusion. `APP_VARIANT` selects dev vs production behavior, and `EXPO_DEV_BUNDLE_IDENTIFIER` can override the dev bundle identifier.
- Dev builds request extra Android Health Connect write permissions for local testing and seeding. Production builds additionally include `./plugins/withNetworkSecurityConfig`.

## Health Sync Rules

- For HealthKit cumulative metrics such as steps and calories, use aggregated statistics queries rather than raw sample summation to match the Health app.
- Bootstrap timezone state before sync work. `ensureTimezoneBootstrapped` is part of app startup and `healthDataApi.ts` also enforces it before upload.
- Preserve timezone metadata on synced records when available. Do not strip or rename `record_timezone` or `record_utc_offset_minutes` fields without coordinating with the server.
- Background sync uses overlap windows for session metrics and day-level aggregation windows for cumulative metrics. Do not collapse those into a single naive query window.
- Health uploads are chunked, and sleep/workout/session records are grouped by source to match the server's delete-then-insert behavior. Do not split those records across arbitrary chunks.
- Exercise-session transformations on both platforms emit a default `Working Set`. Keep backend payload expectations in mind when changing exercise sync.

## Testing

```bash
pnpm exec jest --watchman=false --runInBand <test-path>
pnpm run test:run -- --watchman=false --runInBand
pnpm run lint
pnpm exec tsc --noEmit
```

Tests live in `__tests__/` and use the `jest-expo` preset with `jest.setup.js`.

- Run the full single-run suite after broad refactors, shared mock changes, navigation rewiring, or import-path moves.
- If you change `useWorkoutForm`, `useActivityForm`, `useDraftPersistence`, `workoutDraftService`, or the workout/activity screens, rerun the related draft and form tests.
- Be careful with global mocks in `jest.setup.js` or shared test utilities. Mock pollution can show up far from the file you touched.
- On macOS, Jest resolves `.ios.ts` by default. For Android-specific tests, explicitly require the Android file:

```ts
const androidService = require('../../src/services/healthConnectService.ts');
```

- Run `pnpm run lint` and `pnpm exec tsc --noEmit` when changes affect multiple files, public types, hooks, or navigation contracts.

## After Refactors

- After file moves or import refactors, run the full Jest suite immediately and verify asset and `require(...)` paths before reporting completion.
- If you change routes, modal entry points, or the add sheet, verify `src/types/navigation.ts`, `App.tsx`, and any route-param consumers stay aligned.
- If you change the custom tab bar or bottom sheet flows, sanity-check safe-area spacing and gesture behavior on both iOS and Android paths.

## Quick Routing

- Health sync bug:
  inspect `src/services/healthConnectService.ts` or `src/services/healthConnectService.ios.ts`, then `src/services/backgroundSyncService.ts`, `src/screens/SyncScreen.tsx`, and the corresponding platform subdirectory under `src/services/healthconnect/` or `src/services/healthkit/`
- Onboarding, auth, or server-config bug:
  inspect `src/screens/OnboardingScreen.tsx`, `src/components/ServerConfigModal.tsx`, `src/components/ReauthModal.tsx`, `src/hooks/useAuth.ts`, `src/services/api/authService.ts`, `src/services/api/apiClient.ts`, `src/services/api/healthDataApi.ts`, and `src/services/storage.ts`
- Workout or activity flow bug:
  inspect `src/components/AddSheet.tsx`, `src/screens/WorkoutsScreen.tsx`, `src/screens/WorkoutAddScreen.tsx`, `src/screens/ActivityAddScreen.tsx`, `src/screens/WorkoutDetailScreen.tsx`, `src/screens/ActivityDetailScreen.tsx`, `src/services/workoutDraftService.ts`, and the relevant form hooks in `src/hooks/`
- UI or navigation issue:
  start with `App.tsx`, then `src/components/CustomTabBar.tsx`, `src/components/AddSheet.tsx`, and the affected screen in `src/screens/`
- Settings or diagnostics bug:
  inspect `src/screens/SettingsScreen.tsx`, `src/services/diagnosticReportService.ts`, `src/services/healthDiagnosticService.ts`, and `src/components/DevTools.tsx`
- Theme or styling issue:
  inspect `global.css`, `src/services/themeService.ts`, `src/components/Icon.tsx`, and the affected component

## Priority Rule

- For work inside `SparkyFitnessMobile/`, this file is the package guide.
- If a task also changes another package, combine this guide with the relevant package guide instead of stretching this one to cover the whole monorepo.
