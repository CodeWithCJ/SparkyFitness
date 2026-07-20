# Phase 4 — Core Cycle: Hub Shell, Today/Log, Calendar

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained). Depends on Phase 1 (`01-foundation.md`, API/hooks) and Phase 2-3 (`02-settings-onboarding.md`, settings + onboarding gate).

## Goal

Build `CycleHubScreen` — the single root-stack screen hosting the entire Today/Insights/Care experience — plus its "Today" section for standard/TTC modes: daily log entry, phase-colored calendar, cycle history, and the visual glyphs (ring/bar/icon) used throughout the feature. This is the largest, most-reused surface in the whole feature; later phases (Insights, TTC, Pregnancy, Care) all render inside or alongside what's built here.

## Background: data and math this consumes

`cycle_daily_entries` table (unique on `user_id, entry_date`) via `GET/PUT/DELETE /api/v2/cycle/logs/:date` and bulk `PUT /api/v2/cycle/logs` (already wrapped in `cycleApi.ts` from Phase 1): `entry_date`, `flow_level` ('none'|'spotting'|'light'|'medium'|'heavy'), `product_usage JSONB`, `cervical_mucus`, `unusual_discharge string[]`, `energy`/`libido` (1-5), `notes`, `custom_fields JSONB`. (TTC-specific fields `intercourse`, `intercourse_protected`, `cervical_position` also live on this table but their UI belongs to Phase 6/TTC hub, conditionally rendered here.)

`cycles` table (period history, unique on `user_id, start_date`) via `GET/POST/PUT/DELETE /api/v2/cycle/cycles`: `start_date`, `end_date`, `period_length`, `cycle_length`, `is_excluded`, `source: 'derived'|'manual'`.

Shared pure-logic (import from `@workspace/shared`, do not reimplement):
- `shared/src/cycle/predictions.ts` — `deriveCycles`, `computeCycleStats`, `phaseForDay`, `latePeriodStatus`, `buildCalendarMonth`, `buildCycleAlerts`, `isPeriodDay`. (`predictNextCycles`, `predictionAccuracy`, `symptomPhaseMatrix`, `forecastSymptoms`, `productStats`, `detectAnomalies` are used in Phase 5/Insights, not here — but they live in the same file.)
- `shared/src/cycle/types.ts` — `FlowLevel`, `CyclePhase`, `SharedCycleDailyLog`, `SharedCycle`, `DerivedCycle`, `CycleStats`, `DayEvidence`.
- `shared/src/cycle/constants.ts` — `FLOW_LEVELS` (+ `isPeriodEvidenceFlow`), `SYMPTOM_CATEGORY_COLOR`, symptom category definitions.

Web precedent (reference only): `src/pages/Cycle/CyclePage.tsx` (standalone `/cycle` route, gates on `enabled`/`onboarded_at`, 3 tabs Log/Insights/Care, Today view swaps by mode), `CycleToday.tsx`, `CycleCalendar.tsx`, `CycleAlerts.tsx`, `CycleHistoryList.tsx`, `DailyLogPanel.tsx`, `CycleSymptomPicker.tsx`, `CycleRing.tsx`/`CycleBarGlyph.tsx`/`CycleIcon.tsx`.

## Mobile conventions and hooks from prior phases

- From Phase 1: `useCycleMode()` returns `{ mode, enabled, discreetMode, terminology, isLoading }` — call this, don't re-derive mode elsewhere. Query keys `cycleLogQueryKey(date)`, `cycleLogsRangeQueryKey(start, end)`, `cyclesQueryKey` already defined in `src/hooks/queryKeys.ts`.
- Navigation: React Navigation 7, not expo-router. `RootStackParamList` lives in `src/types/navigation.ts`. Screens register in `App.tsx` via `<Stack.Screen>` + `createStackScreenOptions(...)`, wrapped with `withErrorBoundary`. Headers via `useScreenHeader(config)` — one owner per screen, exactly one `kind: 'primary'` action.
- UI primitives to reuse (do not rebuild): `ui/Button.tsx`, `FormInput.tsx`, `SettingsRow`/`SettingsRowGroup`, `SegmentedControl.tsx`, `StepperInput.tsx`, `BottomSheetPicker.tsx`, `CalendarSheet.tsx` (calendar grid primitive, uses `FullWindowOverlay` on iOS), `FormScreenChrome.tsx` (sticky-footer form chrome).
- Charts/glyphs are Skia + Reanimated 4 (`ProgressRing.tsx`, `MacroCompositionRing.tsx` are the implementation pattern to copy: `useSharedValue`/`useDerivedValue`, never Skia's own deprecated animation API).
- TanStack Query 5, `staleTime: Infinity` — every mutation here (daily log upsert) must invalidate per the rules from Phase 1: `cycleLogQueryKey(date)`, any `cycleLogsRangeQueryKey` covering that date, `cyclesQueryKey`, `cycleOverviewQueryKey`, `cycleInsightsQueryKey`, `cycleFertilityQueryKey` (a log entry can shift derived-cycle boundaries and predictions — this is the widest blast-radius mutation in the whole feature).
- `useRefetchOnFocus(refetch, enabled)` is the standard focus-refresh hook.

## Navigation design (why one screen, not three)

Add to `RootStackParamList` in `src/types/navigation.ts`:
```ts
CycleHub: { initialTab?: 'today' | 'insights' | 'care' } | undefined;
```
`CycleHubScreen.tsx` (`src/screens/`) is the **only** root-stack route for the entire Today/Insights/Care experience. It owns the header via `useScreenHeader` (title adapts to `mode`/`discreet_mode` from `useCycleMode()`), and renders a `SegmentedControl` (Today / Insights / Care) below the header, holding `activeTab` as local screen state — **not** separate pushed routes and **not** a nested navigator. Today/Insights/Care are peer views over the same data, not a linear flow, so a nested navigator (like the existing `FoodPhotoFlowParamList` pattern) would only add header-contract wiring for no benefit. This matches how `FastingDetailScreen` renders multiple sections under one header rather than as separate pushed screens, and how `DiaryScreen` renders sub-controls below its own header.

Because of this, the components built in this phase are named as **views, not screens**, and live under `src/components/wellness/`, not `src/screens/`:
- `CycleTodayView.tsx` — rendered when `activeTab === 'today'` and `mode` is `standard`/`ttc` (Phase 7 adds `PregnancyTodayView` as the alternate branch when mode is `pregnant`/`postpartum`; that branching happens in `CycleHubScreen`, not duplicated per view).
- Insights and Care views are built in Phases 5 and 8 respectively; `CycleHubScreen`'s `SegmentedControl` switch statement should be written now to route to all three, with Insights/Care rendering a simple placeholder until those phases land (or build `CycleHubScreen`'s switch to only include `today` initially and extend it in Phases 5/8 — either is fine as long as the final wiring matches this contract).

## Tasks

### 1. `src/screens/CycleHubScreen.tsx` (new)
Root-stack screen. On mount, checks `useCycleMode()`: if `!enabled || onboarded_at` is unset, navigate to `CycleOnboarding` instead of rendering the hub (mirrors web's `CyclePage` gate). Otherwise renders header (`useScreenHeader`, title from mode/discreet_mode) + `SegmentedControl` (Today/Insights/Care) + the active view component.

### 2. `src/components/wellness/CycleTodayView.tsx` (new)
Daily log form for the selected date (default today): flow level selector, symptom picker, BBT entry point (BBT itself is stored via the existing shared "basal body temperature" custom measurement — check how that measurement is entered elsewhere in the app, e.g. via `measurementsApi.ts`/`MeasurementsAddScreen.tsx`, and either deep-link to it or embed an equivalent lightweight input here), notes field. Pattern the form layout off `MeasurementsAddScreen.tsx` + `FormScreenChrome.tsx` (sticky-footer save). Save action calls the daily-log upsert mutation (see Task 6) with the invalidation rules above. Leave a conditional slot for TTC widgets (`mode === 'ttc'`) to be filled in by Phase 6 — do not build TTC UI here, just ensure the view can host it via `useCycleMode()`.

### 3. `src/components/wellness/CycleSymptomPicker.tsx` (new)
Multi-select chip control over the symptom catalog in `shared/src/cycle/constants.ts` (`SYMPTOM_CATEGORY_COLOR` + symptom defs). Check the codebase for any existing reusable multi-select chip pattern (e.g. filter chips in exercise/food search) before building a new one from scratch.

### 4. `src/components/wellness/CycleCalendarGrid.tsx` (new)
Wraps `CalendarSheet.tsx`'s calendar grid primitive, extended with phase-colored day cells. Use `shared/src/cycle/predictions.ts`'s `buildCalendarMonth` + `phaseForDay` to compute per-day phase/color, and `isPeriodDay` to mark period days. This is a custom render on top of `CalendarSheet`, not a stock feature of it — build it as its own wrapper component.

### 5. `src/components/wellness/CycleRing.tsx`, `CycleBarGlyph.tsx`, `CycleIcon.tsx` (new)
Skia-based glyphs. `CycleRing` (circular 28-day-cycle glyph with current-day marker + phase color bands) should be built as a programmatic Skia component (arcs colored per phase, Reanimated-driven `useDerivedValue`), directly reusing the `ProgressRing.tsx`/`MacroCompositionRing.tsx` implementation approach — this is a reskin of an existing chart primitive, not a new rendering pipeline. Colors: use existing theme tokens for now (the dedicated wellness palette is Phase 9 polish — do not block this phase on it, but leave the color values easily swappable, e.g. a small local constants object at the top of the file).

### 6. Hooks (`src/hooks/`)
- `useCycleLogs.ts` (new) — list/get daily logs, pattern off `useMeasurements.ts` (`useQuery` + `useRefetchOnFocus`).
- `useUpsertCycleLog.ts` (new) — mutation, pattern off `useUpsertCheckIn.ts`; implements the full invalidation list above.
- Both consume `cycleApi.ts` from Phase 1 (`getLog`, `putLog`, `deleteLog`, `bulkPutLogs`, `listLogs`).

### 7. `src/components/wellness/CycleAlerts.tsx`, `CycleHistoryList.tsx`, `DailyLogPanel.tsx` (new)
- `CycleAlerts.tsx` — surfaces output of `buildCycleAlerts`/`latePeriodStatus` from `shared/src/cycle/predictions.ts` (e.g. "period is late," "cycle irregular").
- `CycleHistoryList.tsx` — list of past `cycles` rows (manual + derived), with manual create/edit/delete via the `cycles` CRUD endpoints (already in `cycleApi.ts`).
- `DailyLogPanel.tsx` — if `CycleTodayView`'s form grows large, extract the actual field-editing panel into this component so `CycleTodayView` stays a thin container; otherwise this can be merged into `CycleTodayView` directly — use judgment based on resulting file size/readability, both are acceptable outcomes.

## Verification
- Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/`.
- Manually: open `CycleHubScreen` with a fresh account (unset `onboarded_at`) and confirm it redirects to onboarding; complete onboarding and confirm it lands back on the hub's Today tab.
- Log a full day's entry (flow + symptoms + notes), confirm it persists (refetch on focus, or navigate away and back) and appears in `CycleCalendarGrid` with correct phase coloring.
- Create a manual cycle entry via `CycleHistoryList` and confirm it round-trips.
- Confirm `CycleRing`/`CycleBarGlyph` render without dropped frames on a mid-tier device/simulator (Skia+Reanimated perf sanity check).
- Add tests under `__tests__/screens/CycleHubScreen.test.tsx` and `__tests__/components/wellness/` for each new component.

## Next phase
`04-insights.md` — builds the Insights section (stats, predictions, correlations, trend charts) consuming the log data entered here.
