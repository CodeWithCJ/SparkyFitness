# Phase 5 — Reporting & Charts

> **Status:** ☐ not started
> **Depends on:** 1–4 (reads their data) · **Unblocks:** 7
> **Resume here:** _(update as you go)_

## Goal
Turn logged data into charts and a **provider-ready export** for doctor visits. Reuse the
existing Reports/recharts stack — don't introduce a new charting system.

## User stories
- As a user, I see nausea-vs-dose, weight-trend-vs-goal, adherence-over-time, and a (manual) cost chart.
- I see correlation cards (e.g., hydration↔constipation) with an honest confidence %.
- I export a clean PDF/CSV summary to bring to my prescriber.

## Functional spec
- Charts: **nausea vs. dose** (bars+line), **weight trend vs goal**, **adherence over time**, **manual cost** bars.
- **Correlation cards**: simple statistics (e.g., Pearson/contingency) over existing app data (food, protein, water, sleep, mood, weight, symptoms, doses). Show confidence %, label "informational." **No ML/AI claims.**
- **Provider export**: PDF + CSV — meds list, schedule, adherence, recent symptoms, weight trend, injection/titration history. Reuse export patterns already in the app.
- Charts/cards selectable via `user_medication_display_preferences`.

## Data needs
Reads `medication_entries`, `symptom_entries`, `glp1_*`, `medication_cost_entries`, plus existing food/sleep/
mood/weight tables.

## UI components
- Reuse: `pages/Reports`, `components/ui/chart.tsx`, `DateRangeWithPresets`, existing CSV/PDF export.
- New: NauseaVsDoseChart, CorrelationCard, ProviderExport.

## Acceptance criteria
- [ ] Each chart renders from real logged data across a selected range.
- [ ] At least 3 correlation cards compute with sensible confidence %.
- [ ] PDF + CSV export produce a coherent provider summary.
- [ ] `pnpm run validate` + tests pass.

## Notes
Cost chart is **manual data** — keep the "self-entered" labeling. Correlations are descriptive,
not predictive.

## Resume-here notes
_(breadcrumb)_
