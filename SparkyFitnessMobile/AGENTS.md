# AGENTS.md

*Last updated: 2026-03-13*

SparkyFitness Mobile is a React Native (0.81) + Expo (SDK 54) app for syncing HealthKit / Health Connect data to the SparkyFitness backend and displaying daily nutrition, exercise, hydration, and related health summaries.

This file is the package guide for `SparkyFitnessMobile/`. Use it for work in this directory. This app lives in a monorepo, so if a task crosses into the backend, frontend, or `shared/`, read the matching guide there before editing outside this package.

## Project Overview

This is a React Native / Expo app using TypeScript with `strict` mode enabled. Always keep changes type-safe and compile cleanly before calling them complete.

Primary stack: React Navigation, TanStack Query, Uniwind/TailwindCSS v4, React Native Skia, Victory Native, Reanimated, Expo Background Task.

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
- Root providers are layered as `QueryClientProvider` -> `GestureHandlerRootView` -> `BottomSheetModalProvider` -> `NavigationContainer` -> `SafeAreaProvider`.
- App startup initializes theme state, background sync, log service, and iOS observer startup from the root.

### Navigation

- The current navigation source of truth is `App.tsx`.
- Root navigation is a native stack containing the tab shell plus pushed food-entry and log screens.
- Tabs: `Dashboard`, `Diary`, `Add`, `Sync`, `Settings`.
- `Add` is not a normal screen. It intercepts the tab press and opens `FoodSearch`.
- Pushed stack screens include `FoodSearch`, `FoodEntryAdd`, `FoodForm`, `FoodScan`, `FoodEntryView`, and `Logs`.
- `Dashboard`, `Diary`, `Sync`, and `Settings` each mount their own nested native stack.
- `DiaryScreen` uses fling gestures for date navigation. Be careful with gesture changes because they can affect nested navigation and sheet interactions.

### Source Structure (`src/`)

- `components/` — reusable UI including charts, settings controls, auth/config modals, and food-entry helpers
- `screens/` — top-level app screens such as `DashboardScreen`, `DiaryScreen`, `SyncScreen`, `SettingsScreen`, and the food-entry flow
- `hooks/` — TanStack Query hooks, auth hook, query client setup, and query key definitions
- `services/api/` — backend-facing API clients
- `services/healthconnect/` — Android health data reading, aggregation, transformation, and preference logic
- `services/healthkit/` — iOS health data reading, aggregation, transformation, background delivery, and preference logic
- `services/shared/` — platform-shared helpers used by both health stacks
- `constants/`, `utils/`, `types/` — app-wide config, helpers, and contracts

### Platform-Specific Code

- `src/services/healthConnectService.ts` — Android orchestration layer
- `src/services/healthConnectService.ios.ts` — iOS orchestration layer

**IMPORTANT**: These are not thin wrappers. Both contain substantial sync logic. For sync changes, edit the correct platform file directly instead of assuming one side re-exports the other.

`src/services/backgroundSyncService.ts` coordinates background sync timing and overlap handling across health sessions.

### React Query

- Query setup lives in `src/hooks/queryClient.ts`.
- Query keys live in `src/hooks/queryKeys.ts`.
- The app leans on manual invalidation and explicit refetch patterns. Do not assume a polling-heavy model.

### Styling

- Styling uses Uniwind with TailwindCSS v4 tokens defined in `global.css`.
- Many visual components read CSS variables from JS via `useCSSVariable`.
- Skia is used for custom charts and gauges; Victory Native is used for chart-style visualizations.
- Prefer Reanimated hooks for chart motion and progress transitions.

### Authentication & Networking

- The app supports two auth modes per server config: `apiKey` and `session`.
- Session auth flows live primarily in `src/services/api/authService.ts` and `src/components/LoginModal.tsx`.
- Proxy headers are first-class and must be preserved when working with reverse-proxy setups.
- `src/services/api/apiClient.ts` injects proxy headers into standard API requests.
- `src/services/api/healthDataApi.ts` uses raw `fetch`, not the shared API wrapper, but still injects proxy headers. If auth behavior changes, verify both codepaths.

## Native / Monorepo Rules

- Keep mobile changes isolated to this package unless the task truly crosses package boundaries.
- If you import from `@workspace/shared`, confirm the shared contract already exists or coordinate the change in `shared/`.
- `android/` and `ios/` are generated Expo native projects. Treat `app.config.ts`, Expo plugin configuration, and dependency setup as the main source of truth when possible.
- `app.config.ts` controls bundle identifiers, permissions, and plugin inclusion. `APP_VARIANT` selects dev vs production behavior.

## Health Sync Rules

- For HealthKit cumulative metrics such as steps and calories, use aggregated statistics queries rather than raw sample summation to match the Health app.
- Preserve platform parity where intended, but do not force Android and iOS implementations to look identical when their health APIs differ.
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
- Be careful with global mocks in `jest.setup.js` or shared test utilities. Mock pollution can show up far from the file you touched.
- On macOS, Jest resolves `.ios.ts` by default. For Android-specific tests, explicitly require the Android file:

```ts
const androidService = require('../../src/services/healthConnectService.ts');
```

- Run `pnpm run lint` and `pnpm exec tsc --noEmit` when changes affect multiple files, public types, hooks, or navigation contracts.

## After Refactors

- After file moves or import refactors, run the full Jest suite immediately and verify asset and `require(...)` paths before reporting completion.
- Before using SF Symbol names or other icon identifiers, verify that they exist. Do not guess icon names.

## Quick Routing

- Health sync bug:
  inspect `src/services/healthConnectService.ts` or `src/services/healthConnectService.ios.ts`, then the corresponding platform subdirectory under `src/services/healthconnect/` or `src/services/healthkit/`
- Auth or login bug:
  inspect `src/services/api/authService.ts`, `src/services/api/apiClient.ts`, `src/services/api/healthDataApi.ts`, and `src/components/LoginModal.tsx`
- UI or navigation issue:
  start with `App.tsx`, then move to the relevant file in `src/screens/` and supporting UI in `src/components/`
- Theme or styling issue:
  inspect `global.css`, `src/services/themeService.ts`, and the affected component

## Priority Rule

- For work inside `SparkyFitnessMobile/`, this file is the package guide.
- If a task also changes another package, combine this guide with the relevant package guide instead of stretching this one to cover the whole monorepo.
