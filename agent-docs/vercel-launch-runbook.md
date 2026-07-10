# Vercel Launch Runbook

Last updated: 2026-07-10

This runbook launches the SparkyFitness web app on Vercel with the React
frontend, Express backend, and managed PostgreSQL. It is the operational
companion to `agent-docs/vercel-web-launch-prd.md` and
`agent-docs/vercel-web-launch-tasks.md`.

## Launch Shape

- Public app URL: `https://fitness.hala-apps.com`.
- Frontend service: runs the root `Containerfile` as a Vercel container
  service, builds `SparkyFitnessFrontend` with Vite, and serves
  `SparkyFitnessFrontend/dist` with SPA fallback.
- Backend service: runs Vercel's Express service runtime with
  `SparkyFitnessServer/server.ts` as the entrypoint.
- Backend container fallback: `Dockerfile.vercel` builds the same app for local
  validation or a future container runtime; it is not the active Vercel service.
- Database: managed PostgreSQL, not a database container on Vercel.
- Storage for MVP: `SPARKY_FITNESS_STORAGE_MODE=disabled`.
- Backups for MVP: managed Postgres provider backups, with
  `SPARKY_FITNESS_SERVER_BACKUPS_ENABLED=false`.
- Background jobs for MVP:
  `SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS=true`.

The root `vercel.json` owns public routing. Vercel Services route a request to
one service, and that service receives the original request path, so the
backend mounts both `/api/health-data` and `/health-data`.

## Vercel Setup

1. Create or select a Vercel project for this repository.
2. Use the root `vercel.json`; do not create separate frontend/backend projects
   unless this runbook is updated.
3. Confirm the project has two services:
   - `frontend`: container runtime using the root `Containerfile`
   - `backend`: Express framework using `SparkyFitnessServer/server.ts`
4. Confirm routing:
   - `/api/(.*)` -> `backend`
   - `/uploads/(.*)` -> `backend`
   - `/mcp/(.*)` -> `backend`
   - `/health-data/(.*)` -> `backend`
   - `/(.*)` -> `frontend`
5. Keep public API docs disabled unless intentionally exposing them:
   `SPARKY_FITNESS_PUBLIC_API_DOCS=false`.
6. Keep developer tools disabled:
   `DEV_TOOLS_ENABLED=false`.

Useful Vercel references:

- Services: https://vercel.com/docs/services
- Services routing: https://vercel.com/docs/services/routing
- Service configuration: https://vercel.com/docs/services/config-reference
- Container images: https://vercel.com/docs/functions/container-images
- Project configuration: https://vercel.com/docs/project-configuration

## Managed PostgreSQL

Create a managed PostgreSQL database before the first production deploy.
Choose a provider with automatic backups enabled and SSL support. Keep the
database private to the provider/Vercel path whenever possible.

Current SparkyFitness launch database:

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
- SSL setting: `SPARKY_FITNESS_DB_SSL=verify-full`
- Supabase CA: protected `SPARKY_FITNESS_DB_SSL_CA` environment value from
  Database Settings > SSL Configuration. Literal `\n` sequences are supported.

The database password and app-role password are stored only in ignored local
credentials at `private/supabase-sparkyfitness.env`.

Required database env vars:

```bash
SPARKY_FITNESS_DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
SPARKY_FITNESS_DB_PORT=5432
SPARKY_FITNESS_SYSTEM_DB_PORT=6543
SPARKY_FITNESS_DB_NAME=...
SPARKY_FITNESS_DB_USER=postgres.diqsuhrgkwkgdonkmths
SPARKY_FITNESS_DB_PASSWORD=...
SPARKY_FITNESS_APP_DB_USER=sparky_app.diqsuhrgkwkgdonkmths
SPARKY_FITNESS_APP_DB_PASSWORD=...
SPARKY_FITNESS_DB_SSL=verify-full
SPARKY_FITNESS_DB_SSL_CA=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
SPARKY_FITNESS_DB_POOL_MAX=1
SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS=1000
```

The RLS application pool must use Supavisor session mode on `5432` because
SparkyFitness RLS context is session-scoped. Owner and Better Auth traffic use
transaction mode on `6543`, which avoids consuming the session pool during
parallel Vercel cold starts. Keep the per-process pool limit at `1` and the idle
client retention at `1000` ms for the MVP so inactive functions release session
pool slots promptly. The current Supabase pooler `default_pool_size` is `30`
against the database `max_connections` value of `60`. The original value of
`15` was too small for an authenticated dashboard burst across parallel Vercel
instances; the final value passed the production burst test while preserving
capacity for platform and system connections.
Do not run startup migrations through transaction mode; the current deployment
keeps `SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS=true` and applies migrations
out-of-band through the direct connection.

Before launch:

1. Confirm automatic database backups are enabled through the provider dashboard
   or Management API. For the current launch, the API reported WAL-G enabled and
   a completed physical backup (`1075427768`, 2026-07-09 16:22:23 UTC).
2. Confirm both owner and app database users exist.
3. Confirm the backend can connect with `SPARKY_FITNESS_DB_SSL=verify-full`
   and the protected Supabase CA value.
4. Run migrations/RLS once out-of-band or during a controlled first deploy and
   confirm they applied successfully. The current Vercel deployment uses
   `SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS=true` because the Supabase schema
   was already applied and verified.

## Secrets And Env Vars

Generate new production secrets. Do not reuse local development values.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Minimum production env:

```bash
NODE_ENV=production
SPARKY_FITNESS_FRONTEND_URL=https://fitness.hala-apps.com
BETTER_AUTH_URL=https://fitness.hala-apps.com
SPARKY_FITNESS_API_ENCRYPTION_KEY=<generated-secret>
BETTER_AUTH_SECRET=<generated-secret>
SPARKY_FITNESS_PUBLIC_API_DOCS=false
DEV_TOOLS_ENABLED=false
SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS=true
SPARKY_FITNESS_STORAGE_MODE=disabled
SPARKY_FITNESS_SERVER_BACKUPS_ENABLED=false
SPARKY_FITNESS_DISABLE_SIGNUP=false
SPARKY_FITNESS_DB_SSL=verify-full
SPARKY_FITNESS_DB_SSL_CA=<protected Supabase CA certificate>
SPARKY_FITNESS_DB_POOL_MAX=1
SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS=1000
SPARKY_FITNESS_SYSTEM_DB_PORT=6543
SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS=true
```

Optional first-admin env:

```bash
SPARKY_FITNESS_ADMIN_EMAIL=admin@example.com
```

Set secrets through the Vercel dashboard or CLI. For CLI usage, prefer stdin or
interactive prompts so secrets do not land in shell history.

```bash
vercel env add BETTER_AUTH_SECRET production
vercel env add SPARKY_FITNESS_API_ENCRYPTION_KEY production
vercel env pull --environment=production
```

Vercel env references:

- Environment variables: https://vercel.com/docs/environment-variables
- `vercel env`: https://vercel.com/docs/cli/env
- `vercel pull`: https://vercel.com/docs/cli/pull

## First Admin Sequence

1. Set `SPARKY_FITNESS_DISABLE_SIGNUP=false`.
2. Set `SPARKY_FITNESS_ADMIN_EMAIL` to the first admin email.
3. Deploy production.
4. Open the production HTTPS URL.
5. Sign up with the admin email.
6. Confirm the user has admin access.
7. If this is a private launch, set `SPARKY_FITNESS_DISABLE_SIGNUP=true`.
8. Redeploy or refresh the environment so signup is closed.
9. Confirm an unauthenticated visitor can still reach the app shell but cannot
   create a new account.

Do not rotate `BETTER_AUTH_SECRET` or
`SPARKY_FITNESS_API_ENCRYPTION_KEY` after users are onboarded unless there is a
specific rotation plan.

## Pre-Deploy Local Checks

Run from repo root unless noted.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Server:

```bash
cd SparkyFitnessServer
pnpm run validate
pnpm run build:vercel
pnpm exec vitest run tests/runtimeConfig.test.ts tests/deploymentCapabilitiesRoutes.test.ts tests/deploymentModeMiddleware.test.ts
```

Frontend:

```bash
cd SparkyFitnessFrontend
pnpm run validate
pnpm run build
node scripts/serve-vercel.mjs
```

When a database test instance is available:

```bash
cd SparkyFitnessServer
pnpm run test:migrations
```

Optional local container build, when Docker Desktop's Linux engine is running:

```bash
docker build -f Dockerfile.vercel -t sparkyfitness-server-vercel-test .
docker build -f Containerfile -t sparkyfitness-frontend-vercel-test .
```

## Preview Smoke Test

After a Vercel preview deploy:

```bash
curl -I https://<preview-domain>/
curl https://<preview-domain>/api/health
curl https://<preview-domain>/api/deployment-capabilities
```

Expected MVP capabilities:

```json
{
  "storageMode": "disabled",
  "uploadsEnabled": false,
  "serverBackupsEnabled": false,
  "backgroundJobsEnabled": false
}
```

Browser smoke test:

- Load the app shell from desktop.
- Load the app shell with an iPad-sized viewport.
- Sign up or sign in.
- Confirm an authenticated API call such as `/api/identity/user` works.
- Create, edit, and delete a food diary entry.
- Create, edit, and delete an exercise entry without an image.
- Load check-ins, reports, settings, and admin pages.
- Confirm avatar, check-in photo, exercise image, and backup UI show clear
  unavailable behavior in Vercel MVP mode.
- Confirm `/api/api-docs` is not public unless deliberately enabled.
- Check Vercel runtime logs for auth, migration, RLS, and database connection
  errors.

## Production Launch

1. Confirm production env values contain no placeholders.
2. Confirm managed Postgres backups are enabled.
3. Promote or deploy to production.
4. Confirm `SPARKY_FITNESS_FRONTEND_URL` and `BETTER_AUTH_URL` match the final
   production HTTPS domain exactly.
5. Run the preview smoke test commands against production.
6. Complete the first-admin sequence.
7. Run the browser smoke test on desktop and a real iPad Safari browser, or a
   BrowserStack-equivalent iPad Safari session.
8. Review Vercel logs after the first sign-in and core tracking flow.

Current production launch record:

- Vercel project: `sparkyfitness`
- Project id: `prj_wTUEBmzROOWOGe20LeRzECiI66SI`
- Production deployment: `dpl_2Q5CVfdABc3MnAzhKsnedHxXZfhQ`
- Stable production URL: `https://fitness.hala-apps.com`
- Vercel fallback URL: `https://sparkyfitness-smoky.vercel.app`
- Verified HTTP checks:
  - `/`
  - `/settings`
  - `/assets/index-BlhN7XbC.js`
  - `/registerSW.js`
  - `/manifest.webmanifest`
  - `/api/health`
  - `/api/deployment-capabilities`
  - `/api/auth/settings`
- The initial direct-host deployment failed database writes because Vercel
  could not reach Supabase's IPv6 endpoint. Production now uses the IPv4
  Supavisor pooler. RLS traffic stays on session mode `5432`; owner/auth traffic
  uses transaction mode `6543`. Keep `SPARKY_FITNESS_DB_POOL_MAX=1` and
  `SPARKY_FITNESS_DB_IDLE_TIMEOUT_MS=1000`. The provider session pool is set to
  `30` clients against `max_connections=60`; this passed the authenticated
  production burst that exhausted the original 15-client setting.
- Production browser QA passed signup/sign-in, session persistence, food CRUD,
  metadata-only exercise CRUD, check-ins, reports, settings, and disabled
  upload/backup states. Desktop, mobile, and iPad-sized Chromium viewports
  passed. A physical iPad Safari or BrowserStack-equivalent Safari check remains
  outstanding.
- Supabase's Management API reported WAL-G backups enabled and physical backup
  `1075427768` completed at 2026-07-09 16:22:23 UTC. Vercel logs were clean after
  the final authenticated smoke test.
- The temporary smoke-test admin and all of its data were deleted after QA.
  Production currently has no users, so the real owner must complete signup and
  become the first admin before the deployment is operationally handed over.

## Rollback

Use Vercel Instant Rollback or the CLI if production is unhealthy:

```bash
vercel rollback
```

Rollback caveats:

- A rollback restores a previous deployment build and may restore older
  deployment configuration.
- Environment variable changes made after the rolled-back build may not be part
  of the restored deployment.
- Database migrations are not automatically rolled back. If a migration caused
  the incident, treat rollback as an app rollback only and follow a database
  recovery plan using provider backups or a verified down migration.

After rollback:

```bash
curl https://<production-domain>/api/health
curl https://<production-domain>/api/deployment-capabilities
```

Then sign in and run one read-only app smoke test.

Vercel rollback references:

- Instant Rollback: https://vercel.com/docs/instant-rollback
- `vercel rollback`: https://vercel.com/docs/cli/rollback

## Post-Launch Follow-Ups

- Decide whether uploads stay disabled or move to Vercel Blob/S3.
- Move background sync jobs to a controlled worker or scheduled job model.
- Add production error monitoring.
- Add uptime checks for `/api/health`.
- Move this runbook into public installation docs once provider/domain choices
  are stable.
