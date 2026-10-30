# New Migration / New Table Checklist

Follow this checklist whenever you add or change a server database migration — especially when creating a new table or changing user-visible access behavior. Work through every step in order; the most common review failure in this repo is a new table missing one of these.

## 1. Create the migration

- [ ] Create the migration in `SparkyFitnessServer/db/migrations/` named `YYYYMMDDHHMMSS_description.sql`.
- [ ] Keep **one migration file per PR** and edit it in place while developing; don't add follow-up migrations for fixes to your own unmerged SQL.
- [ ] Make it **re-runnable without errors**: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE/INDEX IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT`, guarded backfills (`WHERE ... IS NULL` / `NOT EXISTS`), `CREATE OR REPLACE` for functions.
- [ ] Agents don't start the server themselves: tell the user when the migration is ready, and they start it once to apply it.
- [ ] Do not invent alternate migration mechanisms; server startup applies pending migrations and then reapplies RLS policies when `rls_policies.sql` or the policies in the database changed.
- [ ] The runner applies each file and records it in `system.schema_migrations` inside one transaction, so a file contains no `BEGIN;`/`COMMIT;` of its own (`tests/migrationFiles.test.ts` fails otherwise). To commit steps separately (for example `NOT VALID`, then `VALIDATE CONSTRAINT`), write two migration files.
- [ ] Never use a statement that cannot run inside a transaction block, such as `CREATE INDEX CONCURRENTLY` or `VACUUM`. Startup refuses such a file with an error naming it.

## 2. Update Row-Level Security (required for every new table)

- [ ] Add or update policies in `SparkyFitnessServer/db/rls_policies.sql`.
- [ ] Decide who can read/write rows: owner only (like cycle/pregnancy), family-shared (which delegatable permission: `diary`, `checkin`, `medications`, or `reports`?), or system/admin. Prefer an existing `create_*_policy(...)` generator in `rls_policies.sql`.
- [ ] Remember `getClient(userId, authenticatedUserId?)` sets the RLS context; `getSystemClient()` bypasses RLS and is only for admin/startup/migration work.
- [ ] Classify every new table in the `DOMAIN` map of `SparkyFitnessServer/tests/rlsPermissionMatrix.integration.test.ts` (for example `lab_results: 'checkin'`), using the permission its policy uses. The test's completeness guard fails CI when an RLS-enabled table is missing from the map, and the wiring check fails if the classification disagrees with the policy.

## 3. Boot server and let migration apply

- [ ] **Restart the server** (`pnpm start` from `SparkyFitnessServer/`). Agents ask the user to do it.
- [ ] Confirm the migration applies cleanly and RLS policies reapply without errors.
- [ ] Check server logs for any migration failures.

## 4. Schema backup (automatic — nothing to run)

- [ ] Do **not** update `db_schema_backup.sql` in the PR. After merge, CI regenerates it from the migrations and opens an automated sync PR (`.github/workflows/schema-backup.yml`).
- [ ] Never edit it by hand, and never commit a copy generated from a local database — local databases drift from the migrations-derived schema.

## 5. Add Zod schema

- [ ] Add or update the table's Zod schema in `shared/src/schemas/database/<Table>.zod.ts`.
- [ ] Export it from `shared/src/index.ts`.
- [ ] If the table backs an API, create/update the request/response schema in `shared/src/schemas/api/<DomainName>.api.zod.ts`.

## 6. Documentation

- [ ] Update `docs/src/features/family-friends-sharing.md` (user-facing sharing behavior).
- [ ] Update `docs/src/developer/database-security-tiers.md`: add the table with its permission type and classify as Tier 1, Tier 2, or Tier 3.
- [ ] Update `docs/src/developer/database.md` table index if adding a new domain category.

## 7. Downstream contracts

- [ ] If the table backs an API: create/update route (+ Zod route schema in `SparkyFitnessServer/schemas/` for v2 routes), service, repository, tests, and Swagger JSDoc.
- [ ] Check whether web (`SparkyFitnessFrontend/`) and mobile (`SparkyFitnessMobile/`) consume the contract and update them too.

## 8. Validation

- [ ] Run `pnpm run validate` in `SparkyFitnessServer/` — typecheck, lint, format.
- [ ] Run tests nearest the touched surface: `pnpm exec vitest run tests/<domain>*.test.ts`.
- [ ] For a new table or policy, run `tests/rlsPermissionMatrix.integration.test.ts` against a Postgres that has the schema and `rls_policies.sql` applied (the same `SPARKY_FITNESS_DB_*` and `SPARKY_FITNESS_APP_DB_*` env the server uses). It skips silently when no database is reachable, so a plain `pnpm test` can pass without ever running it; CI runs it in the migration-check job.
- [ ] If the API changed, validate from the consuming packages (frontend, mobile) too.
