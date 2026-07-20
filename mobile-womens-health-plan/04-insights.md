# Phase 5 — Insights & Correlations

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained). Depends on Phase 1 (`01-foundation.md`) and Phase 4 (`03-core-cycle.md`, `CycleHubScreen` shell + real daily-log data to visualize).

## Goal

Build the "Insights" section of `CycleHubScreen`: cycle statistics, next-cycle predictions, anomaly/late-period alerts (surfaced more prominently here than the lightweight alert in Phase 4's Today view), symptom-phase correlations, and trend charts. This section is a pure consumer of shared prediction/correlation math plus the daily logs entered in Phase 4 — no new mutations, read-only.

## Background: data and math this consumes

Read endpoints, already wrapped in `cycleApi.ts` from Phase 1:
- `GET /api/v2/cycle/overview` — `cycleApi.getOverview()`
- `GET /api/v2/cycle/insights` — `cycleApi.getInsights()`
- `GET /api/v2/cycle/correlations` — `cycleApi.getCorrelations()`
- (`GET /api/v2/cycle/fertility` also exists but its UI belongs to Phase 6/TTC — don't build fertility UI here even though the endpoint is available.)

Shared pure-logic (`shared/src/cycle/`, import via `@workspace/shared`):
- `predictions.ts` — `computeCycleStats`, `predictNextCycles`, `predictionAccuracy`, `symptomPhaseMatrix`, `forecastSymptoms`, `productStats`, `detectAnomalies`, `buildCycleAlerts`. Types: `CycleStats`, `PredictedCycle`, `CyclePrediction`, `PredictionConfidence`, `RegularityLabel`.
- `correlations.ts` — `correlateMetricWithPhase`, `coachingForPhase`. Types: `MetricPoint`, `PhaseBucket`, `PhaseMean`, `CorrelationResult`, `CoachingTip`.

Web precedent (reference only): `src/pages/Cycle/CycleInsights.tsx`, `CorrelationCards.tsx`.

## Mobile conventions and hooks from prior phases

- `useCycleMode()` (Phase 1) — call for any mode-conditional copy (e.g. insight framing may differ slightly for TTC mode, though the core stats/charts are shared across modes; Phase 6 adds TTC-specific fertility insights layered on top, not replacing this section).
- Query keys from Phase 1: `cycleOverviewQueryKey`, `cycleInsightsQueryKey`, `cycleFertilityQueryKey`, `cycleCorrelationsQueryKey`. These are already invalidated by Phase 4's daily-log mutation, so this phase's queries will refresh correctly after a log entry — no new invalidation logic needed here (read-only phase).
- Charts: Victory Native (`@shopify/react-native-skia`), animated via Reanimated 4. Reuse `WeightLineChart.tsx`/`NutrientBarChart.tsx` as implementation patterns (swap data series and color props, don't rebuild the chart primitive), and the shared touch/tooltip overlay `ChartTouchOverlay.tsx`. For multiple charts shown together, pattern off `HealthTrendsPager.tsx` (swipeable multi-chart pager).
- Cards: pattern correlation/stat cards off `MacroCard.tsx`.
- This is a read-only phase — no new API clients or mutation hooks needed; only new `useQuery`-based hooks.

## Tasks

### 1. `src/hooks/useCycleInsights.ts` (new)
`useQuery` wrappers for `cycleApi.getOverview()`, `cycleApi.getInsights()`, `cycleApi.getCorrelations()`, keyed by `cycleOverviewQueryKey`, `cycleInsightsQueryKey`, `cycleCorrelationsQueryKey` respectively. Pattern off `useMeasurementsRange.ts` for the "fetch a range/aggregate, feed charts" shape. Include `useRefetchOnFocus` for each.

### 2. `src/components/wellness/CycleInsightsView.tsx` (new)
Rendered by `CycleHubScreen` when `activeTab === 'insights'` (wire this into the `SegmentedControl` switch statement started in Phase 4). Composes:
- Cycle stats summary (average cycle length, average period length, regularity label — from `computeCycleStats`/`RegularityLabel`).
- Next-cycle predictions (from `predictNextCycles`, with `PredictionConfidence` shown as a visual indicator — e.g. color or label).
- Anomaly/alert summary (from `detectAnomalies`/`buildCycleAlerts` — more detailed presentation here than Phase 4's lightweight `CycleAlerts` widget; consider whether Phase 4's component can be reused/extended rather than duplicated).
- Symptom forecasting (from `forecastSymptoms`/`symptomPhaseMatrix`) if there's enough log history — handle the "not enough data yet" empty state explicitly (this feature only becomes meaningful after multiple logged cycles).
- If multiple charts are shown together (e.g. cycle-length trend + symptom-frequency), use `HealthTrendsPager.tsx`'s swipeable-pager pattern; otherwise stack them in a scroll view.

### 3. `src/components/wellness/CorrelationCards.tsx` (new)
Pattern off `MacroCard.tsx`. Displays `correlateMetricWithPhase`/`coachingForPhase` output — e.g. "energy tends to dip during your luteal phase" style cards with a coaching tip. Uses `cycleApi.getCorrelations()` data from Task 1.

### 4. Trend charts
Cycle-length trend chart and symptom-frequency chart — reuse `WeightLineChart.tsx` (line chart pattern) and `NutrientBarChart.tsx` (bar chart pattern) directly, only swapping the data series and passing through the chart color prop each already exposes. Use `ChartTouchOverlay.tsx` for tap/tooltip behavior, don't reimplement touch handling.

## Verification
- With at least 2-3 logged cycles from Phase 4 testing, confirm stats/predictions/correlations render sensible values (spot-check `computeCycleStats`/`predictNextCycles` output against the raw logged dates).
- With 0-1 logged cycles, confirm the empty/insufficient-data state renders cleanly (no crashes on sparse data — `symptomPhaseMatrix`/`forecastSymptoms` and correlation functions should be checked for how they behave with minimal input, and the UI should reflect "not enough data yet" rather than a blank or broken chart).
- Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/`.
- Add tests under `__tests__/hooks/useCycleInsights.test.ts` and `__tests__/components/wellness/CycleInsightsView.test.tsx`, `CorrelationCards.test.tsx`.

## Next phase
`05-ttc.md` — layers Trying-to-Conceive widgets onto the Today view (Phase 4) and Insights view (this phase) via `useCycleMode()`.
