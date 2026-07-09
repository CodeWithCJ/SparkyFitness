---
name: new-migration
description: Use whenever adding or changing a SparkyFitness database migration, creating a new table, or altering user-visible data access. Walks the mandatory cross-package checklist (RLS policies, schema backup sync, shared Zod schema, docs security tiers, downstream contracts). Triggers on "new table", "migration", "ALTER TABLE", "RLS", "schema change".
---

# New Migration

Read and follow `agent-docs/new-migration-checklist.md` at the repo root, completing every checkbox — do not skip the schema mirrors (step 3) or documentation (step 4) sections; they are the most commonly forgotten steps and have caused RLS bugs before.

Work through the checklist in order:

1. Migration file in `SparkyFitnessServer/db/migrations/` (`YYYYMMDDHHMMSS_description.sql`)
2. RLS policies in `SparkyFitnessServer/db/rls_policies.sql`
3. Schema mirrors: `db_schema_backup.sql` + `shared/src/schemas/database/<Table>.zod.ts` (exported from `shared/src/index.ts`)
4. Docs: `docs/content/2.features/9.family-friends-sharing.md` + `docs/content/8.developer/11.database-security-tiers.md` (assign Tier 1/2/3)
5. Downstream API contracts (server route/schema/tests, web, mobile)
6. Validate: boot the server so migrations + RLS reapply, then `pnpm run validate` and nearby tests

Before finishing, re-open the checklist and confirm each item is done or explicitly not applicable, and say which.
