# Task List: Vercel Web App Launch

Last updated: 2026-07-10

This task list implements `agent-docs/vercel-web-launch-prd.md`.

## Phase 0: Confirm Launch Defaults

### Task 1: Confirm Online MVP Defaults

Description: Lock the online launch assumptions before code changes so the Vercel deployment path is not pulled toward local-machine, LAN-only, or Docker-style hosting.

Implementation defaults accepted for the first code pass:

- Public domain: `https://fitness.hala-apps.com`.
- Managed Postgres: Supabase, with provider-required SSL via
  `SPARKY_FITNESS_DB_SSL=require`.
- Day-one storage mode: `SPARKY_FITNESS_STORAGE_MODE=disabled` for the Vercel MVP.
- Day-one signup policy: open during first-admin creation, then optionally disable with existing signup env controls.
- iPad browser access: included in launch smoke testing.

Acceptance criteria:

- [x] Final public domain is chosen or a placeholder is accepted for config work.
- [x] Managed Postgres provider is chosen: Supabase.
- [x] Day-one storage mode is chosen: `disabled`, `vercel-blob`, or `s3`.
- [x] Day-one signup policy is chosen: open signup or disabled after first admin.
- [x] iPad browser access is included in launch smoke testing.

Verification:

- [x] Update this task with the chosen values before implementation starts.
- [x] Supabase project created under `azizme.com`.

Chosen managed Postgres project:

- Provider: Supabase
- Organization: `azizme.com`
- Project: `SparkyFitness`
- Project ref: `diqsuhrgkwkgdonkmths`
- Region: `ap-southeast-1`
- Direct DB host (local administration only):
  `db.diqsuhrgkwkgdonkmths.supabase.co`
- Vercel runtime host (Supavisor session mode, IPv4):
  `aws-0-ap-southeast-1.pooler.supabase.com:5432`
- DB name: `postgres`
- SSL: `SPARKY_FITNESS_DB_SSL=require`
- Secrets are stored locally in ignored `private/supabase-sparkyfitness.env`
  and must be copied into Vercel through the Vercel dashboard/CLI, not committed.

Chosen Vercel project:

- Project: `sparkyfitness`
- Project id: `prj_wTUEBmzROOWOGe20LeRzECiI66SI`
- Production deployment: `dpl_2Q5CVfdABc3MnAzhKsnedHxXZfhQ`
- Stable production URL: `https://fitness.hala-apps.com`
- Vercel fallback URL: `https://sparkyfitness-smoky.vercel.app`

Dependencies: None.

Files likely touched:

- `agent-docs/vercel-web-launch-prd.md`
- `agent-docs/vercel-web-launch-tasks.md`

Estimated scope: XS.

## Phase 1: Backend Runtime Compatibility

### Task 2: Support Vercel Dynamic Port

Description: Update server startup so the backend listens on Vercel's assigned `PORT`, while preserving `SPARKY_FITNESS_SERVER_PORT` for Docker and local development.

Acceptance criteria:

- [x] Backend listener uses `process.env.PORT ?? process.env.SPARKY_FITNESS_SERVER_PORT ?? 3010`.
- [x] Existing Docker/local behavior still works when `PORT` is unset.
- [x] Server logs the actual bound port.

Verification:

- [x] `cd SparkyFitnessServer && pnpm run typecheck`
- [x] Manual: run with `PORT=4567` and confirm `/api/health` responds on `4567`.
      Verified on 2026-07-09 with the local Vercel backend container.

Dependencies: Task 1.

Files likely touched:

- `SparkyFitnessServer/SparkyFitnessServer.ts`

Estimated scope: XS.

### Task 3: Add Managed Postgres SSL Configuration

Description: Add explicit SSL support for managed PostgreSQL so Vercel-hosted backend services can connect to providers that require encrypted connections.

Acceptance criteria:

- [x] Add an env-driven DB SSL setting, defaulting to current local/Docker behavior.
- [x] `SPARKY_FITNESS_DB_SSL=require` configures `pg.Pool` with SSL enabled.
- [x] Both owner and app pools use the same SSL behavior.
- [x] Invalid SSL env values fail clearly.

Verification:

- [x] `cd SparkyFitnessServer && pnpm run typecheck`
- [x] Add or update a focused test for DB pool config if the pool setup is made testable.

Dependencies: Task 1.

Files likely touched:

- `SparkyFitnessServer/db/poolManager.ts`
- `SparkyFitnessServer/utils/preflightChecks.ts`
- `SparkyFitnessServer/tests/*`

Estimated scope: S.

### Task 4: Make Startup Migrations Concurrency-Safe

Description: Prevent two autoscaled backend instances from applying migrations at the same time.

Acceptance criteria:

- [x] `applyMigrations()` obtains a Postgres advisory lock before reading/applying migration files.
- [x] The lock is released in `finally`.
- [x] If migration application fails, startup fails loudly and does not mark the migration applied.
- [x] Existing fresh-install migration test still passes.

Verification:

- [x] `cd SparkyFitnessServer && pnpm run test:migrations`
- [ ] `cd SparkyFitnessServer && pnpm exec vitest run tests/rlsPermissionMatrix.integration.test.ts` when a test DB is available.

Note: `pnpm run test:migrations` passed on 2026-07-09 against a local
PostgreSQL 15 container on `localhost:55433`.
It also passed on 2026-07-09 against the Supabase `SparkyFitness` project
after enabling Supabase legacy-auth migration compatibility.

Dependencies: Task 3.

Files likely touched:

- `SparkyFitnessServer/utils/dbMigrations.ts`
- `SparkyFitnessServer/tests/migrate.script.ts`

Estimated scope: S.

### Task 5: Gate Background Jobs for Vercel

Description: Add a production-safe way to disable in-process cron jobs when running on Vercel.

Acceptance criteria:

- [x] Add `SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS=true` support.
- [x] When enabled, session cleanup, backups, and external provider sync cron jobs are not scheduled.
- [x] Startup logs that background jobs are disabled.
- [x] Local/Docker behavior is unchanged when the env var is unset.

Verification:

- [x] `cd SparkyFitnessServer && pnpm run typecheck`
- [x] Add/update a focused startup scheduling test if feasible.

Dependencies: Task 1.

Files likely touched:

- `SparkyFitnessServer/SparkyFitnessServer.ts`
- `SparkyFitnessServer/services/backupScheduler.ts`
- `SparkyFitnessServer/tests/*`

Estimated scope: M.

## Checkpoint: Backend Runtime

- [x] Server typecheck passes.
- [x] Migration smoke test passes against a local or managed Postgres test DB.
- [x] `/api/health` works with `PORT` set.
- [x] Background jobs can be disabled by env.

## Phase 2: Storage and Backup Policy

### Task 6: Add Deployment Capabilities Contract

Description: Expose a small authenticated or public-safe endpoint that tells the frontend which deployment capabilities are available, starting with file uploads and server-managed backups.

Acceptance criteria:

- [x] Backend exposes capabilities such as `storageMode`, `uploadsEnabled`, `serverBackupsEnabled`, and `backgroundJobsEnabled`.
- [x] Values are derived from env and do not expose secrets.
- [x] Frontend can query the endpoint through `/api`.

Verification:

- [x] `cd SparkyFitnessServer && pnpm run typecheck`
- [x] Add a focused route test for capabilities output.

Dependencies: Task 5.

Files likely touched:

- `SparkyFitnessServer/routes/*`
- `SparkyFitnessServer/SparkyFitnessServer.ts`
- `SparkyFitnessServer/tests/*`
- `SparkyFitnessFrontend/src/api/*`

Estimated scope: M.

### Task 7: Safely Disable Disk-Only Uploads for MVP

Description: If `SPARKY_FITNESS_STORAGE_MODE=disabled`, prevent disk-backed upload endpoints from pretending uploads succeeded on ephemeral storage.

Acceptance criteria:

- [x] Upload routes return a clear 501-style API response when storage is disabled.
- [x] Read-only routes for existing non-upload data continue working.
- [x] Frontend shows clear unavailable states for the most visible upload surfaces.
- [x] No route stores new user media on ephemeral filesystem in disabled mode.

Verification:

- [x] `cd SparkyFitnessServer && pnpm run typecheck`
- [x] `cd SparkyFitnessFrontend && pnpm run typecheck`
- [x] Manual: avatar/check-in/exercise upload attempts show a clear disabled message.

Dependencies: Task 6.

Files likely touched:

- `SparkyFitnessServer/middleware/*`
- `SparkyFitnessServer/routes/auth/userProfileRoutes.ts`
- `SparkyFitnessServer/routes/exerciseEntryRoutes.ts`
- `SparkyFitnessServer/routes/checkInPhotoRoutes.ts`
- `SparkyFitnessFrontend/src/pages/*`

Estimated scope: M.

### Task 8: Disable Server-Managed Backup/Restore on Vercel MVP

Description: Prevent the admin backup/restore feature from using ephemeral runtime disk while relying on managed Postgres provider backups for the MVP.

Acceptance criteria:

- [x] Backup routes return a clear unavailable response when `SPARKY_FITNESS_SERVER_BACKUPS_ENABLED=false`.
- [x] Admin backup UI reflects that provider-managed backups are expected in Vercel MVP.
- [x] Docker/local backup behavior remains unchanged by default.

Verification:

- [x] `cd SparkyFitnessServer && pnpm run typecheck`
- [x] `cd SparkyFitnessFrontend && pnpm run typecheck`
- [x] Manual: admin backup page does not offer broken backup/restore actions in Vercel mode.

Dependencies: Task 6.

Files likely touched:

- `SparkyFitnessServer/routes/backupRoutes.ts`
- `SparkyFitnessServer/services/backupService.ts`
- `SparkyFitnessFrontend/src/pages/Admin/*`
- `SparkyFitnessFrontend/src/hooks/Admin/useBackups.ts`

Estimated scope: M.

## Checkpoint: MVP Storage Safety

- [x] Upload features are either disabled clearly or backed by durable storage.
- [x] Backup/restore is not writing to ephemeral disk in Vercel mode.
- [x] Core non-upload tracking flows still work.

## Phase 3: Vercel Deployment Configuration

### Task 9: Add Backend Vercel Entry

Description: Add the backend runtime configuration needed for Vercel to build and run the Express server from the monorepo.

Acceptance criteria:

- [x] Add a Vercel Express service entrypoint at `SparkyFitnessServer/server.ts`.
- [x] Local/container runtime starts through `SparkyFitnessServer/index.ts`.
- [x] Keep a Node 24/pnpm backend container build as a verified fallback.
- [x] Runtime listens on `PORT`.

Verification:

- [x] Build the container locally if the Vercel Dockerfile supports local build.
- [x] `cd SparkyFitnessServer && pnpm run validate`
- [ ] Vercel preview deploy reaches `/api/health`.

Note: Production uses Vercel's Express service runtime with
`SparkyFitnessServer/server.ts` as its entrypoint. The final production health
check passed on deployment `dpl_2Q5CVfdABc3MnAzhKsnedHxXZfhQ`. A portable
container fallback also passed locally on 2026-07-09 with
`docker build -f Dockerfile.vercel -t sparkyfitness-server-vercel-test .`.
The built image was started locally with `PORT=4567` and `/api/health`
returned `{"status":"UP"}`. That fallback runs the compiled bundle with
`node SparkyFitnessServer/dist/index.js`; it is not the active Vercel backend
runtime.

Dependencies: Tasks 2, 3, 4, 5.

Files likely touched:

- `Dockerfile.vercel`
- `vercel.json`
- `SparkyFitnessServer/package.json`

Estimated scope: M.

### Task 10: Add Frontend Vercel Routing

Description: Configure the Vite frontend deployment so browser requests route API, uploads, health-data, and MCP paths correctly.

Acceptance criteria:

- [x] Frontend build command and output directory are documented/configured for Vercel.
- [x] `/api/:path*` routes to the backend service.
- [x] `/health-data/:path*` reaches backend `/api/health-data/:path*` behavior.
- [x] `/uploads/:path*` is either routed to backend or unavailable according to storage mode.
- [x] SPA fallback serves `index.html` for app routes.

Verification:

- [x] `cd SparkyFitnessFrontend && pnpm run build`
- [x] Production: deep links load. Verified `/settings` on 2026-07-09.
- [x] Production: `/api/health` works through the public frontend domain.

Note: The frontend now uses the root `Containerfile` Vercel container service,
builds Vite output, and serves it through
`SparkyFitnessFrontend/scripts/serve-vercel.mjs` with SPA fallback.

Dependencies: Task 9.

Files likely touched:

- `SparkyFitnessFrontend/vercel.json`
- `SparkyFitnessFrontend/package.json`
- `SparkyFitnessFrontend/vite.config.ts`

Estimated scope: S.

### Task 11: Document Production Environment Setup

Description: Create a concise Vercel launch runbook so deploy settings are reproducible.

Acceptance criteria:

- [x] Document required Vercel projects/services.
- [x] Document required env vars and safe secret generation.
- [x] Document managed Postgres setup and SSL setting.
- [x] Document first-admin and signup-disable sequence.
- [x] Document rollback and smoke-test commands.

Verification:

- [x] Runbook contains no real secrets.
- [x] Another engineer can follow it without reading this whole PRD.

Dependencies: Tasks 9, 10.

Files likely touched:

- `docs/content/1.install/*` or `agent-docs/vercel-launch-runbook.md`

Estimated scope: S.

## Checkpoint: Production Deploy

- [x] Frontend production loads.
- [x] Backend production health check passes.
- [x] Same-origin `/api` route works from the frontend production domain.
- [x] Auth cookies persist after sign-in.
- [x] Managed Postgres migrations have run once and RLS policies are applied.

## Phase 4: Launch Verification

### Task 12: Production Smoke Test Core Web Flows

Description: Verify the first web launch manually and with targeted API checks.

Acceptance criteria:

- [x] Home/app shell loads on production HTTPS domain.
- [ ] Production HTTPS domain opens from an iPad browser.
- [x] Sign up or sign in works.
- [ ] Admin role is assigned to configured admin email.
- [x] Create, edit, and delete a food diary entry.
- [x] Create, edit, and delete an exercise entry without image upload.
- [x] Check-in and reports pages load.
- [x] Settings page loads.
- [x] Disabled upload/backup features fail clearly.

Verification:

- [x] Browser smoke test on desktop.
- [x] Browser smoke test on mobile viewport.
- [ ] Real iPad Safari smoke test, or BrowserStack-equivalent iPad Safari smoke test if no device is available.
- [x] `curl -I https://fitness.hala-apps.com/`
- [x] `curl https://fitness.hala-apps.com/api/health`

Launch smoke evidence (2026-07-10): signup, sign-in, persisted session, food
CRUD, metadata-only exercise CRUD, check-ins, reports, settings, and disabled
feature states passed on production. Desktop, mobile, and iPad-sized Chromium
viewports passed after the tablet header fix. Physical iPad Safari or an
equivalent Safari session remains outstanding. The temporary smoke-test admin
and its data were deleted, so the real first-admin sequence also remains
outstanding.

Dependencies: Checkpoint Preview Deploy.

Files likely touched:

- None unless bugs are found.

Estimated scope: S.

### Task 13: Security and Operations Final Pass

Description: Make the first production release safe enough to leave online.

Acceptance criteria:

- [x] `SPARKY_FITNESS_PUBLIC_API_DOCS=false`.
- [x] `DEV_TOOLS_ENABLED=false`.
- [x] Signup policy is set as intended for first-admin creation: open signup.
- [x] Managed Postgres backups are enabled.
- [x] Vercel environment variables contain no placeholder values for the MVP launch.
- [x] Error logs are checked after first sign-in and core flow smoke tests.
- [x] Rollback path is documented.

Verification:

- [x] Vercel deployment logs reviewed.
- [x] Managed database backup settings verified through the provider Management API.
- [x] Production API/static smoke tests pass after final env changes.

Launch note: the initial direct-host deployment could not reliably write to
Supabase because Vercel could not reach its IPv6 endpoint. Production now uses
the IPv4 Supavisor pooler. RLS application traffic remains on session mode
`5432`, while owner/auth traffic uses transaction mode `6543` through
`SPARKY_FITNESS_SYSTEM_DB_PORT`. Production sets
`SPARKY_FITNESS_DB_POOL_MAX=1` per process and
`SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS=1000` so inactive instances release session
connections promptly. Supabase's session pool `default_pool_size` is `30`
against a database `max_connections` value of `60`; this resolved the
authenticated request burst that exhausted the initial 15-client setting while
leaving capacity for platform and system connections. The provider Management
API reported a completed physical backup (`1075427768`, 2026-07-09 16:22:23
UTC) with WAL-G backups enabled. Final production logs were clean after the
authenticated CRUD and page-load smoke tests.

Dependencies: Task 12.

Files likely touched:

- `agent-docs/vercel-launch-runbook.md`

Estimated scope: S.

## Optional Phase 5: Durable Media After MVP

### Task 14: Add Storage Abstraction

Description: Create a storage layer so upload routes can use local disk in Docker/dev and object storage in Vercel.

Acceptance criteria:

- [ ] Storage interface supports put, get/stream, delete, and public/signed URL behavior.
- [ ] Local adapter preserves existing Docker behavior.
- [ ] Object storage adapter is selected by env.
- [ ] Tests cover adapter selection and key/path safety.

Verification:

- [ ] `cd SparkyFitnessServer && pnpm run typecheck`
- [ ] Focused storage unit tests pass.

Dependencies: Task 1 storage decision.

Files likely touched:

- `SparkyFitnessServer/services/storage/*`
- `SparkyFitnessServer/utils/*`
- `SparkyFitnessServer/tests/*`

Estimated scope: M.

### Task 15: Migrate Upload Surfaces One Slice at a Time

Description: Move each upload flow from disk storage to the storage abstraction.

Acceptance criteria:

- [ ] Avatar upload works with object storage.
- [ ] Check-in photo upload/read/delete works with object storage.
- [ ] Exercise entry image upload/read/delete works with object storage.
- [ ] Pregnancy photo upload/read/delete works with object storage.
- [ ] OIDC logo upload works with object storage.

Verification:

- [ ] Route tests for each migrated upload surface.
- [ ] Manual browser upload/read/delete checks in Vercel preview.

Dependencies: Task 14.

Files likely touched:

- `SparkyFitnessServer/routes/auth/userProfileRoutes.ts`
- `SparkyFitnessServer/routes/checkInPhotoRoutes.ts`
- `SparkyFitnessServer/routes/exerciseEntryRoutes.ts`
- `SparkyFitnessServer/routes/v2/pregnancyRoutes.ts`
- `SparkyFitnessServer/routes/oidcSettingsRoutes.ts`

Estimated scope: Break into multiple M tasks before implementation.

## Risks and Mitigations

| Risk                                                           | Impact | Mitigation                                                                               |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Vercel runtime has ephemeral filesystem                        | High   | Disable disk-backed features for MVP or implement object storage before enabling uploads |
| Autoscaled instances race migrations                           | High   | Add Postgres advisory lock around startup migration application                          |
| Managed Postgres requires SSL                                  | High   | Add env-driven SSL pool config                                                           |
| In-process cron duplicates on serverless/container autoscaling | High   | Disable background jobs for MVP and later move to scheduled worker/cron                  |
| Auth cookies fail across split domains                         | High   | Prefer same-origin frontend domain with `/api` routing                                   |
| Signup left open unintentionally                               | Medium | Set explicit launch policy and disable after first admin if private                      |
| AI/provider features need external secrets                     | Medium | Launch core web first; configure AI/provider keys later                                  |

## Ready-to-Code Order

1. Task 2: Dynamic port.
2. Task 3: Postgres SSL.
3. Task 4: Migration lock.
4. Task 5: Background job gate.
5. Task 6: Capabilities contract.
6. Task 7 and Task 8: Disable disk-only features for MVP.
7. Task 9 and Task 10: Vercel deployment config.
8. Task 11: Runbook.
9. Task 12 and Task 13: Production smoke and hardening.
