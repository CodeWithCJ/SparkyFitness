# AGENTS.md

_Last updated: 2026-10-08_

SparkyFitness Server is the backend API package for the SparkyFitness monorepo. Use this file as the primary guide for work inside `SparkyFitnessServer/`.

**Quick Links for AI Tools:** See `../agent-docs/README.md` for:

- `file-and-domain-reference.md` — Where to find server code by feature
- `testing-patterns.md` — How to test routes, services, repositories, and RLS
- `architecture-permissions.md` — Permission types and RLS patterns
- `new-migration-checklist.md` — 8-step database change checklist

If a task also touches `shared/`, the frontend, or the mobile app, read the relevant package guide before editing outside this directory. Use `../AGENTS.md` for monorepo-level context.

## Scope

- This file is for package-local work in `SparkyFitnessServer/`.
- Keep changes inside this package unless the task clearly crosses package boundaries.
- This is the single source of truth for the package; `CLAUDE.md` just imports it via `See @AGENTS.md`.
- Do not invent alternate boot paths, duplicate route registries, or parallel migration flows when the current startup path already covers the behavior.

## Current Snapshot

- Dev boot path: `pnpm start` -> `nodemon` -> `tsx index.ts`
- `index.ts` loads `../.env`, applies file-backed secrets, runs preflight checks, calls `initializeDatabase()` for migrations and RLS policies, then imports `SparkyFitnessServer.ts`
- Main app shell: `SparkyFitnessServer.ts`
- Stack: Express 5, PostgreSQL via `pg`, Better Auth, Zod, TypeScript 5, Vitest 4, ESLint 10
- Module system: ESM with `type: "module"` and `moduleResolution: "NodeNext"`
- The package is now effectively TypeScript-first; almost all source files are `.ts`
- Main domains: food and meal tracking, exercise logging, health and sleep data, sleep science, fasting, medications, symptom and episode tracking, mood, menstrual cycle and pregnancy, reporting, AI chat, onboarding, identity, admin tooling, and external provider integrations

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

- Food assistant state: owner-only preferences, recoverable tasks and operation history use `FoodAssistant.api.zod.ts` / `FoodAssistant.zod.ts` in shared. Server: `routes/v2/foodAssistantRoutes.ts`, `services/foodAssistantService.ts`, `models/foodAssistantRepository.ts`, `ai/tools/foodAssistantTools.ts`. Recipes: `ai/tools/recipeTools.ts`, `services/foodAssistantRecipeService.ts` and `services/recipeImageService.ts` implement resumable source imports, exact provider portions, atomic publication/readback and conflict-safe undo. Web: `src/components/ai/FoodAssistantState.tsx`, `src/api/Chatbot/foodAssistantService.ts`.

- `index.ts` - real dev entrypoint; loads env, secrets, and preflight checks before booting the app
- `SparkyFitnessServer.ts` - Express app shell, route mounting, Swagger/ReDoc, startup, graceful shutdown
- `services/backgroundJobScheduler.ts` - starts every scheduled background job at startup, including the demo reset; provider syncs are listed in `services/providerSyncScheduler.ts`; `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true` skips them all
- `auth.ts` - Better Auth configuration, plugins, session behavior, SSO provider syncing
- `routes/` - primary HTTP route surface
- `routes/v2/` - newer typed route surface; pair these changes with `schemas/`
- `routes/v2/openFoodFactsContributionRoutes.ts` - owner-only single-food preview and explicit photo-backed publication; background contributions are disabled for this release
- `routes/v2/symptomRoutes.ts` - generic symptom tracking (`symptoms` permission): definitions (`/custom`), the pick-list library (`/options`), entries and episodes (`/entries`, `/entries/ongoing`, `/entries/:id/end`, `/entries/:id/severity`), photos, and symptom-free days. Logic lives in `services/symptomService.ts` over `models/symptomRepository.ts` and `models/symptomOptionRepository.ts`; the request/response contract is `../shared/src/schemas/api/Symptoms.api.zod.ts`
- `routes/reportRoutes.ts` `GET /reports/training-consistency` - the consistency view (#59): `reportService.getTrainingConsistency` reads a fixed 26 weeks of exercise entries and hands them to the shared `buildTrainingConsistency`, so web and mobile show the same streak and weekly sets (`reports` permission)
- `routes/v2/reportRoutes.ts` - weekly alcohol rollup and the zero-padded hydration/caffeine/alcohol range used by the Trends charts (`reports` permission)
- `routes/v2/nutritionKineticsRoutes.ts` - active-caffeine estimate and bedtime cutoff (`diary` permission)
- `routes/v2/workoutCoachingRoutes.ts` - adaptive coaching (#1560): session feedback (`workout_feedback`), the per-user `adaptive_workout_suggestions` setting (owner-only write), and recent-history signals (`diary` permission). `GET /v2/exercises/:id/alternatives` (ranked substitutes) lives in `routes/v2/exerciseRoutes.ts`
- `routes/v2/mindfulnessRoutes.ts` - mindfulness & meditation sessions tracking (`checkin` permission): day summaries (`/day-summary`), session logs and telemetry (`/entries`, `/entries/:id`). Logic lives in `models/mindfulnessRepository.ts`; the request/response contract is `../shared/src/schemas/api/Mindfulness.api.zod.ts`
- `routes/auth/` - auth-specific route fragments mounted through `routes/authRoutes.ts`
- `services/` - business logic and orchestration
- `models/` - PostgreSQL repositories and persistence helpers
- `middleware/` - auth, permissions, uploads, and shared Express middleware
- `utils/uploadsPath.ts` - the uploads root plus the resolver and containment guard for stored `file_path` values; use it instead of re-deriving `SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY`
- `utils/oauthState.ts` - server-issued single-use OAuth `state` nonces for provider linking (`issueOAuthState`, `persistOAuthState`, `claimOAuthState`); use it instead of hand-rolling a state value
- `utils/outboundHttp.ts` - process-wide outbound HTTP defaults, applied from `index.ts`: the axios request timeout and the per-address-family connect attempt timeout (`net.setDefaultAutoSelectFamilyAttemptTimeout`). Both are fixed constants on purpose - do not add env overrides, and read the sizing note there before changing either, because the two values interact
- `utils/errors.ts` - `ValidationError` plus `describeError(error)`; prefer it over `error.message` when logging any caught value, because an `AggregateError` or a non-Error throw renders as an empty string
- `middleware/requireSelfMiddleware.ts` - `requireSelfActor`, which rejects a switched/delegated context outright; attach per-route to account-linking routes
- `integrations/` - provider adapters and ingest pipelines
- `schemas/` - Zod route schemas
- `types/` - TypeScript declarations, including `Express.Request` augmentation
- `db/` - pool management, grants, migrations, and RLS policies
- `config/` - logging and Swagger config
- `utils/` - startup helpers, CORS, permissions, timezone loading, OIDC helpers, migration helpers
- `ai/` - AI provider configuration (`config.ts`), the unified provider-dispatch helper (`providerDispatch.ts`), and the in-process chatbot tool registry (`ai/tools/`)
- `security/` - encryption utilities (`encryption.ts`)
- `validation/` - legacy express-validator rules for a few older routes (new routes use Zod schemas)
- `constants/` - shared constants and supporting package data
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
- `SparkyFitnessServer.ts` creates the Express app, configures static upload serving, mounts auth interception, registers routes, exposes API docs, starts background jobs through `services/backgroundJobScheduler.ts`, and handles graceful shutdown
- Startup order matters:
  - `index.ts`: await `initializeDatabase()`, which applies pending migrations and then reapplies `db/rls_policies.sql` under a PostgreSQL advisory lock, **before** importing `SparkyFitnessServer.ts` (and therefore `auth.ts`)
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
- Three layers decide whether a variable has to be set, and they are easy to confuse:
  1. **`utils/preflightChecks.ts` refuses to start** without these four, because none has a safe default:
     - `SPARKY_FITNESS_DB_PASSWORD`
     - `SPARKY_FITNESS_FRONTEND_URL`
     - `SPARKY_FITNESS_API_ENCRYPTION_KEY`
     - `BETTER_AUTH_SECRET`
  2. **`preflightChecks.ts` fills in a default** for `SPARKY_FITNESS_DB_HOST` (`sparkyfitness-db`), `SPARKY_FITNESS_DB_NAME` (`sparkyfitness_db`), `SPARKY_FITNESS_DB_USER` (`sparky`) and the two app-role variables, logging which one it defaulted. These matter only outside Compose, which supplies them itself.
  3. **`docker/docker-compose.prod.yml` supplies a value** for almost everything via `${VAR:-default}`, so a Compose deployment only ever has to set the four in (1). Keep the defaults in (2) identical to Compose's: a value that differs between them silently points the server at a database other than the one Compose created.
- `SPARKY_FITNESS_APP_DB_USER` and `SPARKY_FITNESS_APP_DB_PASSWORD` are soft-required: preflight defaults the user to `sparky_app` and mints a password when absent, and `utils/dbMigrations.ts` creates the role or re-syncs its password so the two always match. It probes a connection as that role first, so an externally pre-created role is left alone and the owner does not need `CREATEROLE` — but only while `SPARKY_FITNESS_APP_DB_PASSWORD` still authenticates. If it is absent, preflight mints a new one, the probe fails, and the `ALTER ROLE` does need `CREATEROLE`; an externally managed database should therefore set both app variables explicitly. The probe only reports failure for an authentication rejection (`28P01`/`28000`); any other connection error propagates rather than being misread as a stale password. Both assignments must stay in `preflightChecks.ts`, because `db/poolManager.ts` freezes its credentials at module load
- `BETTER_AUTH_SECRET` is mandatory. It signs session cookies and encrypts stored 2FA/TOTP secrets, so a value that changes between restarts logs every user out and permanently locks out anyone with 2FA enabled. Startup used to mint a throwaway one when it was missing, which made exactly that happen silently; it now fails preflight instead
- Preflight also refuses to start when `BETTER_AUTH_SECRET` or `SPARKY_FITNESS_API_ENCRYPTION_KEY` still holds a template placeholder (a value starting with `changeme` or `replace_with`, as shipped in `docker/.env.example` and `docker/.env.simple.example`), and only warns for `SPARKY_FITNESS_DB_PASSWORD` because Compose initialises Postgres with it. Keep new template secrets on one of those prefixes so the check covers them. It also fails when `BETTER_AUTH_SECRET` base64-decodes to an empty key (Better Auth accepts an empty Buffer) and warns under 32 decoded bytes
- Common operational toggles include `SPARKY_FITNESS_SERVER_PORT`, `SPARKY_FITNESS_ADMIN_EMAIL`, `ALLOW_PRIVATE_NETWORK_CORS`, `ALLOW_PRIVATE_NETWORK_AI`, `ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS`, `SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS`, and `BETTER_AUTH_URL`
- User-configured self-hosted food providers (Mealie/Tandoor/Norish) can point `base_url` at a private/internal address only for admins by default; a non-admin on a multi-user server is blocked unless the operator opts in, either with the admin `allow_private_network_food_providers` toggle (Admin > Global Provider Settings) or `ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS=true`. This mirrors the AI policy (a single-user self-host is an admin, so their LAN recipe server works with no config). Enforced by `utils/outboundUrlPolicy.ts` at provider save time in `services/externalProviderService.ts`. Separate from the AI toggle by design
- The admin `allow_private_network_ai` toggle (Admin > Global AI Settings), or `ALLOW_PRIVATE_NETWORK_AI=true`, lets non-admin users use custom AI service URLs (`custom`/`ollama`/`openai_compatible`) that resolve to private/internal addresses; default off is an SSRF guard enforced by `utils/outboundUrlPolicy.ts` at save/test time and again in the runtime guarded fetch path. Current admins and global admin-created AI settings can use private URLs for self-hosted providers like Ollama
- **Call `resolveAiNetworkPolicy` / `resolveFoodProviderNetworkPolicy`, not the `derive*` forms.** The sync `derive*` functions only see the env var; the async `resolve*` wrappers also consult the admin toggle (and only hit the database when the sync answer would be a denial). The `derive*` exports stay for unit tests and for the resolvers themselves

### TypeScript and Module Conventions

- This package is now almost entirely TypeScript; new source files should be `.ts`
- Keep local relative imports using `.js` extensions from TypeScript files, for example `import foo from './foo.js'`
- `eslint.config.js` enforces file extensions in imports
- `tsconfig.json` uses `NodeNext`, `noEmit`, and `allowJs: false`
- `@workspace/shared` resolves directly to `../shared/src/index.ts` here and in Vitest
- Avoid using `any` declarations in models, repositories, and integration services (e.g. `integrations/fatsecret/fatsecretService.ts`). Instead, use base datatypes (like `string`), proper types/interfaces, or import strict type schemas directly from `@workspace/shared`.
- New public endpoints should include TypeScript code, Zod validation, and automated tests

### Logging

- Use `log(level, message, ...args)` from `config/logging.ts`; levels are `'debug'`, `'info'`, `'warn'`, and `'error'`
- Never use `console.error` (or other `console.*`) in application code
- Exception: fatal boot diagnostics in `index.ts` and `utils/preflightChecks.ts` print with `console.error` (alongside `log('error', ...)`), because `log()` is suppressed at `SILENT` and the operator must still see why the server refused to start
- `SPARKY_FITNESS_LOG_LEVEL` controls verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`, `SILENT`)

### Database and RLS

- Use `getClient(userId, authenticatedUserId?)` from `db/poolManager.ts` for normal user-scoped queries
- `getClient(...)` sets `public.set_app_context(...)`; that is what makes row-level security work correctly
- Use `getSystemClient()` only for admin, migration, startup, or policy-management work that intentionally bypasses RLS
- Always release database clients in a `finally` block
- To learn a table's current shape, read `../shared/src/schemas/database/<Table>.zod.ts` (one small Zod file per table) instead of reading `../db_schema_backup.sql` or reconstructing it from the 185 migration files
- New migrations belong in `db/migrations/` and must use `YYYYMMDDHHMMSS_description.sql`
- **Never manually edit `../db_schema_backup.sql`** — after merge, CI regenerates it from the migrations and opens an automated sync PR (`.github/workflows/schema-backup.yml`). Do not commit copies generated from a local database.
- If you add a new table or change user-visible access behavior, follow `../agent-docs/new-migration-checklist.md`. In short, you MUST:
  1. Add/modify the RLS policies in `db/rls_policies.sql`.
  2. Update the user-facing documentation in `../docs/src/features/family-friends-sharing.md`.
  3. Update the developer-facing documentation in `../docs/src/developer/database-security-tiers.md` to define its security tier (Tier 1, Tier 2, or Tier 3).
  4. Add or update the matching Zod schema in `../shared/src/schemas/database/`.
- Keep future schema-startup steps in `utils/initializeDatabase.ts` and pass its shared client through all database work. The lock and schema work must use the same connection so initialization cannot continue on another connection after the lock-owning session is lost. Do not create alternate migration mechanisms.
- Migrations run from `index.ts`, **before any application module is imported**, and via dynamic `await import()`. Both details are load-bearing: Better Auth validates the schema eagerly at `auth.ts` module scope and caches a mismatch for the life of the process (issues #2469 / #2470), and `db/poolManager.ts` builds its pools at module load, so a static import would be hoisted above the env/secret loading. `tests/bootOrder.test.ts` guards this

### Uploads: Public vs Sensitive

- `SparkyFitnessServer.ts` serves the uploads root publicly at `/uploads` and `/api/uploads`; both are in `publicRoutes`, so `authenticate` never runs on them
- Sensitive subtrees are **denied on the static mount** and served instead by an authenticated, owner-checked per-id route. Three exist today:
  - `check-in` -> `GET /api/measurements/check-in-photos/file/:id` (delegatable via the `checkin` permission)
  - `pregnancy` -> `GET /api/v2/pregnancy/photos/file/:id` (owner-only; deliberately **no** `checkPermissionMiddleware`, because reproductive-health data is never delegated)
  - `symptoms` -> `GET /api/v2/symptoms/photos/file/:id` (delegatable via the `symptoms` permission)
- Adding a sensitive upload subtree means adding its directory name to `SENSITIVE_UPLOAD_SUBTREES` in `SparkyFitnessServer.ts` **and** adding an authenticated file route; the deny rule matches the decoded, normalized path, because a prefix match on the raw URL is bypassable with `..%2f`
- Responses for these domains omit `file_path`: the on-disk layout is a server detail and clients address photos by id
- `tests/uploadsStaticMount.test.ts` guards both the deny behavior and the fact that the deny rule is registered before `express.static`

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
- `checkPermissionMiddleware(permissionType)` guards routes; permission types are `'diary'`, `'reports'`, `'checkin'`, `'medications'`, and `'symptoms'` (GET resolves to the read-only `*_read` variant)
- If you change auth behavior, check both cookie-backed sessions and API key flows
- API keys carry a scope in `api_key.permissions` (Better Auth format, `@workspace/shared` `ApiKeys.api.zod.ts`): `{ sparky: ["read"] }` is read-only, `{ sparky: ["read", "write"] }` or no permissions is full access. The scope is set only by `POST /api/identity/user/generate-api-key`, because Better Auth refuses `permissions` from a client. `authenticate` sets `req.apiKeyReadOnly` and answers 403 for anything but GET/HEAD/OPTIONS plus the POST allowlist in `utils/apiKeyScope.ts`; the `/api/auth` interceptor refuses mutations from read-only keys via `middleware/readOnlyApiKeyGuard.ts`; `/mcp` filters tools and actions with `ai/mcp/toolAccess.ts`. A new MCP tool or action is unavailable to read-only keys until it is classified there

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
- Current adapters span food/nutrition (OpenFoodFacts, FatSecret, Nutritionix, USDA, Mealie, Tandoor, Norish, SwissFood, Yazio), fitness devices (Garmin Connect sync plus FIT file import via `integrations/garminfit/` + `services/fitImportService.ts`, Withings, Fitbit, Oura, Polar, Strava, COROS, Hevy), exercise databases (Wger, FreeExerciseDB), and health-data import (Google Health, generic/mobile health data)
- Scheduled jobs currently include backups, session cleanup, and hourly sync loops for Withings, Garmin, Fitbit, Oura, Polar, Strava, and COROS
- Integration work often spans route, service, repository, cron, and external-provider settings code; inspect the whole path before calling the work complete
- **OAuth linking (`/authorize`, `/callback`) is self-only, and `state` is a server-issued single-use nonce.** Never derive a user id from a callback request body, and never gate an authorize route with `checkPermissionMiddleware('diary')` — on GET that resolves to `diary_read`, which would hand a read-only delegate the owner's decrypted OAuth client id. Use `requireSelfActor` plus `utils/oauthState.ts`. Withings and Polar follow this pattern; Oura, Fitbit and Strava are self-only but still send `state = userId` and ignore it on callback (tracked follow-up)

### AI Services

- AI calls go through the Vercel `ai` SDK (v6) with provider adapters for OpenAI, Anthropic, and Google, plus OpenAI-compatible, Mistral, Groq, OpenRouter, and Ollama service types
- `ai/config.ts` holds default model and vision-model selection per provider; `ai/providerDispatch.ts` is the unified dispatch helper used by chat, food-photo analysis, nutrition-label scan, and unit conversion
- Prefer routing new AI features through `providerDispatch.ts` instead of calling provider SDKs directly
- Chatbot tool calls run in-process through the registry in `ai/tools/`
- `ai/tools/index.ts` exposes `buildChatbotTools(userId, tz)`, composing the per-domain builders (`build<Domain>Tools` in `ai/tools/<domain>Tools.ts`); handlers close over the authenticated user — so two-actor services receive `(userId, userId, ...)` — and the user's IANA timezone, used for "today" defaults and day bucketing
- Tool handlers follow a fixed contract: publish a flat Zod schema, validate with a strict union `safeParse` inside `execute`, orchestrate through existing services and repositories, and never throw - errors come back as `ERRORS.*` strings from `ai/tools/errors.ts`
- Tool output text is a parity contract with the MCP tool set; golden tests in `tests/chatbotTools*.test.ts` assert exact returned strings, so do not reword tool output casually

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
- Open Food Facts publication:
  inspect `services/openFoodFactsManualContributionService.ts`, `integrations/openfoodfacts/openFoodFactsContribution.ts`, and `constants/openFoodFacts.ts`; retained automatic queue code is dormant and needs a new migration before a future release can activate its triggers
- Health data or date bucketing issue:
  inspect `integrations/healthData/healthDataRoutes.ts`, `services/measurementService.ts`, and `utils/timezoneLoader.ts`
- Attaching heart rate to an already-existing exercise entry (e.g. from a paired Apple Watch's live workout tracking, `SparkyFitnessMobile/src/hooks/useWatchWorkoutBridge.ts`):
  inspect `POST /exercise-entries/:id/watch-telemetry` in `routes/exerciseEntryRoutes.ts`, `services/exerciseEntryService.ts`'s `attachWatchTelemetryToExerciseEntry`, and `models/exerciseEntry.ts`'s `applyWatchTelemetryAtomically`. Distinct from `services/healthDataHandlers.ts`'s `persistWorkoutTelemetry`, which creates a new entry as part of importing a whole synced workout (HealthKit/Health Connect/Garmin) — this route only fills in avg/max HR, `exercise_entry_hr_zones` and `calories_burned` on an entry that already exists. `activeEnergyKcal` is a real measurement from the watch and is written to BOTH `calories_burned` (the figure the diary totals) and `active_calories` (a telemetry column the ordinary entry update preserves). That second write is what makes the measurement survive a later edit: `resolveEditedCaloriesBurned` in `services/exerciseService.ts` prefers a stored `active_calories` over the recomputed duration-and-sets estimate, so editing a note or a weight no longer replaces what a watch measured with a formula. A client-sent `calories_burned` still overrides both. Both body fields are individually optional (HealthKit permissions are per type) and the model does a partial UPDATE, so a calories-only post must not blank heart rate an earlier post attached.
- Water, hydration, caffeine, or alcohol issue:
  inspect `services/hydrationTotalsService.ts` (the single owner of the daily water formula), `services/measurementService.ts` (the container "+/-" path and the container->food link), `services/caffeineKineticsService.ts` / `services/alcoholWeekService.ts`, `models/waterContainerRepository.ts`, and the shared maths in `../shared/src/nutrients/`
- Self-service "delete synced data by source" issue:
  inspect `routes/syncedDataRoutes.ts`, `services/syncedDataService.ts`, and `models/syncedDataRepository.ts` (the `SYNCED_SOURCE_TABLES` whitelist)
- AI chat or chatbot tool issue:
  inspect `services/chatService.ts`, `ai/tools/`, and the matching domain service and repository
- Fasting or mood issue:
  inspect `routes/fastingRoutes.ts` / `routes/moodRoutes.ts` and `models/fastingRepository.ts` / `models/moodRepository.ts`
- Symptom or episode tracking issue (#1882):
  inspect `routes/v2/symptomRoutes.ts`, `services/symptomService.ts`, `models/symptomRepository.ts`, `models/symptomOptionRepository.ts`, and the shared contract and built-ins in `../shared/src/schemas/api/Symptoms.api.zod.ts` and `../shared/src/symptoms/`. `symptom_entries` also holds cycle-hub symptoms (`source = 'cycle'`), which RLS keeps owner-only
- Medications, cycle, or pregnancy issue:
  inspect the matching v2 route (`routes/v2/medicationRoutes.ts`, `routes/v2/cycleRoutes.ts`, `routes/v2/pregnancyRoutes.ts`), its Zod schema in `schemas/`, then `services/cycleService.ts` / `services/pregnancyService.ts` and the `models/medication*Repository.ts` / `models/cycleRepository.ts` / `models/pregnancyRepository.ts` files
- Supplement barcode lookup:
  `GET /api/v2/medications/supplement-lookup?upc=` (registered before `/:id`) runs only while the user can see an active `dsld` or `openfoodfacts` external provider (`getActiveProvidersByTypes`; neither is a 404; the NIH database answers first and `services/supplementOpenFoodFactsService.ts` asks Open Food Facts, per-serving nutrients only, when it has no match or `dsld` is off; migration `20261006200000_add_dsld_provider_type.sql`, constant `SUPPLEMENT_LOOKUP_PROVIDER_TYPE`) and calls `services/supplementLookupService.ts`, which searches the NIH Dietary Supplement Label Database for the code, opens the hits to check the label's own UPC, and maps the label to one serving's nutrients in the app's units (IU for vitamins A, D and E converted, compounds and unplaceable ingredients returned as `unmatched`). The response contract is `shared/src/schemas/api/SupplementLookup.api.zod.ts`; an unreachable database is a 502, no match is `{ product: null }`.
- Exercise alternatives, workout feedback, or adaptive suggestions issue (#1560):
  inspect `services/exerciseAlternativesService.ts` (library + Free Exercise DB candidates, dedupe) with the pure ranking in `utils/exerciseAlternativesRanking.ts` and the muscle/equipment vocabulary in `../shared/src/constants/exerciseTaxonomy.ts`; feedback in `services/workoutCoachingService.ts` + `models/workoutFeedbackRepository.ts`; signals in `services/adaptiveWorkoutService.ts`. The rules that turn signals into weight changes are client-side and shared (`../shared/src/utils/adaptiveCoaching.ts`) so web, mobile and the AI tools agree; the server only reports what happened. AI actions: `suggest_alternatives`, `rate_workout`, `get_workout_coaching` in `ai/tools/exerciseTools.ts`
- Bodyweight exercise load, volume or 1RM issue (#56):
  a `bodyweight_reps` set's weight is signed added/assisting load, and its load is body weight plus that weight (`effectiveLoadKg` in `../shared/src/utils/exerciseLoad.ts`). SQL mirrors the rule in `utils/exerciseLoadSql.ts` (`bodyWeightJoinSql`, `setLoadSql`), used by `services/exerciseStatsService.ts` and `models/exerciseEntry.ts`'s progress query; `services/reportService.ts` applies the shared helper with readings from `reportRepository.getBodyWeightReadings`. Keep the two copies identical. A negative set weight is rejected unless that exercise's modality is `bodyweight_reps`. `models/exercise.ts`'s `createExercise` defaults the modality from equipment through `resolveExerciseModality`
  `weight_distance` (weighted carries) and `weight_duration` (loaded holds) store weight plus distance (km) or duration (s); stats treat them as weight-based, not cardio, and best-set ordering falls back to distance then duration.
- Sleep or sleep-science issue:
  inspect `routes/sleepRoutes.ts`, `routes/sleepScienceRoutes.ts`, `services/sleepAnalyticsService.ts`, `services/sleepScienceService.ts`, and the sleep repositories

## Architecture Resources

Before adding a feature or changing auth/permission behavior, read:

- `../docs/src/developer/database.md` — Quick table index (all ~120 tables with purpose) + migration best practices
- `../docs/src/developer/database-security-tiers.md` — Security tier, permission type, and RLS rules for every table (authoritative)
- `../agent-docs/architecture-permissions.md` — Permission types, links to tier classification doc
- `../agent-docs/data-flow-patterns.md` — Data flow from frontend through server to database, safe RLS patterns
- `../agent-docs/new-domain-template.md` — Checklist for adding a major feature domain
- `../agent-docs/anti-patterns.md` — Common mistakes (using getSystemClient(), forgetting RLS, cache invalidation, timezone bugs, cross-package contract mismatches)

## Working Rules

- Match the existing service/repository/middleware layering instead of introducing parallel abstractions
- **Library Deletes vs Diary Snapshots:** `exercise_entries` and `food_entries` are snapshot-backed (`exercise_id` / `food_id` are `ON DELETE SET NULL`). `deleteExercise` and `deleteFood` (`mode: 'delete'`) must never delete past or today's diary entries; they cascade from templates/presets, clean up future scheduled plan entries (`entry_date >= today AND workout_plan_assignment_id IS NOT NULL`), and clean up empty parent preset entries. Only explicit `delete_with_history` (force delete) deletes diary entries for that user. If an item is referenced by others (`otherUserReferences > 0`), the delete must fall back to `hide` (`is_quick_exercise` / `is_quick_food`).
- If your change adds a new domain, route family, or table, update this file's Snapshot, Source Map, and Quick Routing sections (and the `Last updated` date) in the same change
- If you add persisted or user-visible data, think through migration, RLS, permissions, tests, API docs, and downstream client contracts together
- Validate shared-contract changes from the affected consumers, not just from this package
- Keep package-specific guidance here; use `../AGENTS.md` only for cross-package context

## File Naming Conventions

- Routes: `*Routes.ts` (e.g., `foodEntryRoutes.ts`)
- Services: `*Service.ts` (e.g., `foodEntryService.ts`)
- Repositories: `*Repository.ts` (e.g., `foodRepository.ts`, `mealRepository.ts`)
- Some domain model files predate the Repository suffix and remain without it (e.g., `food.ts`, `foodEntry.ts`, `exercise.ts`)

## Planning

- Before presenting a plan for server work, self-review it against `../agent-docs/plan-review-checklist.md` and fix any gaps first.

## Priority Rule

- For work inside `SparkyFitnessServer/`, this file wins over repo-root guidance on package-specific details
- Use `../AGENTS.md` for monorepo context
- If a task spans multiple packages, combine this guide with the other affected package guides instead of relying on one file alone
