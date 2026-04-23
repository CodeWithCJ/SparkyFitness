# AGENTS.md

_Last updated: 2026-04-21_

SparkyFitness Server is the backend API package for the SparkyFitness monorepo. Use this file as the primary guide for work inside `SparkyFitnessServer/`.

If a task also touches `shared/`, the frontend, or the mobile app, read the relevant package guide before editing outside this directory. Use `../AGENTS.md` for monorepo-level context.

## Scope

- This file is for package-local work in `SparkyFitnessServer/`.
- Keep changes inside this package unless the task clearly crosses package boundaries.
- Treat `CLAUDE.md` as legacy context only; this file is the authoritative package guide when they differ.
- Do not invent alternate boot paths, duplicate route registries, or parallel migration flows when the current startup path already covers the behavior.

## Current Snapshot

- Dev boot path: `pnpm start` -> `nodemon` -> `tsx index.ts`
- `index.ts` loads `../.env`, applies file-backed secrets, runs preflight checks, then imports `SparkyFitnessServer.ts`
- Main app shell: `SparkyFitnessServer.ts`
- Stack: Express 5, PostgreSQL via `pg`, Better Auth, Zod, TypeScript 5, Vitest 4, ESLint 10
- Module system: ESM with `type: "module"` and `moduleResolution: "NodeNext"`
- The package is now effectively TypeScript-first; almost all source files are `.ts`
- Main domains: food and meal tracking, exercise logging, health and sleep data, reporting, AI chat, onboarding, identity, admin tooling, and external provider integrations

## Verified Commands

```bash
pnpm start
pnpm run validate
pnpm run typecheck
pnpm run lint
pnpm run lint:fix
pnpm run format:check
pnpm run format
pnpm test
pnpm run test:watch
pnpm run test:coverage
pnpm run test:ci
pnpm exec vitest run tests/mealRoutes.test.ts
pnpm exec eslint routes/v2/foodRoutes.ts services/foodCoreService.ts
```

- `pnpm start` uses hot reload through `nodemon`; `nodemon.json` ultimately executes `tsx index.ts`
- `pnpm run validate` runs typecheck, lint, and Prettier check together
- `pnpm test` runs `vitest run`
- The backend default port is `3010` unless `SPARKY_FITNESS_SERVER_PORT` overrides it
- For targeted test runs, prefer `pnpm exec vitest run tests/<name>.test.ts`

## Source Map

- `index.ts` - real dev entrypoint; loads env, secrets, and preflight checks before booting the app
- `SparkyFitnessServer.ts` - Express app shell, route mounting, Swagger/ReDoc, cron setup, graceful shutdown
- `auth.ts` - Better Auth configuration, plugins, session behavior, SSO provider syncing
- `routes/` - primary HTTP route surface
- `routes/v2/` - newer typed route surface; pair these changes with `schemas/`
- `routes/auth/` - auth-specific route fragments mounted through `routes/authRoutes.ts`
- `services/` - business logic and orchestration
- `models/` - PostgreSQL repositories and persistence helpers
- `middleware/` - auth, permissions, uploads, and shared Express middleware
- `integrations/` - provider adapters and ingest pipelines
- `schemas/` - Zod route schemas
- `types/` - TypeScript declarations, including `Express.Request` augmentation
- `db/` - pool management, grants, migrations, and RLS policies
- `config/` - logging and Swagger config
- `utils/` - startup helpers, CORS, permissions, timezone loading, OIDC helpers, migration helpers
- `ai/`, `constants/`, `data/` - supporting package data and configuration
- `tests/` - Vitest suites plus a few utility scripts
- `devdocs/` - local notes and debugging artifacts when present

When searching, ignore noisy/generated directories unless you explicitly need them:

- `node_modules/`
- `coverage/`
- `uploads/`
- `temp_uploads/`
- `backup/`
- `mock_data/`

## Architecture

### Boot and App Shell

- `index.ts` is the true local boot path used by `pnpm start`; do not bypass it for normal development because it performs env loading and preflight work
- `SparkyFitnessServer.ts` creates the Express app, configures static upload serving, mounts auth interception, registers routes, exposes API docs, schedules cron jobs, and handles graceful shutdown
- Startup order matters:
  - apply pending migrations
  - reapply `db/rls_policies.sql`
  - upsert env-configured OIDC provider
  - mount Better Auth
  - sync trusted SSO providers
  - register cron jobs
  - optionally promote `SPARKY_FITNESS_ADMIN_EMAIL` to admin
  - start listening
- Public API docs live at:
  - `/api/api-docs/swagger`
  - `/api/api-docs/redoc`
  - `/api/api-docs/json`
- If you change public endpoints, keep Swagger JSDoc and `config/swagger.ts` coverage accurate

### Environment and Secrets

- Runtime `.env` is expected at `../.env`
- The tracked template lives at `../docker/.env.example`
- `utils/secretLoader.ts` loads `*_FILE` secrets before preflight validation
- Current hard startup requirements enforced by `utils/preflightChecks.ts` include:
  - `SPARKY_FITNESS_DB_HOST`
  - `SPARKY_FITNESS_DB_NAME`
  - `SPARKY_FITNESS_DB_USER`
  - `SPARKY_FITNESS_DB_PASSWORD`
  - `SPARKY_FITNESS_APP_DB_USER`
  - `SPARKY_FITNESS_APP_DB_PASSWORD`
  - `SPARKY_FITNESS_FRONTEND_URL`
  - `SPARKY_FITNESS_API_ENCRYPTION_KEY`
- `BETTER_AUTH_SECRET` is currently soft-required: startup will generate a temporary value if it is missing, but that is only appropriate for throwaway local runs because sessions will not survive restarts
- Common operational toggles include `SPARKY_FITNESS_SERVER_PORT`, `SPARKY_FITNESS_ADMIN_EMAIL`, `ALLOW_PRIVATE_NETWORK_CORS`, `SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS`, and `BETTER_AUTH_URL`

### TypeScript and Module Conventions

- This package is now almost entirely TypeScript; new source files should be `.ts`
- Keep local relative imports using `.js` extensions from TypeScript files, for example `import foo from './foo.js'`
- `eslint.config.js` enforces file extensions in imports
- `tsconfig.json` uses `NodeNext`, `noEmit`, and `allowJs: false`
- `@workspace/shared` resolves directly to `../shared/src/index.ts` here and in Vitest
- New public endpoints should include TypeScript code, Zod validation, and automated tests

### Database and RLS

- Use `getClient(userId, authenticatedUserId?)` from `db/poolManager.ts` for normal user-scoped queries
- `getClient(...)` sets `public.set_app_context(...)`; that is what makes row-level security work correctly
- Use `getSystemClient()` only for admin, migration, startup, or policy-management work that intentionally bypasses RLS
- Always release database clients in a `finally` block
- New migrations belong in `db/migrations/` and must use `YYYYMMDDHHMMSS_description.sql`
- If you add or change a migration, also update `../db_schema_backup.sql` in the same change
- If you add a table or change user-visible access behavior, also update `db/rls_policies.sql`
- Startup automatically applies migrations and then reapplies RLS policies; do not create alternate migration mechanisms

### Auth and Request Context

- Better Auth is configured in `auth.ts` and mounted under `/api/auth`
- `SparkyFitnessServer.ts` intercepts `/api/auth*` requests before the normal request logger and has special handling for discovery routes and sign-out cookie cleanup
- `middleware/authMiddleware.ts` populates:
  - `req.userId`
  - `req.authenticatedUserId`
  - `req.originalUserId`
  - `req.activeUserId`
  - `req.user`
- `req.userId` is the active RLS target; `req.authenticatedUserId` is the logged-in actor
- Family and delegated access flow through `middleware/checkPermissionMiddleware.ts`, `middleware/onBehalfOfMiddleware.ts`, and the auth middleware’s active-user switching
- If you change auth behavior, check both cookie-backed sessions and API key flows

### Dates, Day Strings, and Timezones

- Prefer the shared helpers exported by `@workspace/shared` for day-string and timezone-aware logic
- Common server-side helpers include `todayInZone`, `instantToDay`, `dayToUtcRange`, `dayRangeToUtcRange`, `localDateToDay`, `addDays`, `compareDays`, and `isDayString`
- Load the user timezone through `utils/timezoneLoader.ts` before deriving "today", bucketing events by day, or building date ranges from user context
- Treat `YYYY-MM-DD` values as calendar-day strings, not UTC-midnight timestamps
- Avoid `toISOString().split('T')[0]` for user-facing or business-logic dates; it silently shifts dates near timezone boundaries
- If you touch older code that still uses UTC split patterns, prefer migrating that path to the shared helpers instead of copying the pattern forward
- Timezone/date regression coverage already exists in:
  - `tests/timezone.test.ts`
  - `tests/dateShifting.test.ts`
  - `tests/measurementService.timezone.test.ts`

### Integrations and Background Work

- Provider-specific adapters live under `integrations/`; coordinating logic usually lives in `services/` and persistence in `models/`
- Scheduled jobs currently include backups, session cleanup, and hourly sync loops for Withings, Garmin, Fitbit, Polar, and Strava
- Integration work often spans route, service, repository, cron, and external-provider settings code; inspect the whole path before calling the work complete

## Testing and Validation

- Test runner: Vitest, not Jest
- Auto-discovered test files match `tests/**/*.test.ts`
- `tests/check_routes.ts` and `tests/*.script.ts` are utility scripts, not normal test suites
- For route or contract work, targeted `supertest`-based Vitest tests are the normal validation path
- Prefer `pnpm run typecheck` after touching `routes/v2/`, `schemas/`, `types/`, or shared request/response contracts
- Prefer `pnpm run lint` after multi-file edits; if unrelated package-wide issues make that noisy, run targeted `pnpm exec eslint <paths>` on the touched files before stopping
- Use `pnpm run test:coverage` after broad service, route, repository, middleware, or auth refactors

## Quick Routing

- Startup, env, or deployment issue:
  inspect `index.ts`, `SparkyFitnessServer.ts`, `utils/secretLoader.ts`, `utils/preflightChecks.ts`, and `config/logging.ts`
- Auth, session, MFA, or API key issue:
  inspect `auth.ts`, `middleware/authMiddleware.ts`, `routes/authRoutes.ts`, and `routes/auth/`
- Migration, RLS, or permission issue:
  inspect `db/migrations/`, `db/rls_policies.sql`, `db/poolManager.ts`, `utils/applyRlsPolicies.ts`, and the permission middleware/helpers
- Public v2 contract issue:
  inspect the matching file in `routes/v2/` plus the related Zod schema in `schemas/`
- Food, barcode, or external provider issue:
  inspect the relevant `integrations/*` code, then the matching service and repository files
- Health data or date bucketing issue:
  inspect `integrations/healthData/healthDataRoutes.ts`, `services/measurementService.ts`, and `utils/timezoneLoader.ts`

## Working Rules

- Match the existing service/repository/middleware layering instead of introducing parallel abstractions
- If you add persisted or user-visible data, think through migration, RLS, permissions, tests, API docs, and downstream client contracts together
- Validate shared-contract changes from the affected consumers, not just from this package
- Keep package-specific guidance here; use `../AGENTS.md` only for cross-package context

## Priority Rule

- For work inside `SparkyFitnessServer/`, this file wins over repo-root guidance on package-specific details
- Use `../AGENTS.md` for monorepo context
- If a task spans multiple packages, combine this guide with the other affected package guides instead of relying on one file alone
