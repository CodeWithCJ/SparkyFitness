# Phase 4 — Settings: injection-site customization — DETAILED

**Goal:** let users customize injection sites (active/inactive + order + auto-rotate), persisted via
the **existing** display-prefs endpoints, and have the GLP-1 coach body map honor it.

## Backend already exists (verified)
- Table: `user_medication_display_preferences` (`user_id`, `view_group`, `platform`, `visible_items JSONB`, unique on the three) — created in migration `20260624000000_add_medication_glp1_schema.sql`.
- Repo: `SparkyFitnessServer/models/medicationDisplayPreferenceRepository.ts`.
- Routes (in `routes/v2/medicationRoutes.ts`): `GET /api/v2/medications/display-preferences` and `PUT /api/v2/medications/display-preferences/:viewGroup/:platform`.
- We'll use `view_group = 'injection_sites'`, `platform = 'web'`, `visible_items = ["<ordered active site ids>"]`.

## Shared logic already supports it
- `shared/src/medications/glp1.ts`:
  - `INJECTION_SITES` = 15 sites, each `{ id, label, region, side, svgClass }`.
  - `suggestNextSite(recent, activeSiteIds?)` — **already accepts an optional ordered active-site list** and rotates through it, skipping resting (<`SITE_REST_DAYS`). Default = all sites except `unknown`.

## Tasks
### A. Frontend hook (check first if it already exists in `src/api/Medications/medicationService.ts`)
Add `useMedicationDisplayPreferences(viewGroup)` + a `useUpdateDisplayPreferencesMutation` calling
the endpoints above (pattern: copy an existing query/mutation from `src/hooks/useMedications.ts`).

### B. Settings UI
- Add a section in Settings (find the Settings page under `src/pages/Settings/`) OR a sub-dialog
  opened from the GLP coach. Render the 15 `INJECTION_SITES`:
  - a checkbox/switch per site (active/inactive),
  - drag-reorder (use an existing dnd util in the repo if present; otherwise up/down arrows — simpler, no new dep),
  - an "Auto-rotate scheduled shots through active sites" switch.
- Save → `PUT .../display-preferences/injection_sites/web` with `visible_items = [orderedActiveIds]`.

### C. Make the body map + suggestion honor it
- **Server** `SparkyFitnessServer/services/glp1Service.ts#getSiteSuggestion`: load the user's
  `injection_sites` prefs via `medicationDisplayPreferenceRepository`, pass the ordered active ids as
  the 2nd arg to `suggestNextSite(recent, activeSiteIds)`. Also return the active list so the client can filter.
- **Client** `src/pages/Medications/InjectionSiteBodyMap.tsx` already accepts a `sites` prop
  (defaults to all non-unknown). Pass the user's active sites so inactive zones are hidden/dimmed.
  `Glp1Coach.tsx` renders `<InjectionSiteBodyMap sites={activeSites} .../>`.

## Acceptance
- Toggling/reordering sites in Settings persists across reload (GET returns saved `visible_items`).
- The GLP coach body map shows only active sites and its green "suggested" zone follows the saved order/rotation.
- Add/extend a server test in `tests/glp1Logic.test.ts` (rotation already tested) + a route test for the display-prefs GET/PUT if missing.
- Typecheck/lint/prettier clean; `cd SparkyFitnessServer && pnpm test` green.
