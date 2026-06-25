# Medicine & GLP-1 — UI Polish Plan

The medicine + GLP-1 modules are **already built and working**. This folder is **only** about
polishing the existing UI to match the lovable mockups (`../screenshots/`) and adding the
**missing UI bits**.

## Hard constraints
- **Do not change any tabs or navigation.** In-page changes only — nothing moves between tabs.
- **No medical cost** anywhere (no cost tiles, fields, or charts).
- Reuse our design system (shadcn `components/ui/*`), recharts, and the existing **exercise
  body-map pipeline**.
- Show **only real data**; hide anything we can't back (no fake numbers).

## Tabs we touch
| Tab / page | Doc |
|---|---|
| **Medication** (`pages/Medications/`) | [phase-1-medication-tab.md](./phase-1-medication-tab.md) |
| **Reports** (`pages/Reports/MedicationReports.tsx`) | [phase-2-reports.md](./phase-2-reports.md) |
| **Check-in** (existing Check-in page) | [phase-3-checkin.md](./phase-3-checkin.md) |
| **Settings** | [phase-4-settings.md](./phase-4-settings.md) |

Untouched: Diary, Food, Exercise, Goals.

## Reusable pieces (verified)
- Body map: static `public/images/muscle-male.svg` → `getBodyMapSvg` (`src/api/Exercises/exerciseService.ts:268`)
  → clickable via `src/pages/Exercises/BodyMapFilter.tsx` (CSS on `path[class]`) + `useBodyMapSvgQuery`.
- Data already wired: `useMedications`, `useMedicationEntries`, `useSymptoms`, `useSiteSuggestion`,
  pens/titration/injection hooks; injection-site customization persists via the display-prefs
  endpoints (`/api/v2/medications/display-preferences/:viewGroup/:platform`).

## Status
- [x] **Phase 1 — Medication tab DONE & verified** (typecheck/lint/tests green)
  - [x] 1a body map · [x] 1b cabinet · [x] 1c symptoms · [x] 1d today
- [x] **Phase 2 — Reports: ALREADY IMPLEMENTED** (verified). `MedicationReports.tsx` (1182 lines)
  already has nausea-vs-dose, weight-vs-goal, adherence charts + correlation cards + customizable
  show/hide + CSV export, no cost chart. Typecheck/lint clean. Only optional remaining: provider PDF
  export (deferred). No rebuild needed — see [phase-2-reports.md](./phase-2-reports.md).
- [ ] Phase 3 — Check-in (GLP daily metrics) — see [phase-3-checkin.md](./phase-3-checkin.md)
- [x] **Phase 4 — Settings (injection-site customization) DONE & verified.** "Customize sites"
  dialog in the GLP coach (`InjectionSiteSettings.tsx`) toggles/reorders sites → saved to the
  `injection_sites` display pref; server `glp1Service.getSiteSuggestion` reads the pref and passes
  the ordered active set to `suggestNextSite`; the body map filters to active sites. Server
  typecheck + 37 tests green; frontend typecheck/lint/prettier clean.

## Phase 1 delivered — reuse these in Phases 2–4
New files (front-end, `SparkyFitnessFrontend/src/pages/Medications/`):
- `InjectionSiteBodyMap.tsx` — clickable inline-SVG body map (props: `sites?`, `selectedSiteId`,
  `suggestedSiteId`, `restingSiteIds`, `onSelect`). **Reuse for Phase 4** (pass active `sites`).
- `FastingTimer.tsx` — oral-GLP-1 countdown (localStorage-persisted).

Reusable **patterns** inside `Medications.tsx` (copy these, don't reinvent):
- **Stat-tile**: `<Card><CardContent className="flex items-center gap-3 p-4">…</CardContent></Card>` (Cabinet KPI row).
- **Adherence ring**: inline SVG `viewBox="0 0 36 36"`, two `<circle r="15.9155">`, progress via
  `strokeDasharray={`${pct}, 100`}` (Today view). **Reuse in Phase 2.**
- **14-day adherence calc** (`adherence14` useMemo): loops days, `getDueDosesForDate(meds, day)` from
  `@workspace/shared`, matches `medication_entries` status `taken`/`prn_taken`. **Reuse in Phase 2.**
- **Emoji chip grid** + **GI sub-tracker tiles** (Symptoms view) — patterns for chip grids/tiles.

Shared changes already done: `shared/src/medications/glp1.ts` now has 15 `INJECTION_SITES`
(with `svgClass`) and `suggestNextSite(recent, activeSiteIds?)` (ordered rotation). Tests in
`SparkyFitnessServer/tests/glp1Logic.test.ts` (12 pass).

Data hooks available (`src/hooks/useMedications.ts`, `useSymptoms.ts`, `useMedicationReports.ts`):
`useMedications`, `useMedicationEntries({fromDate,toDate})`, `useSymptomEntries`, `useSiteSuggestion`,
`useMedicationPens`, `useMedicationTitration`, `useMedicationInjections`, `useSerumCurve`.

## Guardrails for whoever continues (Antigravity / new session)
- Keep tabs/nav unchanged; in-page only. **No medical cost.** Real data only — hide, don't fake.
- After each file: `cd <pkg> && pnpm exec tsc --noEmit`, `pnpm exec eslint <file>`, `pnpm exec prettier --write <file>`. Server logic: `pnpm test`.
- Two known data gaps (decide before building, don't fabricate): **pill inventory/refill bar** (no
  `medication_inventory` table — recommended: add columns to `medications` later, with reminders) and
  **GLP check-in metrics storage** (Phase 3 — prefer existing `custom_measurements`).

## Out of scope
Reminder delivery + scheduler, data enrichment (RxNorm/openFDA/DailyMed/barcode), mobile,
`db_schema_backup.sql` regen.
