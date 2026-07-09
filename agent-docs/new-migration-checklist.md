# New Migration / New Table Checklist

Follow this checklist whenever you add or change a server database migration — especially when creating a new table or changing user-visible access behavior. Work through every step in order; the most common review failure in this repo is a new table missing one of these.

## 1. Create the migration

- [ ] Create the migration in `SparkyFitnessServer/db/migrations/` named `YYYYMMDDHHMMSS_description.sql`.
- [ ] Do not invent alternate migration mechanisms; server startup applies pending migrations and then reapplies RLS policies.

## 2. Update Row-Level Security (required for every new table)

- [ ] Add or update policies in `SparkyFitnessServer/db/rls_policies.sql`.
- [ ] Decide who can read/write rows: owner only (like cycle/pregnancy), family-shared (which delegatable permission: `diary`, `checkin`, `medications`, or `reports`?), or system/admin. Prefer an existing `create_*_policy(...)` generator in `rls_policies.sql`.
- [ ] Remember `getClient(userId, authenticatedUserId?)` sets the RLS context; `getSystemClient()` bypasses RLS and is only for admin/startup/migration work.

## 3. Boot server and let migration apply

- [ ] **Restart the server** (`pnpm start` from `SparkyFitnessServer/`).
- [ ] Confirm the migration applies cleanly and RLS policies reapply without errors.
- [ ] Check server logs for any migration failures.

## 4. Sync the schema backup (automatic)

- [ ] **Run the backup script** to sync `db_schema_backup.sql` with the live schema:
  - **Mac/Linux:** `./db_backup.sh` (from repo root)
  - **Windows:** `DB Backup.cmd` (from repo root)
- [ ] Both scripts read `.env`, connect to the database, and overwrite `db_schema_backup.sql` with the current schema.
- [ ] Commit the updated `db_schema_backup.sql` in the same PR.

## 5. Add Zod schema

- [ ] Add or update the table's Zod schema in `shared/src/schemas/database/<Table>.zod.ts`.
- [ ] Export it from `shared/src/index.ts`.
- [ ] If the table backs an API, create/update the request/response schema in `shared/src/schemas/api/<DomainName>.api.zod.ts`.

## 6. Documentation

- [ ] Update `docs/content/2.features/9.family-friends-sharing.md` (user-facing sharing behavior).
- [ ] Update `docs/content/8.developer/11.database-security-tiers.md`: add the table with its permission type and classify as Tier 1, Tier 2, or Tier 3.
- [ ] Update `docs/content/8.developer/4.database.md` table index if adding a new domain category.

## 7. Downstream contracts

- [ ] If the table backs an API: create/update route (+ Zod route schema in `SparkyFitnessServer/schemas/` for v2 routes), service, repository, tests, and Swagger JSDoc.
- [ ] Check whether web (`SparkyFitnessFrontend/`) and mobile (`SparkyFitnessMobile/`) consume the contract and update them too.

## 8. Validation

- [ ] Run `pnpm run validate` in `SparkyFitnessServer/` — typecheck, lint, format.
- [ ] Run tests nearest the touched surface: `pnpm exec vitest run tests/<domain>*.test.ts`.
- [ ] If the API changed, validate from the consuming packages (frontend, mobile) too.
