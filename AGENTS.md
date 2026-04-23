# AGENTS.md

*Last updated: 2026-04-21*

This is the repo-root monorepo guide for SparkyFitness. Use it to choose the right package, understand shared repo-level rules, and find the next guide to read.

Package-level guides win. For work inside a package, follow that package's `AGENTS.md` when present, otherwise its `CLAUDE.md`.

## Scope

- Start here when work begins at repo root or spans multiple packages.
- Keep root-level guidance focused on workspace layout, shared conventions, and cross-package coordination.
- Root `package.json` is tooling only (`husky`, `lint-staged`, `prettier`), not an app entrypoint.
- Run scripts from the package directory you are changing.

## Package Guides

- Repo-root alias: `CLAUDE.md` points to this file.
- Frontend: `SparkyFitnessFrontend/CLAUDE.md`
- Server: `SparkyFitnessServer/AGENTS.md`
- Mobile: `SparkyFitnessMobile/AGENTS.md`

For `shared/`, `docs/`, `SparkyFitnessMCP/`, and `SparkyFitnessGarmin/`, there is no package-level `AGENTS.md` right now. Inspect the local manifest, README, and source layout before making package-specific assumptions.

## Monorepo Map

- `SparkyFitnessFrontend/` - React 19 + Vite web app.
- `SparkyFitnessServer/` - Express 5 + PostgreSQL backend API.
- `SparkyFitnessMobile/` - Expo SDK 54 / React Native 0.81 app.
- `shared/` - source-first TypeScript workspace package for `@workspace/shared` schemas, constants, and timezone/day helpers.
- `docs/` - Nuxt / Docus docs site.
- `SparkyFitnessMCP/` - standalone TypeScript MCP server outside the current `pnpm` workspace.
- `SparkyFitnessGarmin/` - standalone Python integration service outside the current `pnpm` workspace.
- `docker/`, `helm/`, `.github/` - infra and deployment assets.
- `db_schema_backup.sql` - repo-root schema snapshot that should stay aligned with server migrations.
- `docker/.env.example` - tracked env template commonly copied to repo-root `.env`.

## Workspace Notes

- `pnpm-workspace.yaml` currently lists `frontend`, `SparkyFitnessFrontend`, `shared`, `SparkyFitnessMobile`, `SparkyFitnessServer`, and `docs`.
- Only `SparkyFitnessFrontend/` exists on disk right now; treat `frontend` as a legacy workspace entry unless the task is specifically about workspace cleanup.
- `shared/` is a library package, not an app. Validate shared changes from the consuming package(s), not in isolation.
- `SparkyFitnessMCP/` and `SparkyFitnessGarmin/` are outside the current workspace, so inspect their own manifests and scripts before working there.

## Cross-Package Rules

- If you add or change a server migration, update `SparkyFitnessServer/db/migrations/`, repo-root `db_schema_backup.sql`, and `SparkyFitnessServer/db/rls_policies.sql` when access behavior changes.
- Prefer the shared timezone helpers from `@workspace/shared` and `SparkyFitnessServer/utils/timezoneLoader.ts` for day-string logic. Avoid `toISOString().split('T')[0]` for user-facing or business-logic dates.
- Keep `YYYY-MM-DD` values as calendar-day strings until you reach a database or external API boundary that needs UTC instants.
- Auth or API contract changes usually need a quick check in both web and mobile because they share the same backend.
- Frontend local dev proxies `/api`, `/health-data`, and `/uploads` to the server on `3010`. The `/health-data` proxy is rewritten to `/api/health-data`, while server APIs remain rooted at `/api`.
- Server runtime secrets are usually sourced from repo-root `.env`, commonly created from `docker/.env.example`. The server can also load secret files via `SparkyFitnessServer/utils/secretLoader.ts`.

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
npx expo prebuild -c
```

### Docs (`docs/`)

```bash
pnpm dev
pnpm run build
```

### MCP (`SparkyFitnessMCP/`)

```bash
pnpm run dev
pnpm run build
pnpm test
```
