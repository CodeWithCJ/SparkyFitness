# Phase 2 — Reports tab (medication insights) — DETAILED

**Goal:** polish the medication insights inside our existing **Reports** tab to match the mockup
"Insights" screen. No new tab. **No cost chart.** Real data only.

## Where it lives
- Page: `SparkyFitnessFrontend/src/pages/Reports/MedicationReports.tsx` (already exists, built by Gemini).
- Data hook: `SparkyFitnessFrontend/src/hooks/useMedicationReports.ts` + `src/api/Medications/medicationReportService.ts`.
- **First step for whoever continues:** open those 3 files and list what charts/data already exist before changing anything.

## Hard constraints (same as all phases)
- Don't change tabs/nav. In-page only.
- Reuse shadcn `components/ui/*` + recharts (already used in `Glp1Coach.tsx` PK chart, import style: `import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'`).
- Show only real data; hide anything without backing data (no fake numbers).

## Tasks
1. **Nausea-vs-dose chart** — bars = symptom severity, line = GLP-1 dose over time. Data: `useSymptomEntries({fromDate,toDate})` (severity, logged_at, symptom_name_snapshot filtered to 'Nausea') + injection doses from `useMedicationInjections(medId)` or `medication_entries` dose snapshots. Use a recharts `ComposedChart` (Bar + Line).
2. **Weight-trend-vs-goal** — reuse the app's existing weight/measurement data (look for `useMeasurements`/weight hooks already used by other Reports cards) and the user's goal. Line chart with a dashed goal/target line (recharts `ReferenceLine`).
3. **Adherence ring (+ per-med %)** — reuse the **inline-SVG ring pattern from Phase 1d** (see `Medications.tsx` Today view: `<svg viewBox="0 0 36 36">` two circles + `strokeDasharray={`${pct}, 100`}`). Compute 14/30-day adherence with the **`adherence14` useMemo pattern** in `Medications.tsx` (loops days via `getDueDosesForDate(meds, dayStr)` from `@workspace/shared` and matches `medication_entries` with status `taken`/`prn_taken`). Add a per-med breakdown list with each med's %.
4. **Layout** to match the mock: cards in a responsive grid, section titles, legends. Keep our theme tokens.

## Out (do not build)
- **No cost chart.**
- Provider-ready PDF/CSV export → later phase (note as TODO).
- Glucose forecasting, community cohort → cut.

## Acceptance
- Charts render from real logged data, match mock layout, live inside the Reports tab.
- `cd SparkyFitnessFrontend && pnpm exec tsc --noEmit` clean; `pnpm exec eslint src/pages/Reports/MedicationReports.tsx` clean; `pnpm exec prettier --write` the file.
