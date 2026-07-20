# Phase 2-3 — Settings Screen & First-Run Onboarding

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained). Depends on Phase 1 (`01-foundation.md`) being complete: `cycleApi.ts`, `useCycleSettings.ts`, `useCycleMode.ts`, and query keys must already exist.

## Goal

Build the settings screen (mode switch + all preferences) and the first-run onboarding wizard. These gate every other screen in the feature (mode determines Today-view branch everywhere; `onboarded_at` gates first entry into the hub), so they must exist before Phase 4 (core cycle) begins.

## Background: what these screens control

`cycle_settings` table (one row per user), exposed via `GET/PUT /api/v2/cycle/settings` (already wrapped by `cycleApi.ts` and `useCycleSettings.ts` from Phase 1):
- `enabled: boolean` — master toggle; when false, the whole feature is inert and the AddSheet entry point (built in Phase 9) is hidden.
- `mode: 'standard' | 'ttc' | 'pregnant' | 'postpartum' | 'menopause'` — **the** mode switch. Values map to web's exact `CycleMode` enum in `shared/src/cycle/types.ts` — do not invent new mode strings.
- `avg_cycle_length_override`, `avg_period_length_override`: numeric, optional overrides to the derived-from-history averages.
- `luteal_phase_length`: numeric, default 14.
- `birth_control_method: string` — from the birth-control-method catalog in `shared/src/cycle/constants.ts`.
- `conditions: string[]` — from the cycle-condition catalog (e.g. PCOS, endometriosis) in the same constants file.
- `show_fertile_window: boolean`.
- `terminology: 'default' | 'neutral'` — gendered vs. gender-neutral language throughout the feature.
- `discreet_mode: boolean` — when true, all screens should use neutral labels/icons (e.g. "Wellness" instead of "Cycle"/"Pregnancy") — this must be threaded through every phase's screens via `useCycleMode()`, not just this settings screen.
- `onboarded_at` — null/unset until the onboarding wizard (this phase) is completed; used as an entry gate.
- `preferred_products: string[]`, `dismissed_prompts: string[]` — secondary preference state, less UI-critical; still expose in settings if a natural place exists (e.g. a "reset dismissed prompts" action), but don't block the phase on them.

Web precedent (reference only, do not import): `src/pages/Settings/CycleSettings.tsx` is an accordion embedded in `SettingsPage.tsx` with: master enable toggle, mode select, birth control select, conditions checkboxes, numeric overrides, `show_fertile_window` toggle, terminology toggle, discreet-mode toggle, a "reset onboarding" button (clears `onboarded_at`), and an export-to-JSON action (calls a `GET /export` endpoint already implemented server-side and already added to `cycleApi.ts` in Phase 1 as `getExport`). `src/pages/Cycle/CycleOnboarding.tsx` is a first-run wizard that lets the user pick the initial mode and enter baseline cycle info before `CyclePage` becomes fully usable.

## Mobile conventions to follow

- Toggle-heavy preferences screens use `SettingsRow`/`SettingsRowGroup` — pattern off `src/screens/DiarySettingsScreen.tsx` and `src/screens/DashboardSettingsScreen.tsx`.
- Root-stack screen registration: add the route's param type to `RootStackParamList` in `src/types/navigation.ts`, register `<Stack.Screen name="..." component={...} options={createStackScreenOptions(...)} />` in `App.tsx`, wrap the component with `withErrorBoundary(Component, 'ScreenName', { canGoBack: true })`. Modal-presented screens use `presentation: 'modal'` plus `androidModalAnimation` on Android — see the existing `MeasurementsAdd` registration in `App.tsx` for the exact shape to copy.
- Screens declare headers via `useScreenHeader(config)` (`src/hooks/useScreenHeader.tsx`) — do not hand-roll headers; a contract test (`__tests__/navigation/nativeHeaderContract.test.ts`) enforces this and enumerates all root-stack routes with a screen-owned header. Exactly one `kind: 'primary'` header action per screen (enforced with a `__DEV__` throw). Screens with a real back button must set `headerBackTitle` or `headerBackButtonDisplayMode: 'minimal'` in `App.tsx`.
- Screens intentionally presented above `Tabs` (rather than participating in native-tabs mode) need an entry with a short reason in `NATIVE_TABS_ROUTE_EXCLUSIONS` inside `__tests__/navigation/nativeHeaderContract.test.ts` — likely applicable to the onboarding wizard (first-run-style modal), analogous to existing exclusions for `MeasurementsAdd`/`CalorieSettings`.
- Mode picker: use `BottomSheetPicker.tsx`. Numeric overrides (cycle length, period length, luteal phase length): use `StepperInput.tsx` (numeric +/-). Terminology/discreet-mode/`show_fertile_window`: plain `SettingsRow` toggles.
- `useCSSVariable`/`useUniwind` provide theme-aware colors; use existing tokens for this screen (no wellness sub-theme yet — that's Phase 9 polish, scoped only to the more visual screens in Phases 4-7).

## Tasks

### 1. `src/screens/CycleSettingsScreen.tsx` (new)
Root-stack screen (add `CycleSettings: undefined` to `RootStackParamList`). Renders, via `SettingsRowGroup`/`SettingsRow`:
- Master "Enable Cycle & Pregnancy Tracking" toggle (`enabled`).
- Mode picker row → opens `BottomSheetPicker` with the 5 mode options (label each clearly: Standard Cycle / Trying to Conceive / Pregnancy Tracking / Postpartum / Menopause-aware).
- Birth control method row → `BottomSheetPicker` over the birth-control catalog from `shared/src/cycle/constants.ts`.
- Conditions row → multi-select (checkboxes) over the cycle-condition catalog.
- Cycle length override, period length override, luteal phase length → `StepperInput` rows.
- "Show fertile window" toggle.
- Terminology toggle (`default` vs `neutral`).
- Discreet mode toggle.
- "Reset onboarding" action row (clears `onboarded_at` via the settings PUT mutation from `useCycleSettings.ts`).
- "Export data" action row (calls `cycleApi.getExport()` from Phase 1; follow whatever existing mobile pattern is used for exporting/sharing a JSON blob — check `diagnosticReportService.ts` for a precedent if one exists).
- Use the `useCycleSettings()` mutation from Phase 1 to PUT changes; every field change should be a controlled, debounced or on-blur PUT (match the interaction pattern already used in `DiarySettingsScreen.tsx`/`DashboardSettingsScreen.tsx` for similar toggle/stepper rows).

### 2. Reachability: add a "Wellness" row to `SettingsScreen.tsx`
Since the AddSheet entry point (built in Phase 9) is conditional on `enabled`, users need a way to discover the feature and turn it on in the first place. Add a `SettingsRow` (e.g. labeled "Wellness" or "Cycle & Pregnancy") inside the existing `SettingsScreen.tsx`, **always visible regardless of `enabled`**, that navigates to `CycleSettings`. This is the only entry point into this feature that must work even when `enabled` is false.

### 3. `src/screens/CycleOnboardingScreen.tsx` (new)
Root-stack screen (add `CycleOnboarding: undefined` to `RootStackParamList`), modal-presented. Short, scoped wizard (do not confuse with the app's main first-run `OnboardingScreen` — this is a sub-feature onboarding shown the first time the user opens the Cycle Hub with `!enabled || !onboarded_at`):
- Step 1: pick initial mode (same 5 options as settings).
- Step 2: enter baseline info relevant to the chosen mode (e.g. last period start date for standard/ttc; due-date basis + date for pregnant — this can be a lightweight subset of what `PregnancySetupScreen` collects in Phase 7, since a full pregnancy record isn't required to finish onboarding, just enough to set `enabled: true` and populate `mode`).
- On completion: PUT settings with `enabled: true`, chosen `mode`, and `onboarded_at` set to now (server likely sets this timestamp automatically on this call — verify against `cycleSchemas.ts`'s `UpsertCycleSettingsBodySchema`; if the server expects the client to set `onboarded_at`, format it as an ISO string using this repo's existing timezone helpers, not `toISOString().split('T')[0]`).
- Navigate to `CycleHub` (built in Phase 4) on completion.
- Add this screen to `NATIVE_TABS_ROUTE_EXCLUSIONS` in `__tests__/navigation/nativeHeaderContract.test.ts` with a short reason (first-run-style modal presented above the tab host).

## Verification
- Read/write round-trip settings against `/api/v2/cycle/settings` with no dependency on any Today/Insights UI (those don't exist yet).
- Confirm the "Wellness" row in `SettingsScreen.tsx` is reachable and opens `CycleSettingsScreen` even when `enabled` is false.
- Confirm onboarding correctly gates: with `enabled: false` or `onboarded_at` unset, opening the hub (once Phase 4 exists) should route to onboarding first; after completion it should not show onboarding again.
- Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/`.
- Add tests under `__tests__/screens/CycleSettingsScreen.test.tsx` and `__tests__/screens/CycleOnboardingScreen.test.tsx`.

## Next phase
`03-core-cycle.md` — builds `CycleHubScreen` and the Today/Log/Calendar experience, gated by the settings/onboarding state built here.
