# AGENTS.md

*Last updated: 2026-03-13*

SparkyFitness Server is the Node.js + Express 5 backend API for the SparkyFitness monorepo. This file is the package guide for `SparkyFitnessServer/`.

Use this file as the primary guide for work in this directory. `CLAUDE.md` is still useful as legacy context, but this file should be treated as the current package-level operating guide.

If a task also changes the frontend, mobile app, or `shared/`, read the relevant package guide before editing outside this folder.

## Project Overview

- Runtime entrypoint: `SparkyFitnessServer.js`
- Stack: Express 5, PostgreSQL via `pg`, Better Auth, Jest, ESLint, TypeScript type-checking with CommonJS modules
- Main domains: food and meal tracking, exercise logging, health metrics, reporting, chat, external integrations, family access, and admin tooling
- API routes are primarily mounted under `/api`
- API docs are served at:
  - `/api/api-docs/swagger`
  - `/api/api-docs/redoc`
  - `/api/api-docs/json`
- The codebase is mostly JavaScript. Current TypeScript islands are intentionally small and include `routes/v2/`, `schemas/`, and `types/`

Startup behavior matters in this package:
- `.env` is loaded from `../.env`
- file-based secrets are loaded through `utils/secretLoader.js`
- preflight env validation runs before the app boots
- SQL migrations run on startup, then `db/rls_policies.sql` is applied
- auth provider sync and scheduled jobs are initialized before the server begins accepting traffic

## Commands

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

- Use `pnpm` in this package. Older docs may still show `npm`, but the repo is a `pnpm` workspace and the scripts above are verified in `package.json`.
- `pnpm test` already includes `NODE_OPTIONS='--experimental-vm-modules'`. If you run Jest manually, keep that env var.
- Prefer `pnpm run typecheck` after touching `routes/v2/`, `schemas/`, `types/`, or public request/response contracts.
- Prefer `pnpm run lint` after multi-file edits, route wiring changes, or broad refactors.
- Useful targeted test pattern:

```bash
NODE_OPTIONS='--experimental-vm-modules' pnpm exec jest tests/mealRoutes.test.js
```

## Source Map

- `SparkyFitnessServer.js` - app entrypoint, route registration, Swagger mounting, cron setup, graceful shutdown
- `routes/` - HTTP route handlers
- `routes/v2/` - current TypeScript route surface
- `services/` - business logic and orchestration
- `models/` - database repositories and persistence helpers
- `middleware/` - auth, permissions, uploads, and shared Express middleware
- `integrations/` - third-party provider integrations
- `db/` - connection pools, grants, migrations, and RLS policies
- `config/` - logging and Swagger configuration
- `schemas/`, `types/` - Zod schemas and TypeScript declarations
- `utils/` - startup helpers, CORS, permissions, migrations, secret loading, OIDC env sync, and related utilities
- `tests/`, `__mocks__/` - Jest tests and mocks

When searching, ignore noisy/generated directories unless you explicitly need them:
- `node_modules/`
- `coverage/`
- `uploads/`
- `temp_uploads/`
- `backup/`
- `mock_data/`

## Architecture

### App Shell

- `SparkyFitnessServer.js` is the single app entrypoint. Do not create alternate boot paths unless the task explicitly calls for one.
- Route mounting is centralized in `SparkyFitnessServer.js`. If you add a new router, wire it there.
- Public API changes should keep Swagger output accurate. Update the relevant JSDoc-backed route docs when endpoints or payloads change.
- Graceful shutdown drains the HTTP server and database pools through `endPool()`.

### Database and RLS

- Use `getClient(userId, authenticatedUserId?)` from `db/poolManager.js` for normal user-scoped queries.
- `getClient(...)` sets the app context through `public.set_app_context(...)`; this is what makes row-level security work correctly.
- Use `getSystemClient()` only for admin, migration, startup, or policy-management tasks that intentionally bypass RLS.
- Always release database clients in a `finally` block.
- New migrations belong in `db/migrations/` and should use `YYYYMMDDHHMMSS_description.sql`.
- Startup automatically applies pending migrations via `utils/dbMigrations.js`, then reapplies `db/rls_policies.sql` via `utils/applyRlsPolicies.js`.
- If you add a table, add user-visible data, or change access behavior, update `db/rls_policies.sql` in the same change.

### Authentication and Permissions

- Better Auth is mounted early under `/api/auth`.
- The API supports cookie-backed sessions, API keys, and bearer session tokens.
- `middleware/authMiddleware.js` distinguishes API keys from session tokens and normalizes them into the auth flow.
- `req.authenticatedUserId` is the logged-in user. `req.userId` is the active RLS target after any allowed context switch.
- Family access and delegated access flow through `middleware/onBehalfOfMiddleware.js` and the permission helpers/middleware.
- If auth behavior changes, check whether the web app and mobile app depend on the same backend contract.

### Integrations and Schedules

- Provider-specific code lives under `integrations/`, with coordinating logic often in `services/` and persistence in `models/`.
- Scheduled jobs currently include:
  - daily backups at 2 AM
  - daily session cleanup at 3 AM
  - hourly provider syncs for Withings, Garmin, Fitbit, Polar, and Strava
- Integration changes often touch more than one layer. Check routes, services, repositories, and cron setup together before calling the work complete.

### JavaScript and TypeScript Mix

- This package is still primarily CommonJS JavaScript.
- TypeScript is used for type checking only; there is no compile output step in normal development.
- Current TS files are limited. Match the local convention around the code you are editing instead of converting files just for stylistic consistency.

## Environment and Secrets

- Runtime `.env` is expected at `../.env`.
- The tracked template lives at `../docker/.env.example`.
- Secrets can also be loaded from files via `utils/secretLoader.js`.
- Commonly required environment variables include:
  - `SPARKY_FITNESS_DB_HOST`
  - `SPARKY_FITNESS_DB_NAME`
  - `SPARKY_FITNESS_DB_USER`
  - `SPARKY_FITNESS_DB_PASSWORD`
  - `SPARKY_FITNESS_APP_DB_USER`
  - `SPARKY_FITNESS_APP_DB_PASSWORD`
  - `SPARKY_FITNESS_FRONTEND_URL`
  - `JWT_SECRET`
  - `SPARKY_FITNESS_API_ENCRYPTION_KEY`
- Common operational toggles include:
  - `SPARKY_FITNESS_SERVER_PORT`
  - `SPARKY_FITNESS_LOG_LEVEL`
  - `SPARKY_FITNESS_ADMIN_EMAIL`
  - `ALLOW_PRIVATE_NETWORK_CORS`
  - `SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS`

## Testing

- Jest is configured in `jest.config.js` and runs in the Node environment.
- The main test suite lives in `tests/*.test.js`. `jest.setup.js` loads the root `.env` and installs safe defaults for test execution.
- Use `pnpm run test:coverage` after broad route, service, model, or middleware refactors.
- If you touch auth, CORS, migrations, scheduled jobs, or provider sync behavior, run the closest targeted tests before stopping.
- `tests/check_routes.js` is a utility script, not a normal `*.test.js` suite. Do not assume everything in `tests/` is auto-discovered by Jest.

## Quick Routing

- Auth or session bug:
  inspect `auth.js`, `middleware/authMiddleware.js`, and `routes/authRoutes.js`
- Migration, RLS, or permission issue:
  inspect `db/migrations/`, `db/rls_policies.sql`, `db/poolManager.js`, `utils/applyRlsPolicies.js`, and permission helpers
- Provider integration bug:
  inspect the matching directory under `integrations/`, then the corresponding service and repository files
- Public API change:
  inspect the affected route file, then confirm registration in `SparkyFitnessServer.js` and Swagger coverage
- Startup, env, or deployment issue:
  inspect `SparkyFitnessServer.js`, `utils/preflightChecks.js`, `utils/secretLoader.js`, and `config/logging.js`

## Working Rules

- Keep changes isolated to this package unless the task clearly crosses package boundaries.
- Do not invent new startup flows, duplicated route registries, or alternate migration mechanisms when the existing startup path already covers the behavior.
- Match nearby conventions for JavaScript vs TypeScript, repository naming, and service structure instead of forcing a style migration as part of an unrelated fix.
- When adding new persisted data, think through schema, RLS, permissions, tests, and API documentation together.

## Priority Rule

- For work inside `SparkyFitnessServer/`, this file is the package guide.
- Use repo-root `../AGENTS.md` for monorepo context.
- Treat `CLAUDE.md` as legacy reference material; if you notice drift while updating docs, prefer this file and keep the two aligned when practical.
