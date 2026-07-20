# Phase 9-10 — Navigation Wiring, Wellness Sub-Theme, Discreet Mode, Final Polish

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained). Depends on **all** prior phases (`01-foundation.md` through `07-care-hub.md`) having their target screens/components in place, since this phase wires the entry point to them and polishes every surface. Nav wiring itself (Task 1-3 below) can start incrementally alongside earlier phases rather than strictly last, but final wiring/testing happens once all target screens exist.

## Goal

Make the feature reachable from the app's primary navigation (`AddSheet`), give it a distinct but scoped "wellness" visual identity (soft rose/lavender palette + a small amount of illustrated content), ensure discreet mode and terminology preferences are honored consistently across every screen built in Phases 2-8, update navigation contract tests, and add developer documentation.

## Background: current AddSheet state (verified against code)

`src/components/AddSheet.tsx` currently accepts props `onAddFood`, `onStartWorkout`, `onAddActivity`, `onLogWorkout`, `onSyncHealthData`, `onBarcodeScan`, `onAddMeasurements`, `onAskSparky`, `onDismissWithoutAction`. It renders a 2x2 grid of primary cards via `renderCard` (currently Food / Exercise-submenu / Measurements / Scan Food) followed by "secondary rows" via `renderSecondaryRow` (currently "Ask Sparky" and "Sync Health Data") — each a `Button variant="primary"` with `--color-raised` background, an `Icon`, and a label. `App.tsx`'s `AppContent()` owns the actual navigation callbacks and passes them down; `AddSheet` itself holds no navigation or query awareness (it's a pure presentation + open/close state component). Icon names are mapped in `Icon.tsx` (`IconName` type) to SF Symbols (iOS) / Ionicons (Android).

`src/types/navigation.ts` defines `RootStackParamList` (all root-stack routes) and `TabParamList` (`Dashboard | Diary | Add | Library | Settings` — `Add` is a center action opening `AddSheet`, not a real screen). Screens are registered in `App.tsx` via `<Stack.Screen>` + `createStackScreenOptions(...)`, wrapped with `withErrorBoundary`. Headers are declared via `useScreenHeader(config)`, enforced by `__tests__/navigation/nativeHeaderContract.test.ts`, which also holds `NATIVE_TABS_ROUTE_EXCLUSIONS` for screens intentionally presented above `Tabs`.

By this phase, the following routes should already exist from earlier phases: `CycleOnboarding`, `CycleHub`, `CycleSettings`, `PregnancySetup` (all added to `RootStackParamList` progressively in Phases 2, 4, and 7).

## Tasks

### 1. Extend `AddSheetProps` and add a new secondary row
In `src/components/AddSheet.tsx`: add `onOpenCycle: () => void` to `AddSheetProps`, and a new boolean prop `showCycleCard`. Add a new `renderSecondaryRow('...', '...', onOpenCycle)` call, only rendered when `showCycleCard` is true. Label and icon must adapt to mode/discreet-mode (computed by the caller in `App.tsx`, passed in as a resolved label/icon — do not have `AddSheet` itself call `useCycleMode()`, since it has no query awareness by design):
- `mode === 'standard' | 'ttc'` → label "Log Cycle"
- `mode === 'pregnant' | 'postpartum'` → label "Log Pregnancy"
- `discreet_mode === true` → override to a neutral label, e.g. "Wellness", regardless of mode
Add the corresponding new icon name to `Icon.tsx`'s semantic map (verify the chosen SF Symbol / Ionicon identifier exists on both platforms before adding).

### 2. Wire `App.tsx`
In `AppContent()` (which already owns several such global reads for `AddSheet`'s other conditionals), call `useCycleMode()` once and derive `showCycleCard = cycleMode.enabled`, plus a `handleOpenCycle` callback that navigates to `CycleHub` (no separate "pregnancy" card is needed — `CycleHubScreen`, built in Phase 4/7, already branches its Today view by mode internally). Pass `showCycleCard`/`onOpenCycle` down to `<AddSheet ... />`.

### 3. Add a discovery path independent of `enabled`
Since the AddSheet row only appears when `enabled` is true, first-time users need another way to find the feature and turn it on. Confirm Phase 2's "Wellness" `SettingsRow` (added to `SettingsScreen.tsx`, always visible, opens `CycleSettingsScreen`) is in place — if Phase 2 was skipped or this row wasn't added, add it now as part of this phase.

### 4. Update navigation contract tests
- `__tests__/navigation/nativeHeaderContract.test.ts` — the route enumeration should automatically pick up `CycleOnboarding`, `CycleHub`, `CycleSettings`, `PregnancySetup` once they're registered with `useScreenHeader` in `App.tsx` (per AGENTS.md: "do not add screen-specific native-header allowlists" for screens with a screen-owned header). Confirm `CycleOnboarding` has an entry (with a short reason) in `NATIVE_TABS_ROUTE_EXCLUSIONS`, since it's a first-run-style modal presented above the tab host, analogous to existing `MeasurementsAdd`/`CalorieSettings` exclusions.
- `__tests__/components/AddSheet.test.tsx` — add coverage for the new card/prop (`showCycleCard` true/false, label variants for mode/discreet-mode).
- Per `SparkyFitnessMobile/AGENTS.md`'s stated rule ("Widgets/HUD/tab/add-sheet changes: rerun `useWidgetSync`, active workout store, `AddSheet`, `CustomTabBar`, `ActiveWorkoutBar`, and error-boundary tests"), rerun that full list.

### 5. Wellness sub-theme — `src/components/wellness/theme/wellnessTokens.ts` (new)
Plain TypeScript constants (**not** new global CSS variables) exporting:
- A rose/lavender accent palette (e.g. `WELLNESS_ACCENT`, `WELLNESS_ACCENT_MUTED`, `WELLNESS_SURFACE_TINT`).
- Per-phase colors: `PHASE_MENSTRUAL`, `PHASE_FOLLICULAR`, `PHASE_OVULATION`, `PHASE_LUTEAL`, `PHASE_PREGNANT`.
- One variant set per app theme (light/dark/amoled) — these are consumed directly by wellness components via `useUniwind()`'s `theme` value to pick the right variant, exactly parallel to how `AddSheet.tsx` already reads `theme` locally today for its own one-off `isDarkMode` branch without adding new global CSS variables.
- **Before finalizing hex values, load and follow the `dataviz` skill's color-formula/validator guidance** for perceptual distinctness and light/dark accessibility — do not freehand-pick colors.

Scoping rule (critical — this is what keeps this a "layer on top," not a redesign): everything **outside** `src/components/wellness/` continues to read the existing global `--color-*` CSS variables unchanged — card chrome, borders, backgrounds, buttons on every screen built in Phases 2-8 keep using `useCSSVariable`/existing primitives exactly as-is. Only components under `wellness/` additionally import `wellnessTokens` for accent color, ring/glyph fills (Phase 4's `CycleRing`/`CycleBarGlyph`), and chart series colors (Phase 5's trend charts, Phase 6's `FertileWindowChart`). Go back through Phases 4-6's components built earlier and update their placeholder color values (noted as "easily swappable" in those phase files) to reference `wellnessTokens` now.

### 6. Illustration assets (small, scoped — 2-4 assets total, not a redesign)
1. **`WombScene`** (component shell already built in Phase 7, Task 12) — the only asset needing real illustration work: a trimester-scoped scene (silhouette + baby-size context). **First, check whether `react-native-svg` is already a dependency** (Victory Native pulls in Skia, not SVG — its presence is not implied). If absent, prefer pre-rendered PNG/WebP static assets (2-3 variants: light/dark, and per-trimester or one parametric scene with a swappable baby-size layer) rendered via plain `<Image>`, rather than adding a new SVG rendering dependency for one illustration. Wire the final asset(s) into the `WombScene.tsx` shell from Phase 7.
2. **`CycleRing`** (already built in Phase 4) — no new asset; it's a programmatic Skia component. Just confirm it now reads `wellnessTokens` phase colors (Task 5).
3. **`FertileWindowGlyph`** — add as a new semantic icon in `Icon.tsx` (small vector icon, egg/flower motif), not a bespoke illustration.
4. (Optional) **`BabyGrowthIcon` set** — week-by-week size-comparison icons (data already in `BABY_DEVELOPMENT` from Phase 7); small icon set if pursued, not full illustrations. Treat as a nice-to-have, not required for completion.

### 7. Thread discreet mode / terminology everywhere
Audit every screen/component built in Phases 2-8 to confirm user-facing labels derive from `useCycleMode()`'s `discreetMode`/`terminology` fields rather than hardcoded strings: `CycleHubScreen`'s header title, `AddSheet`'s new row (Task 1), `SettingsScreen`'s "Wellness" row label, and any mode-specific copy inside `CycleTodayView`/`PregnancyTodayView`/`CareHubView`. This is easy to miss piecemeal since each phase built its screens independently — this phase is the integration checkpoint that catches drift.

### 8. Documentation — `SparkyFitnessMobile/docs/women_health_api.md` (new)
Endpoint reference for `/api/v2/cycle/*` and `/api/v2/pregnancy/*` as consumed by mobile, following the per-endpoint request/response JSON block style used in `docs/measurements_api.md`.

### 9. Remaining risk items to close out
- **RLS Tier-1 owner-only, not delegatable**: confirm the delegation check performed in Phase 1 (Task 5 of `01-foundation.md`) was completed — if mobile has any "acting as a delegated/family user" auth context, confirm `useCycleMode()` reports "unavailable" for delegated sessions and that Task 2 above (`showCycleCard`) correctly hides the AddSheet row in that case, not just disables it.
- **Zod schema gap**: confirm this was not accidentally addressed mid-build (it's explicitly out of scope for this plan — flag it as a standalone follow-up ticket if not already noted elsewhere, referencing the `new-migration` skill checklist for whoever picks it up).

## Verification (end-to-end, full feature)

- Run `pnpm run validate` and the full `pnpm run test:run -- --watchman=false --runInBand` (not just touched-file tests) from `SparkyFitnessMobile/`, since this phase touches shared app-shell files (`App.tsx`, `AddSheet.tsx`, navigation contract test).
- Manually drive the complete flow: open AddSheet → tap the new wellness row (confirm it's hidden until enabled, per Task 3's discovery path) → complete onboarding → log a cycle day → view Insights → switch mode to `pregnant` in Settings → confirm `CycleHubScreen`'s Today view swaps to `PregnancyTodayView` → complete pregnancy setup → start/stop a kick session → upload a bump photo → open Care hub and confirm BirthPrep replaces DoctorReport.
- Toggle discreet mode on and confirm every visible label/icon across all screens changes accordingly (Task 7's audit), not just the AddSheet row.
- Confirm the wellness palette renders correctly and passes the `dataviz` skill's accessibility check in all three themes (light/dark/amoled).
- Confirm `WombScene` renders its final asset (not a placeholder) in both light and dark theme.
- Rerun the full AddSheet/navigation test list from `SparkyFitnessMobile/AGENTS.md` and confirm `__tests__/navigation/nativeHeaderContract.test.ts` passes with all new routes included.

## This completes the plan.

At this point the mobile app should be fully self-sufficient for cycle/pregnancy/TTC/wellness tracking with no web dependency, matching the build sequence, file structure, data layer, navigation design, and visual direction specified across `00-overview.md` through this file.
