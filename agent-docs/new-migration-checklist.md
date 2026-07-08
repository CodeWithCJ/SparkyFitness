# New Migration / New Table Checklist

Follow this checklist whenever you add or change a server database migration — especially when creating a new table or changing user-visible access behavior. Work through every step; the most common review failure in this repo is a new table missing one of these.

## 1. The migration itself

- [ ] Create the migration in `SparkyFitnessServer/db/migrations/` named `YYYYMMDDHHMMSS_description.sql`.
- [ ] Do not invent alternate migration mechanisms; server startup applies pending migrations and then reapplies RLS policies.

## 2. Row-Level Security (required for every new table)

- [ ] Add or update policies in `SparkyFitnessServer/db/rls_policies.sql`.
- [ ] Decide who can read/write rows: owner only, family-shared (which permission type: `diary`, `reports`, `checkin`?), or system/admin.
- [ ] Remember `getClient(userId, authenticatedUserId?)` sets the RLS context; `getSystemClient()` bypasses RLS and is only for admin/startup/migration work.

## 3. Schema mirrors

- [ ] Sync the repo-root schema snapshot `db_schema_backup.sql` with the migration's end state.
- [ ] Add or update the table's Zod schema in `shared/src/schemas/database/<Table>.zod.ts` and export it from `shared/src/index.ts`.

## 4. Documentation

- [ ] Update `docs/content/2.features/9.family-friends-sharing.md` (user-facing sharing behavior).
- [ ] Update `docs/content/8.developer/11.database-security-tiers.md`: classify the table as Tier 1, Tier 2, or Tier 3.

## 5. Downstream contracts

- [ ] If the table backs an API: route (+ Zod route schema in `SparkyFitnessServer/schemas/` for v2 routes), service, repository, tests, and Swagger JSDoc.
- [ ] Check whether web (`SparkyFitnessFrontend/`) and mobile (`SparkyFitnessMobile/`) consume the contract and update them too.

## 6. Validation

- [ ] Boot the server (`pnpm start` from `SparkyFitnessServer/`) and confirm the migration and RLS reapply cleanly.
- [ ] Run `pnpm run validate` and the tests nearest the touched surface.
