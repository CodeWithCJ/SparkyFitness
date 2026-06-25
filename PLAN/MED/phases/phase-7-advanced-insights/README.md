# Phase 7 — Advanced Insights (trimmed to feasible)

> **Status:** ☐ not started
> **Depends on:** 1–6 + existing app data · **Unblocks:** —
> **Resume here:** _(update as you go)_

## Goal
The "eye-and-mouth-dropping" layer — but only the parts buildable self-hosted without hardware,
ML services, or external cohorts. Mostly deeper analysis over data the app already has.

## In scope
- **Static clinical-trial reference lines**: overlay the user's weight trend against published
  STEP-1 (semaglutide) and SURMOUNT-1 (tirzepatide) curves. Numbers baked in; **no live service**.
- **Deeper correlation engine**: extend Phase 5 across the full data set (food, protein, water,
  sleep, mood, weight, exercise, doses, symptoms, vitals). Ranked, honest confidence %, descriptive.
- **Manual glucose module (optional)**: user-entered glucose values + simple charts. **No CGM, no forecasting.**
- **Lifestyle/adherence scoring**: optional composite score from existing metrics (transparent formula).

## Explicitly cut (document as out-of-scope)
- 🔴 Live community cohort / differential-privacy percentiles.
- 🔴 CGM hardware integration + glucose **forecasting**.
- 🔴 Real-time insurance / PA-approval / pharmacy-stock / RX pricing.
- 🔴 Any heavy ML prediction engine.

## Data needs
Reads everything; optional `glucose_logs` (manual) or reuse `custom_measurements`.

## UI components
- Reuse: Reports/recharts, correlation cards from Phase 5.
- New: TrialBenchmarkChart (static overlay), GlucoseManualEntry (optional).

## Acceptance criteria
- [ ] Trial benchmark overlay renders against the user's real weight trend.
- [ ] Correlation engine ranks patterns across the full dataset with confidence %.
- [ ] (If built) manual glucose entry + chart works; no external/CGM dependency.
- [ ] Cut items remain documented as out-of-scope.
- [ ] `pnpm run validate` + tests pass.

## Resume-here notes
_(breadcrumb)_
