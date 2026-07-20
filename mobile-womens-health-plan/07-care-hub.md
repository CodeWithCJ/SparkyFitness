# Phase 8 — Care Hub

Part of the "Port Cycle / Pregnancy / TTC / Wellness Feature to SparkyFitnessMobile" plan (`mobile-womens-health-plan/00-overview.md` is the master index; this file is self-contained). Depends on Phase 1 (`01-foundation.md`), Phase 4 (`03-core-cycle.md`, `CycleHubScreen` shell), and Phase 7 (`06-pregnancy.md`, `usePregnancy` hook — this hub's BirthPrep-vs-DoctorReport branch checks pregnancy status).

## Goal

Build the "Care" section of `CycleHubScreen`: an educational article library, appointment scheduling/tracking, and either a birth-prep tool (pregnant mode) or a doctor-visit report exporter (all other modes). This is the third-largest content-hub phase — mostly reuses existing list/form patterns, with BirthPrep and DoctorReport being the only genuinely new interaction patterns.

## Background: data and math this consumes

**`health_appointments`** table: `pregnancy_id` (nullable — appointments can exist without an active pregnancy, e.g. a gynecology checkup in standard mode), `scheduled_at`, `appointment_type`, `title`, `location`, `notes`, `outcome JSONB`. Endpoints: `POST/PUT/GET/DELETE /api/v2/pregnancy/appointments`, `/appointments/:id` — already wrapped in `pregnancyApi.ts` from Phase 1, despite living under the `/pregnancy` route prefix (this table is shared across all modes, not pregnancy-exclusive).

Shared pure-logic (`shared/src/cycle/content.ts`, import via `@workspace/shared`, do not reimplement):
- `CYCLE_ARTICLES` (+ `articlesForMode(mode)`, `featuredArticle`) — educational article content, filtered by current mode.
- `detectConditionFlags` — flags relevant articles/content based on `cycle_settings.conditions`.
- Postpartum/menopause symptom lists.
- `BIRTH_PLAN_QUESTIONS`, `HOSPITAL_BAG_ITEMS` — birth-prep content (pregnant mode only).

This is mostly **static, local content** — `articlesForMode`, `BIRTH_PLAN_QUESTIONS`, `HOSPITAL_BAG_ITEMS` are plain synchronous imports, not API calls. Only appointments need a network round-trip.

Query keys from Phase 1: `pregnancyAppointmentsQueryKey`. No new invalidation rules beyond standard CRUD-invalidates-its-own-list.

Web precedent (reference only): `src/pages/Cycle/care/CareHub.tsx` (shows `BirthPrep` if `mode === 'pregnant'` else `DoctorReport`), `ArticleLibrary.tsx`, `AppointmentsPanel.tsx`, `BirthPrep.tsx`, `DoctorReport.tsx`.

## Mobile conventions and hooks from prior phases

- `useCycleMode()` (Phase 1) decides the BirthPrep-vs-DoctorReport branch (`mode === 'pregnant'` → BirthPrep, else → DoctorReport). Combine with `usePregnancy()`'s current-pregnancy query (Phase 7) if the branch should also consider whether an active pregnancy record exists (e.g. `postpartum` mode with no active pregnancy might still want DoctorReport rather than BirthPrep) — check web's `CareHub.tsx` for its exact branch condition and port it faithfully rather than guessing.
- Internal sub-tabs (Articles/Appointments/BirthPrep-or-DoctorReport): use `SegmentedControl.tsx`, same pattern as `CycleHubScreen`'s top-level Today/Insights/Care switch (Phase 4) — nested one level, still local component state, not nested routes.
- List rows: pattern `ArticleLibrary.tsx` off `LibraryScreen.tsx` list rows; pattern `AppointmentsPanel.tsx`'s CRUD list off `WorkoutPresetsLibraryScreen.tsx`'s list+add+edit flow.
- Checklist rows (hospital bag): pattern off `SettingsRow`/Phase 7's `WeeklyChecklist.tsx` pattern (checkbox rows) — this is the same interaction shape as Phase 7's pregnancy checklist, just over static `HOSPITAL_BAG_ITEMS` content instead of server-persisted `pregnancy_checklist_state` (decide whether hospital-bag-item completion should also persist server-side via the same checklist table with a distinct `template_key`, or remain local-only state — check web's `BirthPrep.tsx` for which approach it takes and port that behavior, since this affects whether checked items survive app reinstall).
- Q&A form (birth plan questions): pattern off `FormInput`/`FormScreenChrome`.
- Report/export view (`DoctorReport`): if a shareable text/PDF summary is needed, check `src/services/diagnosticReportService.ts` for the existing report-generation approach in this app and reuse its export mechanism rather than building a new one; otherwise a simple scrollable read-only summary screen is sufficient.

## Tasks

### 1. `src/hooks/useHealthAppointments.ts` (new)
CRUD hook over `pregnancyApi.ts`'s appointment endpoints, keyed by `pregnancyAppointmentsQueryKey`.

### 2. `src/components/wellness/care/CareHubView.tsx` (new)
Rendered by `CycleHubScreen` when `activeTab === 'care'` (completing the `SegmentedControl` switch statement started in Phase 4). Internal `SegmentedControl` for Articles/Appointments/[BirthPrep or DoctorReport], with the third tab's content decided by `useCycleMode()` (+ `usePregnancy()` if needed per the Background note above).

### 3. `src/components/wellness/care/ArticleLibrary.tsx` (new)
List view over `articlesForMode(mode)` from `shared/src/cycle/content.ts`, pattern off `LibraryScreen.tsx` list rows. Article detail can be a simple in-place expand or a lightweight modal — no new root-stack route needed for this (content is static and small).

### 4. `src/components/wellness/care/AppointmentsPanel.tsx` (new)
CRUD list (create/edit/delete appointments with date/time, type, location, notes, and optional `outcome` capture after the appointment), pattern off `WorkoutPresetsLibraryScreen.tsx`'s list+add+edit flow. Backed by `useHealthAppointments.ts` (Task 1).

### 5. `src/components/wellness/care/BirthPrep.tsx` (new, pregnant mode)
Birth plan Q&A form over `BIRTH_PLAN_QUESTIONS` (`FormInput`/`FormScreenChrome`) + hospital bag checklist over `HOSPITAL_BAG_ITEMS` (checkbox rows, pattern off Phase 7's `WeeklyChecklist.tsx`). Confirm with web's `BirthPrep.tsx` whether checklist completion should persist server-side (via `pregnancy_checklist_state` with a distinct `template_key`) or stay local — match that behavior.

### 6. `src/components/wellness/care/DoctorReport.tsx` (new, non-pregnant modes)
Read-only exportable summary (cycle history, symptom patterns, relevant flags from `detectConditionFlags`) intended to be shared with a doctor. Reuse `diagnosticReportService.ts`'s export mechanism if it fits, or a simple scrollable summary with a share action otherwise.

## Verification
- With mode `pregnant`, confirm Care hub's third tab shows BirthPrep; with `standard`/`ttc`/`postpartum`/`menopause`, confirm it shows DoctorReport (verify the exact branch condition matches web's `CareHub.tsx`, especially for `postpartum`).
- Create, edit, and delete an appointment; confirm it persists and appears correctly ordered by `scheduled_at`.
- Complete a hospital-bag checklist item and confirm its persistence behavior matches what was decided in Task 5.
- Confirm `ArticleLibrary` filters correctly by mode (e.g. TTC-relevant articles don't appear in `standard` mode if `articlesForMode` excludes them).
- Run `pnpm run validate` and `pnpm run test:run -- --watchman=false --runInBand` from `SparkyFitnessMobile/`.
- Add tests under `__tests__/hooks/useHealthAppointments.test.ts` and `__tests__/components/wellness/care/` for each new component.

## Next phase
`08-navigation-polish.md` — wires the AddSheet entry point, adds the wellness sub-theme (palette + illustrations), threads discreet mode everywhere, updates navigation contract tests, and adds docs.
