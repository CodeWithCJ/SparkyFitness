# Phase 6 — Trying-to-Conceive (TTC) Hub

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained). Depends on Phase 1 (`01-foundation.md`), Phase 4 (`03-core-cycle.md`, `CycleTodayView`/`CycleHubScreen`), and Phase 5 (`04-insights.md`, `CycleInsightsView`) — TTC widgets are layered onto both, not built as a separate screen.

## Goal

Build the fertility/ovulation tools shown when `mode === 'ttc'`: fertility estimate card, fertile-window chart, BBT (basal body temperature) status, cervical position logging, OPK/HPT test quick-log, intercourse logging, and the "two-week-wait" countdown widget. This is the **smallest** of the four content-hub phases (Pregnancy/Core-cycle/Care/TTC) — the fertility math is already fully implemented in `shared/src/cycle/fertility.ts`; this phase is mostly small cards, not new computation.

## Background: data and math this consumes

**`cycle_daily_entries`** table already has TTC-specific columns (added in the same migration as the base table, not a separate one): `intercourse`, `intercourse_protected`, `cervical_position`, plus `cervical_mucus` (base column). These are edited via the same `GET/PUT/DELETE /api/v2/cycle/logs/:date` endpoints already wrapped in `cycleApi.ts` (Phase 1) and the same `useUpsertCycleLog.ts` mutation (Phase 4) — no new API surface for these fields, just new UI that writes to fields already present in the existing upsert payload shape.

**`cycle_test_entries`** table (new for this phase): `entry_date`, `tested_at`, `test_type: 'opk'|'hpt'`, `result` (opk: negative/low/high/peak; hpt: negative/faint/positive), `notes`. Endpoints: `GET/POST/DELETE /api/v2/cycle/tests`, `/tests/:id` — already wrapped in `cycleApi.ts` (Phase 1: `listTestEntries`, `createTestEntry`, `deleteTestEntry`).

**BBT** is stored via the existing shared "basal body temperature" custom measurement (not a cycle-domain table) — check how BBT is entered/read elsewhere in the app (likely via `measurementsApi.ts`'s custom-measurement path) and reuse that, rather than adding a new BBT storage mechanism here.

`GET /api/v2/cycle/fertility` — already wrapped in `cycleApi.ts` as `getFertility()`. This is the endpoint this entire phase's fertility card/chart consumes.

Shared pure-logic (`shared/src/cycle/fertility.ts`, import via `@workspace/shared`, do not reimplement):
- `estimateOvulation` — ovulation-date estimate.
- `detectBiphasicShift` — BBT coverline/biphasic-shift detection (feeds `BbtStatusCard`).
- `dpo` — days-past-ovulation calculation (feeds `TwoWeekWait`).
- `CONCEPTION_PROBABILITY_BY_OFFSET` — conception probability curve by cycle-day offset (feeds `FertileWindowChart`).

Query keys from Phase 1: `cycleFertilityQueryKey`, `cycleTestsQueryKey`. Invalidation rule already established: test entry CRUD invalidates `cycleTestsQueryKey` + `cycleFertilityQueryKey` (OPK/BBT results feed ovulation estimation, so a new test result should refresh the fertility estimate).

Web precedent (reference only): `src/pages/Cycle/ttc/FertilityCard.tsx`, `FertileWindowChart.tsx`, `BbtStatusCard.tsx`, `CervicalPositionPicker.tsx`, `TestQuickLog.tsx`, `IntercourseLog.tsx`, `TwoWeekWait.tsx`.

## Mobile conventions and hooks from prior phases

- `useCycleMode()` (Phase 1) is the **only** place that should decide "is TTC mode active" — every component in this phase renders conditionally based on `mode === 'ttc'`, checked once at the parent (`CycleTodayView`/`CycleInsightsView`), not re-checked redundantly inside each small card.
- These are **components, not screens** — they render inside `CycleTodayView.tsx` (Phase 4) and `CycleInsightsView.tsx` (Phase 5) via conditional sections, not a new root-stack route or a new `SegmentedControl` tab.
- Chart pattern: Victory Native + Reanimated 4, same as Phase 5's trend charts — `FertileWindowChart.tsx` should follow `WeightLineChart.tsx`'s implementation pattern (line/area chart over cycle-day offset showing conception probability).
- Cards: pattern off `MacroCard.tsx` (same as Phase 5's `CorrelationCards.tsx`).

## Tasks

### 1. `src/hooks/useCycleTests.ts` (new)
CRUD hook over `cycleApi.ts`'s `listTestEntries`, `createTestEntry`, `deleteTestEntry`, keyed by `cycleTestsQueryKey`. Mutations invalidate `cycleTestsQueryKey` + `cycleFertilityQueryKey` per the Phase 1 rule.

### 2. `src/components/wellness/ttc/FertilityCard.tsx` (new)
Main summary card: current estimated fertility status (from `cycleApi.getFertility()` + `estimateOvulation`), rendered via a query hook added to `useCycleInsights.ts` (Phase 5) or a small local `useQuery` here if that file is already closed out — either is fine, just keep the query key (`cycleFertilityQueryKey`) consistent. Pattern off `MacroCard.tsx`.

### 3. `src/components/wellness/ttc/FertileWindowChart.tsx` (new)
Chart of `CONCEPTION_PROBABILITY_BY_OFFSET` against the current cycle's estimated fertile window, pattern off `WeightLineChart.tsx` + `ChartTouchOverlay.tsx` for tap/tooltip.

### 4. `src/components/wellness/ttc/BbtStatusCard.tsx` (new)
Reads BBT history (via whatever existing custom-measurement API/hook the app uses — verify before building, see Background note above) and runs `detectBiphasicShift` to show coverline/biphasic-shift status. If no existing BBT read hook is convenient to reuse, add a thin one here rather than duplicating measurement-API logic.

### 5. `src/components/wellness/ttc/CervicalPositionPicker.tsx`, `IntercourseLog.tsx` (new)
Simple controls writing to the `cervical_position`/`intercourse`/`intercourse_protected` fields on the same daily-log upsert payload used by `CycleTodayView` (Phase 4) — these should be additional form sections rendered inside `CycleTodayView` when `mode === 'ttc'`, sharing its existing save/invalidation flow via `useUpsertCycleLog.ts` from Phase 4, not a separate save action.

### 6. `src/components/wellness/ttc/TestQuickLog.tsx` (new)
Quick-entry control for OPK/HPT test strips: test type toggle (`opk`/`hpt`), result picker (opk: negative/low/high/peak; hpt: negative/faint/positive), optional notes, timestamp. Uses `useCycleTests.ts` (Task 1) to create entries.

### 7. `src/components/wellness/ttc/TwoWeekWait.tsx` (new)
Post-ovulation, pre-test countdown/support widget using `dpo` (days-past-ovulation) from `shared/src/cycle/fertility.ts`. Purely presentational over already-fetched fertility data — no new API calls.

### 8. Wiring
In `CycleTodayView.tsx` (Phase 4) and `CycleInsightsView.tsx` (Phase 5), add conditional sections (`mode === 'ttc'` via `useCycleMode()`) that render these new components. Keep the conditional check at the top of each parent view, not scattered per-component.

## Verification
- With `mode` set to `ttc` in settings (Phase 2), confirm all TTC widgets appear in Today/Insights and disappear when mode is switched back to `standard`.
- Log an OPK test result and confirm `FertilityCard`/`FertileWindowChart` reflect the update (via the `cycleTestsQueryKey`/`cycleFertilityQueryKey` invalidation).
- Confirm `cervical_position`/`intercourse` fields save correctly as part of the existing daily-log upsert (no separate save button/state).
- Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/`.
- Add tests under `__tests__/hooks/useCycleTests.test.ts` and `__tests__/components/wellness/ttc/` for each new component.

## Next phase
`06-pregnancy.md` — the largest phase: full pregnancy tracking hub, including due-date setup, kick/contraction timers, weekly checklist, and bump photo journal.
