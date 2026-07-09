# New Domain Template

Use this checklist when adding a major feature area (e.g., symptom tracking, workout planning). It's a superset of the new-migration checklist, focused on coordinating across all three packages.

## Phase 1: Plan & Schemas (Before Code)

- [ ] Clarify the **permission type** it falls under (diary, checkin, reports, or new?)
- [ ] Define tables in SQL (spike/schema sketch)
- [ ] Create Zod schemas:
  - `shared/src/schemas/database/<Table>.zod.ts` for each table
  - `shared/src/schemas/api/<DomainName>.api.zod.ts` for request/response contracts
  - Export both from `shared/src/index.ts`
- [ ] Cross-check with existing patterns in `shared/src/schemas/` — don't invent new shapes

## Phase 2: Server Infrastructure

- [ ] Create migration in `SparkyFitnessServer/db/migrations/YYYYMMDDHHMMSS_<feature>.sql`
- [ ] Add RLS policies to `db/rls_policies.sql` checking the permission type
- [ ] Add/update security tier in `docs/content/8.developer/11.database-security-tiers.md` (Tier 1/2/3)
- [ ] Create route file `routes/v2/<Domain>Routes.ts` or `routes/<domain>Routes.ts`
  - Use `checkPermissionMiddleware(permissionType)` to guard write endpoints
  - Import Zod schemas from `../schemas/` and shared
  - Add JSDoc Swagger comments for `/api/api-docs/swagger`
- [ ] Create service `services/<Domain>Service.ts` — orchestration + business logic
- [ ] Create repository `models/<Domain>Repository.ts` — uses `getClient()`, query-only
- [ ] Write tests in `tests/<domain>*.test.ts` covering:
  - Happy path CRUD
  - Permission delegation (diary user can log, checkin delegate cannot write, etc.)
  - RLS row filtering (delegate sees only shared data)
- [ ] Run `pnpm start` to verify migrations apply, RLS reapplies, no startup errors
- [ ] Run `pnpm run validate` and tests pass

## Phase 3: Frontend Integration

- [ ] Create domain folder `src/pages/<Domain>/`
- [ ] Create domain API client `src/api/<Domain>/`
- [ ] Create domain hooks `src/hooks/<Domain>/` (TanStack Query hooks)
- [ ] Wire up routes in `App.tsx` if there's a new page
- [ ] Test that queries work against the running server
- [ ] Update root `AGENTS.md` if adding a new Quick Routing entry
- [ ] Run `pnpm run validate` and tests

## Phase 4: Mobile Integration

- [ ] If the domain is data the user should be able to sync (health, food, exercise):
  - Create API client `src/services/api/<Domain>Api.ts`
  - Wire into background sync if needed
  - Add tests
- [ ] If there's a UI (e.g., settings or entry screen):
  - Create screens and hooks
  - Ensure it integrates with theme/auth/navigation
- [ ] Run `pnpm run validate` and tests

## Phase 5: Documentation & Cross-Package Validation

- [ ] Update `docs/content/2.features/` with user-facing feature description
- [ ] Update root `AGENTS.md` with new domain in Source Map and Quick Routing
- [ ] Update package guides (frontend, server, mobile) if adding a complex pattern
- [ ] Set the `Last updated` date
- [ ] Run `pnpm run validate` in all three packages (server, frontend, mobile)
- [ ] Run full test suite `pnpm test` in each
- [ ] Commit with message: "Add <Feature> domain: server routes + RLS + shared schemas + frontend/mobile integration"

## Common Gotchas

1. **Schema location isn't uniform** — Not every domain has a `shared/src/schemas/database/<Table>.zod.ts` file. Medications, for example, keep their shared schemas as hand-written modules under `shared/src/medications/` (`schedules.ts`, `correlations.ts`, `symptoms.ts`, `glp1.ts`), exported from `shared/src/index.ts`. Follow the closest existing domain rather than assuming a single convention.
2. **Permission type TBD** — If you're unsure whether new data should fall under `diary` or `checkin`, ask in the PR. Picking wrong breaks delegation tests. Owner-only domains (cycle, pregnancy) skip delegation entirely.
3. **RLS policy forgot the permission check** — The policy must resolve the permission through `can_access_user_data(...)` (or a domain helper like `has_medication_access`), or delegation breaks silently. There is no generic `get_permission` function.
4. **Frontend-only domain** — If a domain has no server persistence (just UI state), it doesn't need migrations/RLS. But it still needs to be in `AGENTS.md` Quick Routing.
5. **Mobile-only sync** — If background sync uploads the data, include `POST /api/<domain>` chunking logic and `healthDataApi.ts` patterns; don't invent a new upload flow.

## Reference Examples

- **Foods domain** — full-stack feature with nutrition, barcode search, multiple providers
- **Fasting domain** — simpler: just entry logging and timer; guarded by the `checkin` permission (`routes/fastingRoutes.ts`)
- **Medications** — complex: entry + symptom tracking + reporting; guarded by the `medications` permission (with `medications_read` for read-only delegation)
- **Cycle/Pregnancy** — owner-only (no delegation); check their guides in mobile/frontend for patterns specific to cyclical/timeline data
