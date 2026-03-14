# AGENTS.md

*Last updated: 2026-03-13*

This file is the repo-root operating guide for coding agents working in SparkyFitness. Use it to orient at the monorepo level, choose the correct package, and find verified commands quickly.

When a package-level guide has deeper or conflicting instructions, follow the package guide over this file.

## Scope

- Start from this file when work begins at the repository root.
- Move into the affected package before doing most implementation work.
- Treat this file as a monorepo guide, not a full product specification.
- Do not invent root-level app workflows. Root `package.json` is mostly tooling (`husky`, `lint-staged`, `prettier`), not an app entrypoint.

## Repo Map

- `SparkyFitnessFrontend/` - React 19 + Vite web app.
- `SparkyFitnessServer/` - Node.js + Express 5 backend API with PostgreSQL.
- `SparkyFitnessMobile/` - React Native 0.81 + Expo 54 mobile app.
- `shared/` - workspace package for shared TypeScript code and schemas.
- `SparkyFitnessMCP/` - custom MCP server package.
- `SparkyFitnessGarmin/` - Python Garmin integration service.
- `docs/` - Nuxt documentation site.
- `docker/`, `helm/`, `.github/` - deployment, infrastructure, and CI/CD assets.
- `db_schema_backup.sql` - reference database schema snapshot.
- `docker/.env.example` - tracked environment variable template commonly copied to root `.env`.

## Working Model

- Start at repo root only to identify scope, inspect shared context, or coordinate cross-package changes.
- Run app commands from the package directory you are changing.
- If a task crosses frontend, server, and mobile boundaries, read each relevant package guide before editing.
- `pnpm-workspace.yaml` currently includes `SparkyFitnessFrontend`, `SparkyFitnessMobile`, `SparkyFitnessServer`, and `shared`.
- Auxiliary packages such as `SparkyFitnessMCP` and `docs` have their own manifests; inspect the local `package.json` before working there.

## Verified Commands

### Frontend (`SparkyFitnessFrontend/`)

```bash
pnpm dev
pnpm run validate
pnpm run build
pnpm test
```

- `pnpm run validate` runs typecheck, lint, and Prettier check together.
- Vite dev server runs on port `8080` and proxies API traffic to the backend on `3010`.

### Server (`SparkyFitnessServer/`)

```bash
pnpm start
pnpm run typecheck
pnpm run lint
pnpm test
```

- Backend default port is `3010` unless `SPARKY_FITNESS_SERVER_PORT` overrides it.
- The server guide uses `npm` examples, but the repo is a `pnpm` workspace and these scripts are verified in `package.json`.

### Mobile (`SparkyFitnessMobile/`)

```bash
pnpm start
pnpm run ios
pnpm run android
pnpm run test:run -- --watchman=false --runInBand
```

- In sandboxed macOS agent runs, avoid bare `pnpm test` or `jest`; Watchman can fail.
- For targeted mobile Jest runs, prefer `pnpm exec jest --watchman=false --runInBand <test-path>`.

## Architecture Snapshot

- Web: single-page React app built with Vite and Tailwind, using TanStack Query and route-level pages.
- API: Express backend with PostgreSQL, Better Auth, RLS-aware database access, and SQL migrations.
- Mobile: Expo app that syncs HealthKit / Health Connect data and consumes the same backend APIs.
- Shared: reusable TypeScript exports in `shared/` for code shared across packages.
- MCP: TypeScript package for the project's custom Model Context Protocol server.
- Garmin: standalone Python service for Garmin-related integration work.
- Docs: separate Nuxt site for user-facing documentation.

## Cross-Cutting Rules

### Routing and Ports

- Frontend local development proxies `/api`, `/api/withings`, and `/health-data` to the backend on localhost.
- Backend APIs are generally rooted at `/api`.
- Mobile health sync ultimately targets `POST /api/health-data` on the server side. Keep the frontend proxy path `/health-data` distinct from the server API path.

### Environment and Secrets

- The tracked environment template lives at `docker/.env.example`.
- Local development and many deployments copy that template to repo-root `.env`.
- Server runtime secrets are expected in the repo-root `.env` when working from `SparkyFitnessServer/`.
- The server can also load secrets from files via `SparkyFitnessServer/utils/secretLoader.js`.

### Database and Schema Changes

- `db_schema_backup.sql` is the reference schema snapshot at repo root.
- New server migrations belong in `SparkyFitnessServer/db/migrations/`.
- Migration filenames must follow `YYYYMMDDHHMMSS_description.sql`.
- If you add a database table, also update `SparkyFitnessServer/db/rls_policies.sql`.
- Treat the RLS policy file as mandatory maintenance, not optional cleanup.

### Auth and Integration Patterns

- Server auth supports cookie-backed sessions and API keys.
- Mobile supports both API key auth and session-token auth, plus optional proxy headers for reverse-proxy setups.
- If auth behavior changes in one client, check whether web and mobile both rely on the same backend contract.

## Quick Routing

- Frontend bug fix from repo root:
  move into `SparkyFitnessFrontend/`, read its package guide, then run the relevant web validation command.
- Server migration or new table:
  move into `SparkyFitnessServer/`, add the migration, and update `db/rls_policies.sql` in the same change.
- Mobile health sync debugging:
  move into `SparkyFitnessMobile/`, read the mobile guide, then inspect sync services and health API usage before testing with Watchman-safe Jest commands.

## Package Guides

- Frontend deep guide: `SparkyFitnessFrontend/CLAUDE.md`
- Server deep guide: `SparkyFitnessServer/CLAUDE.md`
- Mobile deep guide: `SparkyFitnessMobile/CLAUDE.md`

These package guides contain the detailed architecture and workflow rules for their directories. Use them for package-specific implementation choices, validation expectations, and subsystem conventions.

## Priority Rule

- If this file and a package-level guide disagree, the package-level guide wins for work inside that package.
- If a task spans multiple packages, combine this root guide with each affected package guide instead of relying on one document alone.
