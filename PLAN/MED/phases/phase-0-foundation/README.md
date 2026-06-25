# Phase 0 — Foundation

> **Status:** ☐ not started
> **Depends on:** nothing · **Unblocks:** all other phases
> **Resume here:** _(update this line as you go — e.g. "schema migrated, RLS done, working on API skeleton")_

## Goal
Stand up the schema, navigation entry, and API skeleton so every later phase has solid,
**extensible** ground to build on. No user-visible features yet (ships dark behind a flag).

## User stories
- As a developer, I can create/read a medication via `/api/medications` with owner-isolated RLS.
- As a user, I can toggle the Medications module on in Settings (off by default).

## Functional spec
- Lookup tables `medication_types`, `medication_schedule_types`, `medication_route_types` — seeded, FK-referenced, user-extensible (per `external_provider_types` precedent).
- Core tables `medications`, `medication_schedules`, `medication_entries`, `medication_inventory`, `medication_cost_entries` with `source`, `custom_fields JSONB`, audit timestamps, cascading deletes. (See [`../../02-data-model.md`](../../02-data-model.md).)
- Owner-centric RLS + family/on-behalf-of, **default `shared_with='private'`**.
- `/medications` route + nav tab in `MainLayout.tsx` (desktop + mobile), behind a feature flag.
- Shared types in `shared/` (`@workspace/shared`).
- Med tables included in `backup_settings` export/import.

## Data needs
All core + lookup tables above; `user_medication_display_preferences`. New migration(s) in
`SparkyFitnessServer/db/migrations/`; update `rls_policies.sql`; regenerate `db_schema_backup.sql`.

## UI components
- New: `pages/Medications/` shell + sub-tab scaffold; Settings toggle.
- Reuse: `MainLayout` tab pattern, i18n `t()`, lucide icons.

## Acceptance criteria
- [ ] Migrations apply cleanly; `db_schema_backup.sql` regenerated.
- [ ] Lookup tables seeded; a user can add a custom type.
- [ ] CRUD on `/api/medications` works with RLS (user A can't see user B's meds).
- [ ] Nav tab appears only when the feature flag is on.
- [ ] `pnpm run validate` + `pnpm test` pass in server and frontend.

## Resume-here notes
_(leave a breadcrumb when pausing)_
