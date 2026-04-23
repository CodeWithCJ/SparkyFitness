# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important**: Do not search or modify files outside of this directory unless explicitly asked. If work needs to happen in a sibling directory (e.g., the frontend), the user will run Claude Code from the parent directory instead.

`AGENTS.md` is the current package-level operating guide and should be kept aligned with this file. Prefer `AGENTS.md` when the two disagree.

## Project Overview

SparkyFitnessServer is a Node.js + Express 5 backend API for a fitness and nutrition tracking application, written in TypeScript (ESM). It provides:

- Food and meal tracking with nutrition data (including barcode scanning, label scanning via AI)
- Exercise logging, workout plans, and workout presets
- Health metrics (sleep, sleep science analytics, mood, fasting, measurements, body composition)
- Adaptive TDEE and BMR calculations
- Dashboard and reporting
- Chat (AI-powered)
- Integrations with external fitness/nutrition services
- Multi-user support with family access permissions
- Better Auth-based authentication with SSO, passkeys, MFA, and API keys

The repo is a `pnpm` workspace; this package depends on `@workspace/shared` (`../shared/`).

## Development Commands

Always use `pnpm` in this package (not `npm`).

```bash
# Start development server with hot reload (tsx + nodemon, watches routes/services/models/integrations/config/db/security)
pnpm start

# Tests (Vitest)
pnpm test
pnpm run test:watch
pnpm run test:coverage
pnpm run test:ci

# TypeScript type checking (no emit)
pnpm run typecheck

# Linting and formatting
pnpm run lint
pnpm run lint:fix
pnpm run format:check
pnpm run format

# Aggregate gate (typecheck + lint + format:check)
pnpm run validate
```

The server runs on port 3010 by default (configurable via `SPARKY_FITNESS_SERVER_PORT`).

## Required Environment Variables

The `.env` file should be in the parent directory (`../`). Secrets can also be loaded from files (Docker Swarm/Kubernetes) via `utils/secretLoader.ts`. The tracked template lives at `../docker/.env.example`.

Required:

- `SPARKY_FITNESS_DB_HOST`, `SPARKY_FITNESS_DB_NAME`, `SPARKY_FITNESS_DB_USER`, `SPARKY_FITNESS_DB_PASSWORD`
- `SPARKY_FITNESS_APP_DB_USER`, `SPARKY_FITNESS_APP_DB_PASSWORD` (for RLS-enabled app user)
- `SPARKY_FITNESS_FRONTEND_URL`
- `JWT_SECRET` (64 hex chars or 44 base64 chars)
- `SPARKY_FITNESS_API_ENCRYPTION_KEY` (64 hex chars or 44 base64 chars)

Optional:

- `SPARKY_FITNESS_SERVER_PORT` (default: 3010)
- `SPARKY_FITNESS_LOG_LEVEL` (DEBUG, INFO, WARN, ERROR, SILENT)
- `SPARKY_FITNESS_ADMIN_EMAIL` (sets a user as admin on startup)
- `ALLOW_PRIVATE_NETWORK_CORS` (enable private network CORS for self-hosted setups)
- `SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS` (additional trusted CORS origins)

## Architecture

### App Shell

- `index.ts` is the process entrypoint: loads `../.env`, runs file-based secret loading (`utils/secretLoader.ts`), executes `utils/preflightChecks.ts`, then dynamically imports `SparkyFitnessServer.ts`.
- `SparkyFitnessServer.ts` wires Express, mounts routes, configures Swagger/ReDoc, registers cron jobs, and handles graceful shutdown (drains HTTP + `endPool()`).
- Route mounting is centralized in `SparkyFitnessServer.ts`. When adding a router, wire it there.
- Most API routes are mounted under `/api`.

### Layer Structure

```
routes/          → Express route handlers (HTTP layer)
routes/v2/       → v2 API routes (stricter Zod contracts)
services/        → Business logic and orchestration
models/          → Database repositories (PostgreSQL via pg)
middleware/      → Auth, permissions, error handling, file uploads, sign-out cleanup
integrations/    → Third-party API integrations
schemas/         → Zod validation schemas
validation/      → express-validator rules
ai/              → AI service configuration
security/        → Encryption utilities
types/           → TypeScript type declarations (incl. express.d.ts)
constants/       → Shared constants
utils/           → Helpers (migrations, CORS, permissions, secret loading, preflight, timezone, OIDC env sync, etc.)
config/          → App configuration (logging, swagger)
db/              → Pool manager, connection, grants, migrations, RLS policies
tests/           → Vitest test files (*.test.ts) and scripts
__mocks__/       → Module mocks (minimal)
```

### Key Patterns

**Database Access with Row-Level Security (RLS)**

- Use `getClient(userId, authenticatedUserId?)` from `db/poolManager.ts` for user-scoped queries. It sets the app context via `public.set_app_context(...)`, which is what makes RLS work correctly.
- Use `getSystemClient()` only for admin, migration, startup, or policy-management work that intentionally bypasses RLS.
- Always release clients in a `finally` block.

```typescript
import { getClient } from '../db/poolManager.js';
const client = await getClient(userId, authenticatedUserId);
try {
  // queries here
} finally {
  client.release();
}
```

**Logging**

- Use `log(level, message, ...args)` from `config/logging.ts`.
- Levels: `'debug'`, `'info'`, `'warn'`, `'error'`. Never use `console.error` in application code.

**Authentication (Better Auth)**

- Auth is handled by Better Auth (`auth.ts`) with SSO, passkeys, and MFA (TOTP + email OTP). Mounted early under `/api/auth`.
- Session-based auth with signed cookies.
- API key auth via `Authorization: Bearer <api_key>` header (64+ char alphanumeric tokens).
- Session token auth via `Authorization: Bearer <session_token>` (shorter tokens, may contain dots).
- `middleware/authMiddleware.ts` distinguishes API keys from session tokens and normalizes them into the auth flow.
- `req.authenticatedUserId` is the logged-in user. `req.userId` is the active RLS target after any allowed context switch.
- SSO providers are dynamically synced from the database on startup.

**Permission System**

- Family access allows users to manage data for other users.
- Use `checkPermissionMiddleware(permissionType)` in routes.
- Permission types: `'diary'`, `'reports'`, `'checkin'`.
- `onBehalfOfMiddleware` handles acting on behalf of another user.

**TypeScript / ESM**

- `package.json` declares `"type": "module"`; all source files use ESM imports with `.js` extensions in import specifiers (NodeNext resolution), even though the source is `.ts`.
- The codebase is essentially fully TypeScript: routes, services, models, middleware, integrations, utils, config, db, schemas, tests.
- Type checking only (`noEmit: true`, `strict: true`, `noImplicitAny: true`, `noUnusedLocals: true`). No compile step in development — `tsx` runs `.ts` directly.
- **New code standards** (see `AGENTS.md`):
  - All new non-test files must be written in TypeScript.
  - All new endpoints must include Zod schemas for request/response validation.
  - All new endpoints must include Vitest tests in `tests/`.

**Validation**

- Zod schemas in `schemas/` for route request/param/response validation (Zod v4).
- Legacy express-validator rules live in `validation/` for a small number of older routes.

### Testing

- Vitest is configured in `vitest.config.ts`, running in the Node environment with `globals: true`.
- Test files live in `tests/**/*.test.ts`. Non-test scripts (e.g., `tests/check_routes.ts`, `tests/*.script.ts`) are intentionally not discovered by the runner.
- No Jest, no `NODE_OPTIONS='--experimental-vm-modules'`, no `jest.setup.js`.
- Module mocks live in `__mocks__/`.
- Run `pnpm run test:coverage` after broad route, service, model, or middleware refactors.

### Database Migrations

- SQL files in `db/migrations/` named `YYYYMMDDHHMMSS_description.sql`. They run automatically on server startup via `utils/dbMigrations.ts`.
- After migrations apply, `db/rls_policies.sql` is reapplied via `utils/applyRlsPolicies.ts`.
- If you add a table, expose user-visible data, or change access behavior, update `db/rls_policies.sql` in the same change.
- When you add or modify a migration, also update the repo-root schema snapshot at `../db_schema_backup.sql` in the same change.

### Integrations

External service integrations in `integrations/`:

- **Food databases**: OpenFoodFacts, FatSecret, Nutritionix, USDA, Mealie, Tandoor
- **Fitness devices**: Garmin Connect, Withings, Fitbit, Polar, Strava, Hevy
- **Exercise databases**: Wger, FreeExerciseDB
- **Health data**: Generic health data import (including mobile health data)

Each integration typically has a service file and may have a data processor file. Changes often span routes, services, repositories, and cron wiring — check them together.

### API Documentation

- Swagger UI: `/api/api-docs/swagger`
- ReDoc: `/api/api-docs/redoc`
- JSON spec: `/api/api-docs/json`
- `/api/api-docs` redirects to the Swagger UI.

API docs are generated from JSDoc comments in route/model files using `swagger-jsdoc`. Keep them accurate when endpoints or payloads change.

### Scheduled Tasks

`node-cron` runs scheduled tasks from `SparkyFitnessServer.ts`:

- Daily backups at 2 AM (with retention policy)
- Daily session cleanup at 3 AM
- Hourly provider syncs for Withings, Garmin, Fitbit, Polar, and Strava

## File Naming Conventions

- Routes: `*Routes.ts` (e.g., `foodEntryRoutes.ts`)
- Services: `*Service.ts` (e.g., `foodEntryService.ts`)
- Repositories: `*Repository.ts` (e.g., `foodRepository.ts`, `mealRepository.ts`)
- Some domain model files predate the Repository suffix and remain without it (e.g., `food.ts`, `foodEntry.ts`, `exercise.ts`)

## Planning

- **CRITICAL**: Before exiting plan mode or presenting a plan to the user, ALWAYS use the plan reviewer agent to review the plan first. Fix any issues the reviewer flags before showing the plan.
