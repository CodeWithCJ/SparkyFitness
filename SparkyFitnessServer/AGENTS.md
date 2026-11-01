# AGENTS.md

_Last updated: 2026-10-30_

SparkyFitness Server is the backend API package for the SparkyFitness monorepo. Use this file as the primary guide for work inside `SparkyFitnessServer/`.

**Quick Links for AI Tools:** See `../agent-docs/README.md` for:

- `file-and-domain-reference.md` — Where to find server code by feature
- `testing-patterns.md` — How to test routes, services, repositories, and RLS
- `architecture-permissions.md` — Permission types and RLS patterns
- `new-migration-checklist.md` — 8-step database change checklist

If a task also touches `shared/`, the frontend, or the mobile app, read the relevant package guide before editing outside this directory. Use `../AGENTS.md` for monorepo-level context.

## Scope

- This file is for package-local work in `SparkyFitnessServer/`.
- Keep this guide to rules and short pointers. A note longer than a few lines goes in `agent-docs/<section>.md` (this package's folder, one file per section of this guide) under its own heading, with a one-line link here.
- Keep changes inside this package unless the task clearly crosses package boundaries.
- This is the single source of truth for the package; `CLAUDE.md` just imports it via `See @AGENTS.md`.
- Do not invent alternate boot paths, duplicate route registries, or parallel migration flows when the current startup path already covers the behavior.

## Current Snapshot

- Dev boot path: `pnpm start` -> `nodemon` -> `tsx index.ts`
- `index.ts` loads `../.env`, applies file-backed secrets, runs preflight checks, calls `initializeDatabase()` for migrations and RLS policies, then imports `SparkyFitnessServer.ts`
- Main app shell: `SparkyFitnessServer.ts`
- Stack: Express 5, PostgreSQL via `pg`, Better Auth, Zod, TypeScript 6, Vitest 5, ESLint 10
- Module system: ESM with `type: "module"` and `moduleResolution: "NodeNext"`
- The package is now effectively TypeScript-first; almost all source files are `.ts`
- Main domains: food and meal tracking, exercise logging, health and sleep data, sleep science, fasting, medications, symptom and episode tracking, mood, menstrual cycle and pregnancy, reporting, AI chat, onboarding, identity, admin tooling, NFC action tags, and external provider integrations
- External provider integrations include the Intervals.icu API-key provider (`routes/intervalsRoutes.ts`, `integrations/intervals/`) for activities and wellness

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

- Family diary copies: `foodEntryRoutes.ts` exposes actor-scoped reviewed and selected copies in both directions. `foodEntryService.ts` checks the real actor's copy grant; `models/foodEntry.ts` rechecks reviewed rows and writes the whole copy atomically. `GET /meal-types/family/:familyUserId` reads recipient meal types under the same copy permission without switching profiles. Existing web `/copy-to-user` stays context-scoped.

- Barcode lookup retains the local/default/fallback behavior in `foodCoreService.ts`. `services/barcodeLookupService.ts` collects accessible source matches on demand; `routes/v2/barcodeRoutes.ts` exposes the read-only alternatives endpoint. Source comparison does not persist routing settings or preferences.
- Alternative source lookups abort product requests after 12 seconds. Only normalized external matches/misses are cached for 30 seconds per account, profile, barcode, provider and nutrition settings; repeated in-flight lookups share work. Provider availability, preferences and saved local foods are checked on every request, and errors remain retryable.

- Food assistant state: owner-only preferences, recoverable tasks and operation history use `FoodAssistant.api.zod.ts` / `FoodAssistant.zod.ts` in shared. Server: `routes/v2/foodAssistantRoutes.ts`, `services/foodAssistantService.ts`, `models/foodAssistantRepository.ts`, `ai/tools/foodAssistantTools.ts`. Web: `src/components/ai/FoodAssistantState.tsx`, `src/api/Chatbot/foodAssistantService.ts`.

- `index.ts` - real dev entrypoint; loads env, secrets, and preflight checks before booting the app
- `SparkyFitnessServer.ts` - Express app shell, route mounting, Swagger/ReDoc, startup
- `utils/gracefulShutdown.ts` - SIGTERM/SIGINT drain: stops accepting connections, closes keep-alive connections once their responses are written out (never cutting off a response still being sent), stops scheduled jobs from firing and waits for running ones, provider syncs and tracked background work, releases sync claims still held, closes the pools, and exits 1 after `SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS` (default 15, parsed by `shutdownTimeoutMs`). Work a route or job starts without awaiting (a 202 reply, a `void` call) must go through `trackBackgroundWork` in `utils/shutdownHooks.ts`, or shutdown closes the pools under it; long loops check `isShuttingDown()` before starting the next item
- `services/backgroundJobScheduler.ts` - starts every scheduled background job at startup, including the demo reset; provider syncs are listed in `services/providerSyncScheduler.ts`; `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true` skips them all
- `services/onlineRestoreGuard.ts` - `assertRestoreAllowed()`: refuses an in-app restore (409, before the upload, and again inside `performRestore` before anything is deleted) when `SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS=true` or another instance's `sparkyfitness-*` sessions show in `pg_stat_activity`. Best effort: idle pools close after 30 s, so an idle instance is invisible; operators scale to one instance first
- `services/providerSyncClaim.ts` - every provider sync, manual or scheduled, runs through `startProviderSync`, which claims the account and stops the sync when the claim is lost or it gets no database connection and runs no query for 20 minutes; a stopped sync's next `getClient`/`getSystemClient` throws (`utils/abortScope.ts`), while a transaction already running on a connection it holds still finishes, so sync writes stay idempotent. Sync code gets connections only through those two, and never through `runOutsideAbortScope`, which is for fenced cleanup such as releasing the claim
- `auth.ts` - Better Auth configuration, plugins, session behavior, SSO provider syncing
- Remote MCP OAuth: `auth.ts` conditionally installs the JWT/MCP plugins only for HTTPS or loopback public URLs and rechecks authorization redirects against the administrator allowlist through Better Auth's `validateRedirectUri`; `utils/mcpOAuth.ts` owns public/resource/issuer URLs, metadata-probe classification, loopback JWKS verification URL, and redirect allowlist matching; `SparkyFitnessServer.ts` gates discovery and `/api/auth/oauth2*`; `middleware/mcpOAuthAuthInterceptor.ts` enforces registration redirect policy and safe consent deletion; `middleware/authMiddleware.ts` `authenticateMcp` accepts OAuth tokens before the API-key/session fallback; `models/oauthClientRepository.ts` enforces consent, enabled-client status, and revocation
- `routes/` - primary HTTP route surface
- `routes/v2/` - newer typed route surface; pair these changes with `schemas/`
- `routes/v2/openFoodFactsContributionRoutes.ts` - owner-only single-food preview and explicit photo-backed publication; background contributions are disabled for this release
- `routes/v2/symptomRoutes.ts` - generic symptom tracking (`symptoms` permission): definitions (`/custom`), the pick-list library (`/options`), entries and episodes (`/entries`, `/entries/ongoing`, `/entries/:id/end`, `/entries/:id/severity`), photos, and symptom-free days. Logic lives in `services/symptomService.ts` over `models/symptomRepository.ts` and `models/symptomOptionRepository.ts`; the request/response contract is `../shared/src/schemas/api/Symptoms.api.zod.ts`
- `routes/reportRoutes.ts` `GET /reports/training-consistency` - the consistency view (#59): `reportService.getTrainingConsistency` reads a fixed 26 weeks of exercise entries and hands them to the shared `buildTrainingConsistency`, so web and mobile show the same streak and weekly sets (`reports` permission)
- `routes/reportRoutes.ts` `GET /reports/training-load` - acute (7 days) against chronic (4-week average) workout load (#250): `reportService.getTrainingLoad` reads every logged workout through `reportRepository.getTrainingLoadSessions` and the person's heart rate zones (`heartRateZoneService.resolveZonesForUser`), and hands them to the shared `computeTrainingLoad` (`reports` permission)
- `routes/reportRoutes.ts` `GET /reports/fitness-fatigue` - the 90-day fitness (42-day average load), fatigue (7-day) and form curve plus today's 0 to 100 readiness score: `reportService.getFitnessFatigue` reuses the training-load sessions, adds last night's sleep, resting heart rate and HRV against the 14 nights before through `reportRepository.getReadinessVitals` (the baseline is the median of the nights from the same `sleep_entries.source` as the newest reading, since integrations measure HRV differently, and returns how many nights it used; the shared `computeReadiness` ignores a baseline under `MIN_BASELINE_NIGHTS` = 5 and returns the raw `vitals` for the UI), the daily sleep need from `sleepScienceRepository.getDailyNeed`, and hands them to the shared `computeFitnessFatigue` and `computeReadiness` (`reports` permission)
- `routes/reportRoutes.ts` `GET /reports/run-estimates` - estimated VO2 max (median over qualifying runs in 6 weeks, needs 2, from pace and the share of heart-rate reserve used) and average running power (last 4 weeks, from pace, body weight and climb): `reportService.getRunningEstimates` takes the cardio entries `reportRepository.getRunCandidates` returns, keeps those shared `classifyActivitySport` calls running (sport is not a column), reads resting heart rate from the sleep baseline (else the one in the heart rate zone settings) and max heart rate from `heartRateZoneService.resolveZonesForUser`, with the latest check-in weight, and hands them to the shared `computeRunningEstimates` (`shared/src/utils/runningEstimates.ts`), whose `vo2Max.series` also lists the figure per run day for the mobile Dashboard trend. Both are model estimates, not measurements, and must be labelled so (`reports` permission)
- `routes/v2/reportRoutes.ts` - weekly alcohol rollup and the zero-padded hydration/caffeine/alcohol range used by the Trends charts (`reports` permission)
- `routes/v2/reportRoutes.ts` `GET /compare` - does A go with B (`/api/v2/reports/compare`, owner-only via `requireSelfActor`): parses `compareQuerySchema`, `services/compareService.ts` (`getCompare`) loads both metrics through `models/compareRepository.ts` (today and the current week never counted) and hands them to the shared analysis in `../shared/src/compare/` (`stats.ts`, `metrics.ts` catalog, `analyze.ts` day/week pairing); week mode uses `utils/firstDayOfWeek.ts` and training load is weighted by the person's zones (`heartRateZoneService.resolveZonesForUser`); `mode=since` (before vs since a habit started) parses `compareSinceQuerySchema` instead (it refuses a metric not offered in since mode, i.e. weight trend) and calls `getCompareSince`, which hands the shared analysis in `../shared/src/compare/since.ts` the habit over the last 730 days plus two weeks (the analysis holds a suggested start to the last 730 days, `SINCE_START_MAX_DAYS_AGO`, and offers none for a habit already kept at that limit); contract `../shared/src/schemas/api/Compare.api.zod.ts`. The AI tool `ai/tools/compareTools.ts` (`sparky_compare_metrics`, `reports` category, read-only for MCP keys) asks the same two service functions through the shared query schemas and renders the result as text; its English metric names and wording live in that file
- `routes/v2/nutritionKineticsRoutes.ts` - active-caffeine estimate and bedtime cutoff (`diary` permission)
- `routes/v2/workoutCoachingRoutes.ts` - adaptive coaching (#1560): session feedback (`workout_feedback`), the per-user `adaptive_workout_suggestions` setting (owner-only write), and recent-history signals (`diary` permission). `GET /v2/exercises/:id/alternatives` (ranked substitutes) lives in `routes/v2/exerciseRoutes.ts`
- `routes/v2/routeRoutes.ts` - the person's saved routes (`/api/v2/routes`: `GET` summaries, `POST` a drawn route from `points` (+ optional `cues`), `POST /import-gpx` with the file text, `POST /from-activity/:exerciseEntryId` from a recorded GPS track, `GET/PATCH/DELETE /:id` (PATCH renames, changes the activity or replaces the line: `points` + optional `cues` go through `prepareRoute`, which recomputes distance and climb in the same UPDATE and leaves `source`, `source_exercise_entry_id` and `created_at` alone; cues need `points` and every cue index must be below the point count), `GET /:id/gpx` download; 200 per person); owner-only (`requireSelfActor`, `routes` owner policy). `models/routeRepository.ts` stores them; `utils/routePrep.ts` (`prepareRoute`) drops repeated points, measures distance and climb on the full track, thins to 2000 points and re-points cues. Geometry, GPX read/write and the contract are shared: `../shared/src/utils/routeGeometry.ts`, `routeGpx.ts`, `../shared/src/schemas/api/Route.api.zod.ts`
- Route generation endpoints (routeRoutes.ts): see [source-map.md](agent-docs/source-map.md#route-generation-endpoints-routeroutests).
- Run program routes (runProgramRoutes.ts): see [source-map.md](agent-docs/source-map.md#run-program-routes-runprogramroutests).
- `routes/v2/runGoalRoutes.ts` - the person's running goals (`/api/v2/run-goals`: `GET`, `PUT` where only the fields sent change and null clears one): a weekly distance target (`weekly_distance_km`) and a race (`race_name`, `race_date`, `race_distance_km`), one `run_goals` row per user, owner-only (`requireSelfActor`, `run_goals` owner policy). `GET` also returns `progress` from `services/runGoalService.ts`: this week's logged running kilometres (the week starts on the account's `first_day_of_week`, "today" is the profile timezone), the share of the target, the daily distance still needed, and the days to the race, all worked out by the pure shared `buildRunGoalProgress` (`../shared/src/utils/runGoals.ts`). Only entries `classifyActivitySport` reads as running count, from `exercise_entries.distance` (km) with the name, category and notes; the provider sport enum in `exercise_entry_activity_details` is not consulted. A race name or distance without a race day is refused by the table check `chk_run_goals_race_has_date` (400). The contract is `../shared/src/schemas/api/RunGoals.api.zod.ts`; the repository is `models/runGoalRepository.ts`
- `routes/v2/heartRateZoneRoutes.ts` - the person's heart rate zone settings (`GET`/`PUT /api/v2/heart-rate-zones`; max and resting heart rate, `percent_max` / `heart_rate_reserve` / `custom` method, custom floors, `display_zones` 4 or 5 for how many bands clients show (column `hr_zone_display_count`; display only); `reset: true` restores defaults). Owner-only (`requireSelfActor`, also on reads). Logic in `services/heartRateZoneService.ts` over `models/heartRateZoneRepository.ts` (columns on `user_preferences`); `resolveZonesForUser(userId, observedMaxBpm?)` is what stored time in zone (`healthDataHandlers.persistWorkoutTelemetry`, `exerciseEntryService.attachWatchTelemetryToExerciseEntry`) and training load use. Zone maths is `../shared/src/utils/heartRateZones.ts`; the contract is `../shared/src/schemas/api/HeartRateZones.api.zod.ts`. Stored `exercise_entry_hr_zones` rows carry `zone_method` (`device` for Garmin) and are never recomputed when settings change.
- `routes/v2/fitnessTestRoutes.ts` - running fitness tests (`/api/v2/fitness-tests`: `GET` the list newest first, `GET /latest`, `POST` to save, `DELETE /:id`); owner-only (`requireSelfActor`, `fitness_tests` owner policy), so a switched/delegated context gets 403. The body carries only the measurements (`test_type` `5k` / `30min` / `cooper`, `test_date`, `distance_meters`, `duration_seconds`, `split_distance_meters` for the 30-minute run, optional `exercise_entry_id`); `models/fitnessTestRepository.ts` works the result and paces out with the shared `evaluateFitnessTest` (`../shared/src/utils/fitnessTest.ts`, built on `paceZones.ts` and `racePaceZones.ts`), stores them in `paces` JSONB (a treadmill test also stores `surface`, `incline_percent` and `incline_adjusted`; the incline correction is `applyIncline` in shared, applied inside `evaluateFitnessTest`, and the stored distance and time stay as measured), checks the entry is the person's and upserts on `exercise_entry_id` (partial unique index) so a retried save never files a test twice; deleting the activity sets `exercise_entry_id` to null and keeps the test. The assistant reads them through the read-only `get_fitness_tests` action of `sparky_manage_run_program` (listed in `ai/mcp/toolAccess.ts`); the contract is `../shared/src/schemas/api/FitnessTest.api.zod.ts`
- `routes/v2/mindfulnessRoutes.ts` - mindfulness & meditation sessions tracking (`checkin` permission): day summaries (`/day-summary`), session logs and telemetry (`/entries`, `/entries/:id`). Logic lives in `models/mindfulnessRepository.ts`; the request/response contract is `../shared/src/schemas/api/Mindfulness.api.zod.ts`
- `routes/v2/labResultRoutes.ts` - lab results (`checkin` permission): the user's own markers (`/markers`, `/markers/:id`), every result (`/entries`, `/entries/:id`) and the newest result per marker (`/latest`). Built-in markers (HbA1c, LDL, ...) are keyed in `../shared/src/constants/labMarkers.ts` and not stored; each result keeps its own unit and reference range. Logic lives in `models/labResultRepository.ts`; the contract is `../shared/src/schemas/api/LabResults.api.zod.ts`
- `routes/v2/shoeRoutes.ts` - running-shoe inventory (`diary` permission): CRUD on `/api/v2/shoes` and `PUT /shoes/assignments/:exerciseEntryId` to link or unlink a diary entry (`exercise_entries.shoe_id`). Logic lives in `models/shoeRepository.ts`; mileage is `starting_distance_km` plus the sum of linked entries' `distance` (km); the contract is `../shared/src/schemas/api/Shoes.api.zod.ts`
- `routes/v2/plateInventoryRoutes.ts` - plate calculator inventory (`diary` permission): `GET/PUT/DELETE /api/v2/plate-inventory`, one `plate_inventories` row per user (unit, bars and plates as JSON, collar weight), validated by the shared `savePlateInventoryBodySchema`; `models/plateInventoryRepository.ts` upserts on `user_id`. The search itself lives in `shared/src/utils/plateCalculator.ts` and is tested in `tests/plateCalculator.test.ts`.
- `routes/v2/actionTagRoutes.ts` - NFC tags (#941, owner-only via `requireSelfActor`, `action_tags` owner policy): `GET/POST /api/v2/action-tags`, `PATCH/DELETE /:id` and `POST /scan`. A sticker holds only `https://tag.sparkyfitness.com/t/<tag_code>`; the saved `action` (shared `tagActionSchema`, discriminated on `type`) lives in the table, so it can change without rewriting the sticker. `services/actionTagService.ts` `scanActionTag` runs it and answers 200 with a `status` (`done`, `needs_confirmation`, `unknown_tag`, `target_missing`, `too_soon`); an unknown code logs nothing. `RUNNERS` is a mapped type over the action types, so a new type without a runner does not compile. The water runner calls `upsertWaterIntake` (drinks stay normal `manual` entries) after checking the container exists, because that function silently logs 250 ml for an unknown id. A double read is dropped by `claimActionTagRun` (one `UPDATE ... FOR UPDATE`, 10 s, released if the action fails or its target is gone). Contract `../shared/src/schemas/api/ActionTags.api.zod.ts`; repository `models/actionTagRepository.ts` (100 tags per person).
- Calorie settings per day (#1795): a past day's calorie target uses the settings in force on that day, not today's. The `record_calorie_rule_change` trigger on `user_preferences` writes `user_calorie_rule_history` whenever one of the settings in `CALORIE_RULE_FIELDS` (`../shared/src/schemas/database/UserCalorieRuleHistory.zod.ts`) changes, dated today in the user's zone. `models/calorieRuleHistoryRepository.ts` reads a range and `services/calorieRuleHistoryService.ts` (`preferencesOnDay`, `loadPreferencesByDay`) resolves each day's preferences for `goalService`, `AdaptiveTdeeService`, `reportService`, `DashboardService` and the daily summary services, filling an unset setting from `CALORIE_RULE_DEFAULTS` (`../shared/src/utils/calorieRuleDefaults.ts`). `GET /api/daily-summary` returns `calorieInputs` (the day's settings plus the age, sex and measurements `resolveBmrInputs` in `services/calorieBalanceService.ts` used), and the web Diary's target breakdown explains a day with those, never with today's settings or latest weight. Age in the calorie maths is the age on that day (`ageOnDay` in `utils/dateHelpers.ts`), so a birthday leaves earlier days alone
- `routes/auth/` - auth-specific route fragments mounted through `routes/authRoutes.ts`
- `services/` - business logic and orchestration
- `models/` - PostgreSQL repositories and persistence helpers
- `middleware/` - auth, permissions, uploads, and shared Express middleware
- `utils/uploadsPath.ts` - the uploads root plus the resolver and containment guard for stored `file_path` values; use it instead of re-deriving `SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY`
- `utils/oauthState.ts` - server-issued single-use OAuth `state` nonces for provider linking (`issueOAuthState`, `persistOAuthState`, `claimOAuthState`); use it instead of hand-rolling a state value
- `utils/outboundHttp.ts` - process-wide outbound HTTP defaults, applied from `index.ts`: the axios request timeout and the per-address-family connect attempt timeout (`net.setDefaultAutoSelectFamilyAttemptTimeout`). Both are fixed constants on purpose - do not add env overrides, and read the sizing note there before changing either, because the two values interact
- `utils/errors.ts` - `ValidationError` plus `describeError(error)`; prefer it over `error.message` when logging any caught value, because an `AggregateError` or a non-Error throw renders as an empty string; and `publicErrorMessage(error)` for the error text of a hand-written 5xx response (it hides database and system errors the way the shared error handler does)
- `routes/intervalsRoutes.ts` - Intervals.icu pull sync (`/api/integrations/intervals`: `POST /sync` (range up to 365 days, default yesterday and today), `GET /status`, `POST /disconnect`; all owner-only via `requireSelfActor`, and `/sync` accepts the admin mock-data capture and replay options). `integrations/intervals/intervalsService.ts` reads the athlete ID (`app_id`) and API key (`app_key`) and calls the API with Basic auth; `intervalsDataProcessor.ts` maps activities to exercise entries with their telemetry (written with the entry like Garmin, so manual edits survive a re-sync; running cadence doubled to steps per minute; running dynamics for runs only; HR zones via `replaceExerciseEntryHrZones` for 5-zone setups only) (source `Intervals.icu`, skipping Strava stubs and Garmin activities (from Garmin Connect, or uploaded as `<id>_ACTIVITY.fit`) while Garmin is connected or already imported, and any activity starting in the same local minute as a stored Garmin entry; a sync also deletes its own earlier copies that now have such a stored Garmin match) and wellness to check-ins, `daily_health_metrics` (resting HR, VO2 max, floors, CTL/ATL as chronic/acute training load and their ratio) and `hrv`/`spo2`/`respiration` samples (source provider `intervals`)
- `middleware/requireSelfMiddleware.ts` - `requireSelfActor`, which rejects a switched/delegated context outright; attach per-route to account-linking routes
- `middleware/ipRateLimit.ts` - `makeIpRateLimit(name, max, windowMs)`, per-IP limits for routes Better Auth's limiter does not cover (`/api/auth/mfa-factors`, demo login, passkey tickets); counted in `system.rate_limit_windows` (`models/rateLimitWindowRepository.ts`) so all instances share one budget, keyed `<name>|<address>` (give each limiter its own name); fails closed on a database error. Each row stores its own `expires_at` and the sweep deletes by it, so an instance never cuts short a window it does not use itself
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
- `SparkyFitnessServer.ts` creates the Express app, configures static upload serving, mounts auth interception, registers routes, exposes API docs, starts background jobs through `services/backgroundJobScheduler.ts`, and installs the shutdown handlers from `utils/gracefulShutdown.ts`
- Startup order matters:
  - `index.ts`: await `initializeDatabase()`, which applies pending migrations and then, only when the file or the policies in the database changed, reapplies `db/rls_policies.sql` under a PostgreSQL advisory lock, **before** importing `SparkyFitnessServer.ts` (and therefore `auth.ts`)
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
- `getClient`, `getSystemClient` and Better Auth's pool retry connection errors for up to 10 s (`db/connectRetry.ts`, off under `NODE_ENV=test` unless a test calls `enableRequestConnectRetry()`); only the acquire is retried, never a statement. A connection error that still reaches `middleware/errorHandler.ts` answers 503 with `Retry-After`
- Pools name their sessions `sparkyfitness-<owner|app|auth>@<hostname>:<pid>` (`db/applicationName.ts`, at most 63 bytes, a long name ends in a hash); the restore guard relies on it to tell this process's sessions from other instances'. Use `applicationName()` for any new pool
- To learn a table's current shape, read `../shared/src/schemas/database/<Table>.zod.ts` (one small Zod file per table) instead of reading `../db_schema_backup.sql` or reconstructing it from the 185 migration files
- New migrations belong in `db/migrations/` and must use `YYYYMMDDHHMMSS_description.sql`
- **Never manually edit `../db_schema_backup.sql`** — after merge, CI regenerates it from the migrations and opens an automated sync PR (`.github/workflows/schema-backup.yml`). Do not commit copies generated from a local database.
- If you add a new table or change user-visible access behavior, follow `../agent-docs/new-migration-checklist.md`. In short, you MUST:
  1. Add/modify the RLS policies in `db/rls_policies.sql`.
  2. Update the user-facing documentation in `../docs/src/features/family-friends-sharing.md`.
  3. Update the developer-facing documentation in `../docs/src/developer/database-security-tiers.md` to define its security tier (Tier 1, Tier 2, or Tier 3).
  4. Add or update the matching Zod schema in `../shared/src/schemas/database/`.
- Keep future schema-startup steps in `utils/initializeDatabase.ts` and pass its shared client through all database work. The lock and schema work must use the same connection so initialization cannot continue on another connection after the lock-owning session is lost. Do not create alternate migration mechanisms.
- `utils/applyRlsPolicies.ts` skips the apply when `system.rls_policy_state` holds the file's sha256 and a fingerprint of the catalogs (public policies, row security flags, public functions) that still matches, so a boot with nothing to change takes no lock on a user table. Applying takes an ACCESS EXCLUSIVE lock on every policy table, so it runs with `lock_timeout` 200 ms (below PostgreSQL's 1 s `deadlock_timeout`, so when the apply and a live request wait on each other the apply normally gives way first) and retries for 30 s before waiting without a timeout; the file and its state row commit together. Policies changed by hand are applied again on the next boot; deleting the state row forces an apply.
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
- Common server-side helpers include `todayInZone`, `instantToDay`, `instantForDay`, `dayToUtcRange`, `dayRangeToUtcRange`, `localDateToDay`, `addDays`, `compareDays`, and `isDayString`
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
- Current adapters span food/nutrition (OpenFoodFacts, FatSecret, Nutritionix, USDA, Mealie, Tandoor, Norish, SwissFood, Yazio), fitness devices (Garmin Connect sync plus FIT file import via `integrations/garminfit/` + `services/fitImportService.ts`, Withings, Fitbit, Oura, Polar, Strava, COROS, Hevy, Liftosaur, Intervals.icu), exercise databases (Wger, FreeExerciseDB), and health-data import (Google Health, generic/mobile health data)
- Scheduled jobs currently include backups, session cleanup, and hourly sync loops for Withings, Garmin, Fitbit, Oura, Polar, Strava, COROS, Hevy, Liftosaur and Intervals.icu
- Integration work often spans route, service, repository, cron, and external-provider settings code; inspect the whole path before calling the work complete
- **OAuth linking (`/authorize`, `/callback`) is self-only, and `state` is a server-issued single-use nonce.** Never derive a user id from a callback request body, and never gate an authorize route with `checkPermissionMiddleware('diary')` — on GET that resolves to `diary_read`, which would hand a read-only delegate the owner's decrypted OAuth client id. Use `requireSelfActor` plus `utils/oauthState.ts`. Withings and Polar follow this pattern; Oura, Fitbit and Strava are self-only but still send `state = userId` and ignore it on callback (tracked follow-up)

### AI Services

- AI calls go through the Vercel `ai` SDK (v7) with provider adapters for OpenAI, Anthropic, and Google, plus OpenAI-compatible, Mistral, Groq, OpenRouter, and Ollama service types
- `ai/config.ts` holds default model and vision-model selection per provider; `ai/providerDispatch.ts` is the unified dispatch helper used by chat, food-photo analysis, nutrition-label scan, and unit conversion
- Prefer routing new AI features through `providerDispatch.ts` instead of calling provider SDKs directly
- Web and mobile voice transcription use `POST /api/chat/transcribe` in `routes/chatRoutes.ts` and `services/voiceTranscriptionService.ts`; its multipart fields, response, MIME types, and 10 MB limit come from `shared/src/schemas/api/VoiceTranscription.api.zod.ts`. Audio stays in memory, uses actor-scoped AI settings with `supports_audio_input`, and all outbound calls use `createGuardedFetch`. Voice and chat providers are selected independently; transcription never executes chatbot tools or writes diary entries. `voice_input_enabled` and `active_voice_ai_service_id` in user preferences synchronize voice UI across clients; null selects System recognition, and disabling voice preserves the selection. Preference writes validate these fields using the shared voice-preferences schema.
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

- Weekly weight-change calorie goals: `services/preferenceService.ts` validates the signed `goal_mode_weekly_change_kg` preference (negative loses, positive gains; active only for `goal_mode = 'weekly'`), `models/preferenceRepository.ts` persists it, and `services/goalService.ts` plus `services/calorieBalanceService.ts` pass it to the shared calorie adjustment functions. Device Projection applies the daily weekly-rate adjustment once to device TDEE; percentage goals keep their existing behavior.

- Startup, env, or deployment issue:
  inspect `index.ts`, `SparkyFitnessServer.ts`, `utils/secretLoader.ts`, `utils/preflightChecks.ts`, and `config/logging.ts`
- Provider sync stopped, skipped as already running, or holding an account:
  inspect `services/providerSyncClaim.ts` (claim, renewal, stall stop) and `utils/abortScope.ts` (how a stopped sync's next `getClient`/`getSystemClient` is refused and how connections and queries count as progress, hooked in `db/poolManager.ts`)
- Auth, session, MFA, or API key issue:
  inspect `auth.ts`, `middleware/authMiddleware.ts`, `routes/authRoutes.ts`, and `routes/auth/`
- Remote MCP OAuth, discovery, consent, token, or redirect allowlist issue:
  inspect `utils/mcpOAuth.ts`, `middleware/mcpOAuthAuthInterceptor.ts`, `middleware/authMiddleware.ts` (`authenticateMcp`), `models/oauthClientRepository.ts`, the OAuth gate in `SparkyFitnessServer.ts`, and `db/migrations/20261020000000_add_mcp_oauth_provider.sql`
- Migration, RLS, or permission issue:
  inspect `db/migrations/`, `db/rls_policies.sql`, `db/poolManager.ts`, `utils/applyRlsPolicies.ts`, and the permission middleware/helpers
- Public v2 contract issue:
  inspect the matching file in `routes/v2/` plus the related Zod schema in `schemas/`
- Food, barcode, or external provider issue:
  inspect the relevant `integrations/*` code, then the matching service and repository files
- Open Food Facts publication:
  inspect `services/openFoodFactsManualContributionService.ts`, `integrations/openfoodfacts/openFoodFactsContribution.ts`, and `constants/openFoodFacts.ts`; retained automatic queue code is dormant and needs a new migration before a future release can activate its triggers
- Heart rate zone, max heart rate or time-in-zone issue:
  inspect `../shared/src/utils/heartRateZones.ts`, `services/heartRateZoneService.ts`, `routes/v2/heartRateZoneRoutes.ts`, then `services/healthDataHandlers.ts` (`persistWorkoutTelemetry`) and `services/exerciseEntryService.ts` (watch telemetry) for the write paths
- Health data or date bucketing issue:
  inspect `integrations/healthData/healthDataRoutes.ts`, `services/measurementService.ts`, and `utils/timezoneLoader.ts`
- Writing passive all-day samples (heart rate, stress, SpO2 and the other `health_metric_samples` metrics) from a source without a server-side integration:
  inspect `POST /samples` in `routes/genericHealthRoutes.ts` (mounted at `/api/generic-health`, body schema `healthMetricSamplesWriteBodySchema` in `../shared/src/schemas/api/HealthMetricSamples.api.zod.ts`). It buckets each sample by the user's calendar day and calls `upsertSamplesByDay` with `days` set to every day the `window` touches, so a resend also clears a day that no longer has readings, and with `keepLinked`, so stored samples with an `ex`/`sl` link (a workout's or a night's) survive both modes. It only touches rows of the posted `source`, and the source names the server writes samples under (`HEALTH_METRIC_SAMPLES_RESERVED_SOURCES`: the built-in integrations, plus `manual`, the default source of workouts imported through `/health-data`) are refused. `merge` (the default) requires a `window` and rejects samples outside it; `ex`/`sl` links are not accepted. Guarded by `checkPermissionMiddleware('checkin')` (write), and closed to read-only API keys like every POST outside `utils/apiKeyScope.ts`
- Attaching heart rate to an already-existing exercise entry (e.g. from a paired Apple Watch's live workout tracking, `SparkyFitnessMobile/src/hooks/useWatchWorkoutBridge.ts`):
  inspect `POST /exercise-entries/:id/watch-telemetry` in `routes/exerciseEntryRoutes.ts`, `services/exerciseEntryService.ts`'s `attachWatchTelemetryToExerciseEntry`, and `models/exerciseEntry.ts`'s `applyWatchTelemetryAtomically`. Distinct from `services/healthDataHandlers.ts`'s `persistWorkoutTelemetry`, which creates a new entry as part of importing a whole synced workout (HealthKit/Health Connect/Garmin) — this route only fills in avg/max HR, `exercise_entry_hr_zones` and `calories_burned` on an entry that already exists, and it also stores the posted series as `heart_rate` samples tagged with the entry (`storeHeartRateSeries`, source `SparkyFitness Watch`, `merge` over the workout's own span but only this entry's samples, and only after that snapshot was accepted under the row lock, best effort) because the heart rate chart of an entry with no GPS track reads those samples and would otherwise wait on a Health sync. `activeEnergyKcal` is a real measurement from the watch and is written to BOTH `calories_burned` (the figure the diary totals) and `active_calories` (a telemetry column the ordinary entry update preserves). That second write is what makes the measurement survive a later edit: `resolveEditedCaloriesBurned` in `services/exerciseService.ts` prefers a stored `active_calories` over the recomputed duration-and-sets estimate, so editing a note or a weight no longer replaces what a watch measured with a formula. A client-sent `calories_burned` still overrides both. Both body fields are individually optional (HealthKit permissions are per type) and the model does a partial UPDATE, so a calories-only post must not blank heart rate an earlier post attached.
  Workout effort (a 1-10 rating of the whole workout, `exercise_entries.workout_effort`, CHECK 1-10): it is one of `EXERCISE_ENTRY_TELEMETRY_COLUMNS`, so a synced workout carries it as `telemetry.workout_effort` through the health-data allowlist (HealthKit sends the person's own Apple rating) and the model's insert, update and select pick it up with no per-column code. `POST /exercise-entries/:id/effort` (`setExerciseEntryEffort`, body `{rating}`) is the write for ratings given afterwards, on the watch: it sets the entry and every other entry with the same `exercise_preset_entry_id`, so a strength session reads the same from any exercise and the phone needs only one entry id. `GET /api/exercise-stats/query` returns it as `workoutEffort`.
- Attaching a phone-recorded GPS track to an existing exercise entry (mobile `RecordActivityScreen`):
  inspect `POST /exercise-entries/:id/gps-track` in `routes/exerciseEntryRoutes.ts` and `services/exerciseEntryService.ts`'s `attachGpsTrackToExerciseEntry`, with the request schema `attachExerciseEntryGpsTrackRequestSchema` in `shared/src/schemas/api/ExerciseEntries.api.zod.ts`. It stores the route and laps (laps arrive as bare windows and are derived by `deriveLaps`) and backfills speed/elevation/moving-time with `deriveWorkoutTelemetry`, all in one transaction. Both inserts upsert per entry, so a retried post replaces the track. Use this rather than `/api/health-data` for app-recorded activities: the health-data path range-deletes a source's entries for the affected days.
- Weather on a GPS-recorded activity:
  inspect `services/weatherService.ts` and `services/weatherConfig.ts`. The source is an external provider of type `open_meteo` (`WEATHER_PROVIDER_TYPE` in `shared/src/constants/weatherProviderTypes.ts`, seeded by `20261025120000_add_open_meteo_weather_provider_type.sql`; base URL plus an optional key sent as `apikey`), added in Settings > External Providers like Valhalla. `resolveWeatherProvider(userId)` reads it through `externalProviderRepository.getActiveProviderWithKeyByType` (own, then admin-public, then family-shared) and re-checks the URL with `resolveProviderEndpoint` (SSRF/DNS guard, owner's admin status decides LAN use); `open_meteo` is in `BASE_URL_FETCHING_PROVIDER_TYPES`, so the URL is also checked at save time. No provider, an unusable endpoint or any error means no lookup and no request. There is no global switch or env var. `fetchWeatherAt(endpoint, lat, lon, at)` takes the resolved endpoint: forecast at `<base>/v1/forecast` for the last 7 days, `<base>/v1/archive` for older ones, except that `api.open-meteo.com` and `customer-api.open-meteo.com` map to their separate archive hosts; coordinates are rounded to two decimals, redirects are off and names resolve through the guarded lookup. `attachGpsTrackToExerciseEntry` starts `attachWeatherToExerciseEntry` after its transaction commits and does not wait for it; it fills the four `weather_*` telemetry columns only when the entry has none (a Garmin value is never replaced), skips 0,0, impossible coordinates and future starts, and never throws. `GET /exercise-stats/query` returns `weatherTempCelsius` and `weatherCondition` per item (a 0 °C reading is kept). Strava imports and indoor sessions get none yet.
- Attaching laps to an entry with no GPS track (an indoor run recorded on the watch):
  inspect `POST /exercise-entries/:id/laps` in `routes/exerciseEntryRoutes.ts` and `services/exerciseEntryService.ts`'s `attachLapsToExerciseEntry`, with `attachExerciseEntryLapsRequestSchema` in `shared/src/schemas/api/ExerciseEntries.api.zod.ts`. The client sends the marked windows with the distance and average heart rate it worked out; the server derives duration and speed and upserts by lap index into `exercise_entry_laps`, so a retry replaces them. Entries with a track get their laps from `/gps-track` instead.
  For an indoor run's pace chart, `POST`/`GET /exercise-entries/:id/distance-series` (`attachDistanceSeriesToExerciseEntry`, `getExerciseEntryDistanceSeries`, table `exercise_entry_distance_series`, rows of `[active seconds, metres]`; `setExerciseEntryDistance` rescales them with the laps).
- Correcting the distance of an entry with no GPS track (a treadmill run, from the summary screen):
  inspect `POST /exercise-entries/:id/distance` in `routes/exerciseEntryRoutes.ts`, `services/exerciseEntryService.ts`'s `setExerciseEntryDistance` and `setExerciseEntryDistanceRequestSchema` in `shared/src/schemas/api/ExerciseEntries.api.zod.ts`. It changes only the entry's `distance`, its sets' distance and any laps (`distance_meters` and speed scaled by new over old distance), in one transaction, so measured heart rate and energy are kept; an entry with a GPS track is refused with 409.
- Personal records or distance best-effort issue:
  `services/exerciseStatsService.ts` `getPersonalRecordMatrix`. A distance record is the time for exactly that distance: the fastest stretch inside the activity's GPS track or distance series (`utils/bestSplit.ts`, `timeBasis: 'best_split'`), else, for an activity with no track within about 2% under to 5% over the standard, its pace scaled to the exact distance (`'activity_pace'`). Never report a longer or shorter activity's total time as a standard's time. Splits are cached in memory per activity, keyed by the track's `updated_at` and size, so a track is walked once (`splitCache`); the haversine fallback drops segments above a per-sport speed ceiling (`MAX_SPEED_MPS`). Matched courses (`getMatchedCourses`) compare only activities within 5% of the median distance.
- Workout counted twice in the calorie balance (a logged workout plus the same session synced from a watch, #2353):
  `exercise_entries.calories_applied` (nullable, >= 0) replaces `calories_burned` in the balance when set, 0 included; `calories_burned` stays as the stored estimate. It is a telemetry column, so create and update carry it and a sync that omits it keeps it. Both balance paths read it: shared `entryCaloriesCounted` in `extractExerciseStats` (the Diary tree) and the `COALESCE(calories_applied, calories_burned)` sums in `getDailyExerciseCalorieSplitRange` (Reports, Dashboard, adaptive). Web and mobile set it from the entry editors; multipart `''` clears it.
  Linking a logged workout to the same session synced from a watch: `exercise_entries.calorie_link_id` (shared by both sides) and `calorie_link_resolution` (`sparkyfitness` / `synced` / `higher` / `lower` / `average` / `custom`) are telemetry columns, so edits and syncs that omit them keep them. `services/exerciseCalorieLinkService.ts` behind `GET /exercise-entries/:id/calorie-link/suggestions`, `PUT` and `DELETE /exercise-entries/:id/calorie-link`: the anchor is a `manual` entry (or any entry of its strength session); candidates are that day's synced entries with a `source_id` (a provider sync updates those in place and keeps the link; entries without one are deleted and recreated, so they are not offered). `matchCalorieLink` in shared marks a candidate `sets_within` when every set `completed_at` falls inside its window plus 10 minutes, `overlap` when only the entry times overlap, otherwise null so the person chooses; nothing is linked automatically. `resolveLinkedCalories` / `distributeCountedCalories` (shared `exerciseCalorieLink.ts`) write `calories_applied` on both sides in one transaction (a session's total is split over its entries in proportion to their estimates) and `calories_burned` is never touched. `DELETE` resets `calories_applied` to null on both sides, including any value the person set by hand. No new table, so no RLS change.
- NFC tag, tag scan or tag action issue (#941):
  inspect `routes/v2/actionTagRoutes.ts` (`/api/v2/action-tags`: list, create, `PATCH`/`DELETE /:id`, and `POST /scan`, owner-only through `requireSelfActor`), `services/actionTagService.ts` (`scanActionTag` and the typed `RUNNERS`, one per action type), `models/actionTagRepository.ts` (`claimActionTagRun` / `releaseActionTagRun`, the database-held 10 s double-read guard; a release only undoes its own claim) and the contract in `../shared/src/schemas/api/ActionTags.api.zod.ts`. An unknown code logs nothing (`unknown_tag`), and a deleted target answers `target_missing` instead of logging a default amount. A new action type needs a member of `tagActionSchema` and a runner here, plus the mobile `services/tagActions.ts`
- Water, hydration, caffeine, or alcohol issue:
  inspect `services/hydrationTotalsService.ts` (the single owner of the daily water formula), `services/measurementService.ts` (the container "+/-" path and the container->food link), `services/caffeineKineticsService.ts` / `services/alcoholWeekService.ts`, `models/waterContainerRepository.ts`, and the shared maths in `../shared/src/nutrients/`
- Intervals.icu sync, field mapping, Garmin dedupe or self-heal issue:
  inspect `integrations/intervals/intervalsDataProcessor.ts` (mapping, `findGarminDuplicates`), `integrations/intervals/intervalsService.ts` (API calls, capture/replay) and `routes/intervalsRoutes.ts`
- Self-service "delete synced data by source" issue:
  inspect `routes/syncedDataRoutes.ts`, `services/syncedDataService.ts`, and `models/syncedDataRepository.ts` (the `SYNCED_SOURCE_TABLES` whitelist)
- AI chat or chatbot tool issue:
  inspect `services/chatService.ts`, `ai/tools/`, and the matching domain service and repository
- Fasting or mood issue:
  inspect `routes/fastingRoutes.ts` / `routes/moodRoutes.ts` and `models/fastingRepository.ts` / `models/moodRepository.ts`
  `mood_entries` holds several rows per day, each with `entry_timestamp` and a `source`: `manual` (web/app check-ins, AI `log_mood`, end-of-fast mood), or `garmin` / `import` (derived, one row per source per day via a partial unique index). `mood_value` is nullable; a CHECK needs at least one of mood, energy, focus, notes or tags (whitespace-only notes and blank tags do not count, as in `hasMoodContent`), and another limits `source` to those three values. Requests without the `X-Mood-Model-Version` header keep the one-mood-per-day contract on the "legacy row" (latest manual row with a mood, falling back to the derived row on GET, Garmin before import); `X-Mood-Model-Version: 2` always adds a check-in and reads arrays (header is in `CORS_ALLOWED_HEADERS`, `utils/corsHelper.ts`); its PUT edits only manual rows (409 for Garmin and import) and re-dates a check-in only when its timestamp actually changes. A check-in or derived mood written without a time of its own gets `instantForDay` from `@workspace/shared`: now for today, local noon for another day, so `entry_timestamp` stays on `entry_date`. Per-day aggregates (coach, cycle correlations) use `DAILY_MOOD_VALUE_SQL`: rounded average of manual moods, else Garmin, else import.
- Symptom or episode tracking issue (#1882):
  inspect `routes/v2/symptomRoutes.ts`, `services/symptomService.ts`, `models/symptomRepository.ts`, `models/symptomOptionRepository.ts`, and the shared contract and built-ins in `../shared/src/schemas/api/Symptoms.api.zod.ts` and `../shared/src/symptoms/`. `symptom_entries` also holds cycle-hub symptoms (`source = 'cycle'`), which RLS keeps owner-only
- Medications, cycle, or pregnancy issue:
  inspect the matching v2 route (`routes/v2/medicationRoutes.ts`, `routes/v2/cycleRoutes.ts`, `routes/v2/pregnancyRoutes.ts`), its Zod schema in `schemas/`, then `services/cycleService.ts` / `services/pregnancyService.ts` and the `models/medication*Repository.ts` / `models/cycleRepository.ts` / `models/pregnancyRepository.ts` files
- Supplement barcode lookup:
  `GET /api/v2/medications/supplement-lookup?upc=` (registered before `/:id`) runs only while the user can see an active `dsld` or `openfoodfacts` external provider (`getActiveProvidersByTypes`; neither is a 404; the NIH database answers first and `services/supplementOpenFoodFactsService.ts` asks Open Food Facts, per-serving nutrients only, when it has no match or `dsld` is off; migration `20261006200000_add_dsld_provider_type.sql`, constant `SUPPLEMENT_LOOKUP_PROVIDER_TYPE`) and calls `services/supplementLookupService.ts`. Two more routes read a Supplement Facts photo: `POST /supplement-label/scan` runs the user's vision AI (`services/supplementLabelScanService.ts`, same provider and error map as `/foods/scan-label`) and `POST /supplement-label/map` takes ingredients the phone read on device; both end in `mapScannedLabel`, so name matching and unit conversion are shared with the barcode lookup, which searches the NIH Dietary Supplement Label Database for the code, opens the hits to check the label's own UPC, and maps the label to one serving's nutrients in the app's units (IU for vitamins A, D and E converted, compounds and unplaceable ingredients returned as `unmatched`). The response contract is `shared/src/schemas/api/SupplementLookup.api.zod.ts`; an unreachable database is a 502, no match is `{ product: null }`.
- Exercise alternatives, workout feedback, or adaptive suggestions issue (#1560):
  inspect `services/exerciseAlternativesService.ts` (library + Free Exercise DB candidates, dedupe) with the pure ranking in `utils/exerciseAlternativesRanking.ts` and the muscle/equipment vocabulary in `../shared/src/constants/exerciseTaxonomy.ts`; feedback in `services/workoutCoachingService.ts` + `models/workoutFeedbackRepository.ts`; signals in `services/adaptiveWorkoutService.ts`. The rules that turn signals into weight changes are client-side and shared (`../shared/src/utils/adaptiveCoaching.ts`) so web, mobile and the AI tools agree; the server only reports what happened. AI actions: `suggest_alternatives`, `rate_workout`, `get_workout_coaching` in `ai/tools/exerciseTools.ts`
- AI training review: `sparky_get_exercise_stats` action `training_review` (`ai/tools/exerciseStatsTools.ts`, input in `ai/tools/schemas/exerciseStats.ts`) calls `services/trainingReviewService.ts`, which reads `reportRepository.getExerciseEntries` (84-day lookback, including per-set RPE/RIR) and hands the rows to the pure `buildTrainingReview` in `../shared/src/utils/trainingReview.ts`. Stall rules (3+ sessions, 1% improvement threshold on Epley 1RM, reps above 12 ignored, bodyweight and cardio excluded) live there so the model only interprets numbers it was given. Weights are shown in the user's unit (`kgInUnit` in `../shared/src/utils/exerciseLoad.ts`) and the near-failure thresholds are the adaptive-coaching constants. Read-only: the tool name is unchanged, so `ai/mcp/toolAccess.ts` needed no change
- AI run review: `sparky_get_exercise_stats` action `run_review` calls `services/runReviewService.ts`, which reads `reportRepository.getRunCandidates` (two windows back, so pace has a comparison) and keeps the entries shared `classifyActivitySport` calls running and `reportService.getTrainingLoad`, and hands the runs to the pure `buildRunReview` in `../shared/src/utils/runReview.ts` (runs per week, weekly distance, weeks up more than 10%, pace against the window before). Distances and paces are shown in the user's distance unit. Guidance for both reviews is in `prompts/chatbot-full-exercise.md` (full profile, loaded with the `exercise` category)
- AI plan weight changes: `sparky_manage_workout_plans` actions `propose_plan_changes` (read-only) and `apply_plan_changes` (`confirmed=true`) in `ai/tools/workoutPlanTools.ts` call `services/planProposalService.ts`, which reads the plan (`models/workoutPlanTemplateRepository.ts`), 84 days of performed sets (`reportRepository.getExerciseEntries`), the adaptive coaching signals (`services/adaptiveWorkoutService.ts`) and the training-review stalls, and hands them to the pure `proposePlanChanges` in `../shared/src/utils/planProposals.ts` (adaptive-coaching rules plus one step up after two sessions that met the plan). Apply recomputes the proposals and writes only those set weights through `updatePlannedSetWeights` (one transaction that rolls back unless every set matched, and stamps `workout_plan_template_assignments.proposals_applied_at` so the next proposal for that assignment only counts evidence logged after it); a plan with `entry_mode = 'prefill'` is refused because its diary entries are generated from the weights.
- AI calorie target review: `sparky_review_calorie_target` in `ai/tools/coachTools.ts` calls `services/calorieTargetReviewService.ts` (the adaptive TDEE from `services/AdaptiveTdeeService.ts`, the saved goal from `goalService.getUserGoals`, the profile's gender for the clinical minimum) and the pure `reviewCalorieTarget` in `../shared/src/utils/calorieTargetReview.ts`. Read-only; guidance is in `prompts/chatbot-full-coaching.md` (full profile, loaded with the `coaching` category).
- Bodyweight exercise load, volume or 1RM issue (#56):
  a `bodyweight_reps` set's weight is signed added/assisting load, and its load is body weight plus that weight (`effectiveLoadKg` in `../shared/src/utils/exerciseLoad.ts`). SQL mirrors the rule in `utils/exerciseLoadSql.ts` (`bodyWeightJoinSql`, `setLoadSql`), used by `services/exerciseStatsService.ts` and `models/exerciseEntry.ts`'s progress query; `services/reportService.ts` applies the shared helper with readings from `reportRepository.getBodyWeightReadings`. Keep the two copies identical. A negative set weight is rejected unless that exercise's modality is `bodyweight_reps`. `models/exercise.ts`'s `createExercise` defaults the modality from equipment through `resolveExerciseModality`
  `weight_distance` (weighted carries) and `weight_duration` (loaded holds) store weight plus distance (km) or duration (s); stats treat them as weight-based, not cardio, and best-set ordering falls back to distance then duration.
- Device Projection using the wrong device total, or none (#2354):
  `genericHealthRepository.getDeviceTotalCaloriesByDateRange` reads `daily_health_metrics.total_calories` from every source and `utils/deviceTotalCalories.ts` (`pickDeviceTotalPerDay`) keeps one per day in a fixed order (Health Connect, Garmin, Polar; any other source, Apple Health included, is ignored), never a sum and never by latest capture, since capture time is fetch time. Apple Health totals are stamped with the start of their day, so the stored value freezes at the day's first sync; they stay out until the iPhone reader stamps its read time like Android's `readCumulativeByDay`. Used by `dailySummaryService`, `dailySummaryRangeService` and `DashboardService`. The response `source` stays `'health_connect_total'` for any device total because older apps check for that value.
- A past day's calorie target or exercise credit changed after a settings change:
  inspect `services/calorieRuleHistoryService.ts` and the trigger in `db/migrations/20261023000000_add_user_calorie_rule_history.sql`. A new preference read by the calorie maths must join `CALORIE_RULE_FIELDS`, the table and the trigger; `tests/calorieRuleHistory.test.ts` fails until it does, and `tests/calorieRuleHistory.integration.test.ts` checks the table and trigger cover every field
- Weekly goal plan issue (which plan a day uses, or a plan save refused):
  each day uses the switched-on plan whose dates cover it (`getActiveWeeklyGoalPlansInRange` in `models/weeklyGoalPlanRepository.ts`, `weeklyGoalPlanInForce` in `../shared/src/utils/weeklyGoalPlans.ts`, picked per day in `services/goalService.ts` and for the Active badge on web and mobile), so a past day keeps the plan it had. `saveWeeklyGoalPlan` places a switched-on plan under a per-user advisory lock with the pure rule in `utils/weeklyGoalPlanTimeline.ts`: a plan starting on or after every other one ends the plan in force the day before (or switches off one starting the same day); any other overlap is a 409 `WeeklyGoalPlanOverlapError`. Never switch plans off wholesale; that drops past days back to the fallback goals. `tests/weeklyGoalPlans.integration.test.ts` covers the database side
- Sleep or sleep-science issue:
  inspect `routes/sleepRoutes.ts`, `routes/sleepScienceRoutes.ts`, `services/sleepAnalyticsService.ts`, `services/sleepScienceService.ts`, and the sleep repositories. A night two sources recorded counts once: `sleepAnalyticsService` and `sleepScienceRepository.getSleepHistory` pass the rows through the shared `keepMostDetailedSleepEntries` (`../shared/src/utils/sleepSameNight.ts`), so the history query also returns `stage_events` (stage types only) and the measures that rule reads. Queries that need one sleep value per day (the coach's 30-day aggregates and daily correlation rows, the cycle correlations, Compare) take each day's main sleep with `DISTINCT ON (entry_date)` ordered by `MAIN_SLEEP_ORDER_SQL` (`models/sleepRepository.ts`: the longest record, the earlier bedtime on a tie). A night can hold several entries per source (#3240): `upsertSleepEntry` updates the stored entry of the same session (same night and source, within the 4 hour `SLEEP_STAGE_CLUSTER_GAP_MS`) under a per-night advisory lock and inserts anything further apart, such as a nap, as its own entry; `processSleepEntry` then removes that session's stages from the night's entry if an older sync merged them there. Sleep science (`services/sleepScienceService.ts`) reads the history through `getSleepDays`, one row per day: the day's main sleep by the shared `mainSleepEntry` (same rule as `MAIN_SLEEP_ORDER_SQL`) for bed and wake times, chronotype, energy curve and MCTQ, plus `dayAsleepHours`, the time asleep of all the day's sleeps, which sleep debt counts, so a nap lowers the debt (#3259)

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
