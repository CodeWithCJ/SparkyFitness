# AGENTS.md

*Last updated: 2026-07-08*

This is the repo-root monorepo guide for SparkyFitness. Use it to choose the right package, understand shared repo-level rules, and find the next guide to read.

**For AI Tools & Developers:** Start with `agent-docs/README.md` (in this repo) for quick navigation to:
- `file-and-domain-reference.md` — Find any code by feature in seconds
- `testing-patterns.md` — Concrete test examples for each layer
- `architecture-permissions.md` — Permission types and RLS patterns
- Plus 5 more guides for migrations, data flow, anti-patterns, new features, and planning

Package-level guides win. For work inside a package, follow that package's `AGENTS.md` when present, otherwise its `CLAUDE.md`.

## Scope

- Start here when work begins at repo root or spans multiple packages.
- Keep root-level guidance focused on workspace layout, shared conventions, and cross-package coordination.
- Root `package.json` is tooling only (`husky`, `lint-staged`, `prettier`), not an app entrypoint.
- Run scripts from the package directory you are changing.

## Package Guides

- Repo-root alias: `CLAUDE.md` points to this file.
- Frontend: `SparkyFitnessFrontend/AGENTS.md`
- Server: `SparkyFitnessServer/AGENTS.md`
- Mobile: `SparkyFitnessMobile/AGENTS.md`
- Shared: `shared/AGENTS.md`

For `docs/` and `SparkyFitnessGarmin/`, there is no package-level `AGENTS.md`. `SparkyFitnessGarmin/` is only a handful of Python files (`main.py`, `routes.py`, `service.py`, `schemas.py`); read them directly. For `docs/`, inspect the local manifest and content layout.

## Monorepo Map

- `SparkyFitnessFrontend/` - React 19 + Vite web app.
- `SparkyFitnessServer/` - Express 5 + PostgreSQL backend API.
- `SparkyFitnessMobile/` - Expo SDK 56 / React Native 0.85 app.
- `shared/` - source-first TypeScript workspace package for `@workspace/shared` schemas, constants, and timezone/day helpers.
- `docs/` - Nuxt / Docus docs site.
- `SparkyFitnessGarmin/` - standalone Python integration service outside the current `pnpm` workspace.
- `docker/`, `helm/`, `.github/` - infra and deployment assets.
- `db_schema_backup.sql` - repo-root schema snapshot that should stay aligned with server migrations.
- `docker/.env.example` - tracked env template commonly copied to repo-root `.env`.

## Workspace Notes

- `pnpm-workspace.yaml` currently lists `frontend`, `SparkyFitnessFrontend`, `shared`, `SparkyFitnessMobile`, `SparkyFitnessServer`, and `docs`.
- Only `SparkyFitnessFrontend/` exists on disk right now; treat `frontend` as a legacy workspace entry unless the task is specifically about workspace cleanup.
- `shared/` is a library package, not an app. Validate shared changes from the consuming package(s), not in isolation.
- `SparkyFitnessGarmin/` is outside the current workspace. Inspect its own manifest and scripts before working there.

## Agent Efficiency (read this before searching)

Do not read or search these paths; they burn context for nothing:

- `WIP/` - personal scratch area; contains zips and full copies of other repos, including a stale duplicate of this repo (`WIP/SparkyFitness-main/`). Never read or edit anything under it.
- `SparkyFitnessMobile/ios/` and `SparkyFitnessMobile/android/` - generated native projects (`ios/` is >1 GB of Pods). Regenerate with `npx expo prebuild --clean`; edit `app.config.ts`, `plugins/`, or `targets/` instead.
- `pnpm-lock.yaml` (~1.3 MB) - never read; check `package.json` files instead.
- `db_schema_backup.sql` (~330 KB) - never read whole; grep for the one `CREATE TABLE` you need.
- `SparkyFitnessFrontend/dist/` - build output.
- `SparkyFitnessFrontend/public/locales/` except `en/` - 27 machine-synced translations. Only `en/translation.json` is ever hand-edited, and even that (~120 KB) should be grepped, not read whole.

Cheap ways to learn things:

- Database table index: read `docs/content/8.developer/4.database.md` (quick reference of all ~120 tables with one-line purpose). For detailed schema, read `shared/src/schemas/database/<Table>.zod.ts` (one small Zod file per table).
- Database security & permissions: `docs/content/8.developer/11.database-security-tiers.md` (security tier, permission type, and RLS rules for every table).
- API request/response contract: `shared/src/schemas/api/<Name>.api.zod.ts`.
- Definition of done: CI (`.github/workflows/ci-tests.yml`) runs `pnpm run validate` plus the package's CI test script for each changed package. Run those locally before declaring work complete.

## Cross-Package Rules

- If you add or change a server migration (such as creating a new table), follow `agent-docs/new-migration-checklist.md`. In short, you MUST:
  1. Create the migration file in `SparkyFitnessServer/db/migrations/YYYYMMDDHHMMSS_description.sql`.
  2. Update the Row-Level Security (RLS) policies in `SparkyFitnessServer/db/rls_policies.sql`.
  3. **Restart the server** (`pnpm start` from `SparkyFitnessServer/`) to apply the migration.
  4. **Run the backup script** to sync `db_schema_backup.sql`: `./db_backup.sh` (Mac/Linux) or `DB Backup.cmd` (Windows) from repo root. Never manually edit the backup file.
  5. Add or update the matching Zod schema in `shared/src/schemas/database/`.
  6. Update the user-facing documentation in `docs/content/2.features/9.family-friends-sharing.md`.
  7. Update the developer documentation in `docs/content/8.developer/11.database-security-tiers.md` to classify the table as Tier 1, Tier 2, or Tier 3.
- Prefer the shared timezone helpers from `@workspace/shared` and `SparkyFitnessServer/utils/timezoneLoader.ts` for day-string logic. Avoid `toISOString().split('T')[0]` for user-facing or business-logic dates.
- Keep `YYYY-MM-DD` values as calendar-day strings until you reach a database or external API boundary that needs UTC instants.
- Auth or API contract changes usually need a quick check in both web and mobile because they share the same backend.
- Frontend local dev proxies `/api`, `/health-data`, and `/uploads` to the server on `3010`. The `/health-data` proxy is rewritten to `/api/health-data`, while server APIs remain rooted at `/api`.
- Server runtime secrets are usually sourced from repo-root `.env`, commonly created from `docker/.env.example`. The server can also load secret files via `SparkyFitnessServer/utils/secretLoader.ts`.
- Extract shared logic on the **second** duplication ("rule of two"), not the third - duplicated logic drifts as different sessions edit each copy. Extract *behavior*, not coincidental shape. See `agent-docs/anti-patterns.md`.

## Architecture Docs (Reduce Scanning, Prevent Bugs)

Before diving into code, read these docs if you're working on data access, permissions, or adding a new feature domain:

- `agent-docs/architecture-permissions.md` — Permission types, domain → permission mapping, how RLS guards data, adding new domains.
- `agent-docs/data-flow-patterns.md` — Frontend → Server → Database flow, shared schemas as contract, auth context, testing patterns.
- `agent-docs/new-domain-template.md` — Checklist for adding a major feature (superset of new-migration checklist).

These docs answer: "How do I safely add a feature across the stack?" without scanning 20+ files.

## Keeping These Guides Accurate

- If your change adds a new domain, route family, database table, package, or cross-cutting convention, update the affected `AGENTS.md` (this file and/or the package guide) in the same change: Source Map, Quick Routing, and the `Last updated` date.
- Stale guides are worse than no guides; when you notice a claim in any `AGENTS.md` that contradicts the code, fix the guide as part of your change.

## Common Commands

Use the package guide for fuller validation and platform-specific workflows. These are the common entrypoints:

### Frontend (`SparkyFitnessFrontend/`)

```bash
pnpm dev
pnpm run validate
pnpm test
```

### Server (`SparkyFitnessServer/`)

```bash
pnpm start
pnpm run validate
pnpm test
pnpm run test:coverage
```

### Mobile (`SparkyFitnessMobile/`)

```bash
pnpm start
pnpm run ios
pnpm run android
pnpm run validate
pnpm run test:run -- --watchman=false --runInBand
npx expo prebuild --clean
```

### Docs (`docs/`)

```bash
pnpm dev
pnpm run build
```

