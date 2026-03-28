# AGENTS.md

*Last updated: 2026-03-28*

This file is the repo-root operating guide for coding agents working in SparkyFitness. Use it to orient at the monorepo level, choose the correct package, and find verified commands quickly.

When a package-level guide has deeper or conflicting instructions, follow the package guide over this file. In this repo that usually means `AGENTS.md` when present, otherwise the package's `CLAUDE.md`.

## Scope

- Start from this file when work begins at the repository root or spans multiple packages.
- Move into the affected package before doing most implementation work or validation.
- Treat this file as a monorepo guide, not a full product specification.
- Do not invent root-level app workflows. Root `package.json` is mostly tooling (`husky`, `lint-staged`, `prettier`), not an app entrypoint.
- Repo-root `CLAUDE.md` currently just points back to this file.

## Repo Map

- `SparkyFitnessFrontend/` - React 19 + Vite web app.
- `SparkyFitnessServer/` - Node.js + Express 5 backend API with PostgreSQL.
- `SparkyFitnessMobile/` - React Native 0.81.5 + Expo SDK 54 mobile app.
- `shared/` - workspace package for shared TypeScript code, Zod schemas, and timezone helpers exported through `@workspace/shared`.
- `docs/` - Nuxt 3 / Docus documentation site.
- `SparkyFitnessMCP/` - standalone TypeScript MCP server package.
- `SparkyFitnessGarmin/` - Python Garmin integration service.
- `docker/`, `helm/`, `.github/` - deployment, infrastructure, and CI/CD assets.
- `db_schema_backup.sql` - repo-root database schema snapshot that should stay aligned with server migrations.
- `docker/.env.example` - tracked environment variable template commonly copied to repo-root `.env`.

## Working Model

- Start at repo root only to identify scope, inspect shared context, or coordinate cross-package changes.
- Run package commands from the package directory you are changing.
- If a task crosses frontend, server, mobile, or `shared/` boundaries, read each relevant package guide before editing.
- `pnpm-workspace.yaml` currently lists `frontend`, `SparkyFitnessFrontend`, `shared`, `SparkyFitnessMobile`, `SparkyFitnessServer`, and `docs`.
- Only `SparkyFitnessFrontend/` exists on disk right now; treat `frontend` in the workspace file as a legacy entry unless the task is specifically about workspace cleanup.
- `SparkyFitnessMCP/` and `SparkyFitnessGarmin/` are outside the current `pnpm` workspace. Inspect their local manifests and scripts before working there.
- `shared/` is a library package, not an app. Validate shared changes from the consuming package(s) when needed.

## Verified Commands

### Frontend (`SparkyFitnessFrontend/`)

```bash
pnpm dev
pnpm run typecheck
pnpm run lint
pnpm run format:check
pnpm run validate
pnpm run build
pnpm test
pnpm run test:ci
```

- `pnpm run validate` runs typecheck, lint, and Prettier check together.
- Vite dev server runs on port `8080` and proxies API traffic to the backend on `3010`.

### Server (`SparkyFitnessServer/`)

```bash
pnpm start
pnpm run typecheck
pnpm run lint
pnpm run lint:fix
pnpm test
pnpm run test:watch
pnpm run test:coverage
pnpm run test:ci
```

- Backend default port is `3010` unless `SPARKY_FITNESS_SERVER_PORT` overrides it.
- Use `pnpm` in this package. Older docs may still show `npm`, but the repo is a `pnpm` workspace and these scripts are verified in `package.json`.
- `pnpm test` already includes `NODE_OPTIONS='--experimental-vm-modules'`.

### Mobile (`SparkyFitnessMobile/`)

```bash
pnpm start
pnpm run ios
pnpm run android
pnpm run lint
pnpm run test:run -- --watchman=false --runInBand
pnpm exec jest --watchman=false --runInBand <test-path>
pnpm exec tsc --noEmit
npx expo prebuild -c
```

- In sandboxed macOS agent runs, avoid bare `pnpm test` or bare `jest`; Watchman can fail.
- For targeted mobile Jest runs, prefer `pnpm exec jest --watchman=false --runInBand <test-path>`.
- Run `npx expo prebuild -c` after native dependency or native config changes.

### Docs (`docs/`)

```bash
pnpm dev
pnpm run build
pnpm run generate
pnpm run preview
pnpm run lint
```

### MCP (`SparkyFitnessMCP/`)

```bash
pnpm run dev
pnpm run build
pnpm start
pnpm test
```

## Architecture Snapshot

- Web: single-page React app built with Vite, Tailwind, TanStack Query, and route-level pages.
- API: Express backend with PostgreSQL, Better Auth, RLS-aware database access, SQL migrations, and third-party provider integrations.
- Mobile: Expo app that syncs HealthKit / Health Connect data and consumes the same backend APIs.
- Shared: reusable TypeScript exports in `shared/` for schemas, constants, and timezone/day-string helpers.
- Docs: separate Nuxt / Docus site for user-facing documentation.
- MCP: TypeScript package for the project's custom Model Context Protocol server.
- Garmin: standalone Python service for Garmin-related integration work.

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

- `db_schema_backup.sql` is the repo-root reference schema snapshot.
- New server migrations belong in `SparkyFitnessServer/db/migrations/`.
- Migration filenames must follow `YYYYMMDDHHMMSS_description.sql`.
- If you add or change a migration, also update repo-root `db_schema_backup.sql` in the same change.
- If you add a database table or change user-visible access behavior, also update `SparkyFitnessServer/db/rls_policies.sql`.
- Treat the RLS policy file and schema snapshot as mandatory maintenance, not optional cleanup.

### Date, Day Strings, and Timezones

- Prefer the shared helpers in `shared/src/utils/timezone.ts`, exported through `@workspace/shared`, for day-string and timezone-aware date logic.
- Use `isDayString`, `addDays`, `compareDays`, `dayToPickerDate`, and `pickerDateToDay` for `YYYY-MM-DD` calendar-day strings.
- Use `todayInZone`, `instantToDay`, `instantHourMinute`, `dayToUtcRange`, and `dayRangeToUtcRange` when a user's timezone matters.
- On the server, load the user's timezone with `SparkyFitnessServer/utils/timezoneLoader.js` before deriving "today", bucketing timestamps by day, or building day-based query ranges.
- Avoid ad hoc UTC date extraction such as `toISOString().split('T')[0]` for user-facing or business-logic dates. That pattern silently shifts dates near timezone boundaries and is not a substitute for timezone-aware day handling.
- Treat `YYYY-MM-DD` values as calendar-day strings, not as UTC-midnight timestamps. Convert to UTC ranges only at the boundary where the database or an external API needs instants.
- If you touch older code that still derives day strings with `toISOString().split('T')[0]`, prefer migrating that path to the shared helpers instead of copying the pattern forward.
- Shared timezone helpers are currently exercised in `SparkyFitnessServer/tests/timezone.test.js`; update or extend those tests when changing the shared date/time behavior.

### Auth and Integration Patterns

- Server auth supports cookie-backed sessions and API keys.
- Mobile supports both API key auth and session-token auth, plus optional proxy headers for reverse-proxy setups.
- If auth behavior changes in one client, check whether web and mobile both rely on the same backend contract.

## Quick Routing

- Frontend bug fix from repo root:
  move into `SparkyFitnessFrontend/`, read its package guide, then run the relevant web validation command.
- Server migration or new table:
  move into `SparkyFitnessServer/`, add the migration, and update `db/rls_policies.sql` plus repo-root `db_schema_backup.sql` in the same change.
- Shared schema or timezone helper work:
  move into `shared/`, update exports in `src/index.ts` if needed, then validate from the consuming package(s).
- Mobile health sync debugging:
  move into `SparkyFitnessMobile/`, read the mobile guide, then inspect sync services and health API usage before testing with Watchman-safe Jest commands.
- Docs change:
  move into `docs/`, inspect `package.json`, then use the Nuxt/Docus commands above.
- MCP server change:
  move into `SparkyFitnessMCP/`, inspect `package.json`, then use its local build or dev commands.

## Package Guides

- Repo-root alias: `CLAUDE.md` points to this file.
- Frontend deep guide: `SparkyFitnessFrontend/CLAUDE.md`
- Server package guide: `SparkyFitnessServer/AGENTS.md`
- Mobile package guide: `SparkyFitnessMobile/AGENTS.md`

For `shared/`, `docs/`, `SparkyFitnessMCP/`, and `SparkyFitnessGarmin/`, there is currently no package-level `AGENTS.md`. Inspect the local manifest, README, and source layout before making package-specific assumptions.

## Priority Rule

- If this file and a package-level guide disagree, the package-level guide wins for work inside that package.
- In practice, prefer package `AGENTS.md` when present and fall back to package `CLAUDE.md` when it is the only guide.
- If a task spans multiple packages, combine this root guide with each affected package guide instead of relying on one document alone.
