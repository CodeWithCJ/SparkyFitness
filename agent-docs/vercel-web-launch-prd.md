# PRD: Vercel Web App Launch

Last updated: 2026-07-09

## Assumptions

1. "Faisal" means Vercel, based on the earlier Netlify vs Vercel hosting discussion.
2. "Launch it as a web app first" means we are shipping the browser web app only. Native iOS/Android releases and the Garmin microservice are out of scope for the first launch.
3. The app will be hosted online, not on a home computer or local network, so it must be reachable from an iPad over a public HTTPS URL.
4. The first production launch should prioritize a working, secure core fitness tracker over full feature parity with the Docker/self-hosted install.
5. The public browser URL should stay same-origin for app and API traffic, so the frontend calls `/api`, `/uploads`, `/health-data`, and `/mcp` through Vercel routing instead of calling a separate API origin directly.
6. Production data will live in managed PostgreSQL, not on your machine and not in a Postgres container on Vercel.
7. Disk-backed uploads and server-side backup archives are not safe on Vercel until they are moved to durable object storage.

## Objective

Launch SparkyFitness as a production web application on Vercel with a public HTTPS domain, authenticated user accounts, managed PostgreSQL, and the core web tracking flows working end to end from desktop and iPad browsers.

The target user for this launch is a web user who wants to track food, exercise, water, check-ins, medications, goals, settings, and reports from a browser, including Safari on iPad. The first launch does not need native mobile app distribution, Garmin Connect service hosting, local machine hosting, or Docker volume-based backup/restore.

## Success Criteria

- Users can visit the production HTTPS domain and load the React app.
- Users can open the production HTTPS domain from an iPad browser.
- Users can sign up or sign in through the same public web domain.
- Better Auth session cookies work through the Vercel route/proxy layer.
- Core authenticated API calls work through `/api`.
- PostgreSQL migrations and RLS policies apply safely against the managed database.
- The server starts on Vercel's assigned `PORT`.
- Production Postgres connections support SSL when required by the database provider.
- Background sync/cron jobs do not run unpredictably in a serverless/container-autoscaled environment.
- Upload and backup features are either backed by durable storage or explicitly disabled in production with clear behavior.
- `SPARKY_FITNESS_FRONTEND_URL` and `BETTER_AUTH_URL` match the final public HTTPS domain.
- Public API docs and developer MCP tools are disabled unless intentionally enabled by an admin.

## Non-Goals

- Native iOS or Android launch.
- Garmin microservice launch.
- Home-machine hosting or LAN-only access.
- Docker Compose production hosting.
- Kubernetes or Helm deployment.
- Public docs site deployment.
- Reworking the database schema unless a launch blocker requires it.
- HIPAA/compliance certification. This launch can be privacy-conscious, but certification is a separate project.

## Recommended Architecture

Use Vercel for the public online web app and backend runtime, with managed services for state:

- Frontend: `SparkyFitnessFrontend`, built by Vite and served by the
  `frontend` Vercel container service from the root `Containerfile`.
- Backend: `SparkyFitnessServer`, deployed as the `backend` Vercel container
  service from `Dockerfile.vercel`.
- Database: Supabase managed PostgreSQL with SSL enabled.
- File storage: disabled for MVP or moved to durable object storage before enabling upload features.
- Public domain: one browser-facing domain,
  `https://fitness.hala-apps.com`, reachable from the iPad over the
  internet.
- API routing: browser calls same-origin `/api/*`; Vercel routes those requests to the backend service.
- Health check: backend `/api/health`.

Same-origin routing is preferred because the frontend already uses relative API paths (`/api`, `/uploads`, `/health-data`, `/mcp`) and Better Auth is configured around `/api/auth`.

## Key Technical Findings

- The frontend already uses `API_BASE_URL = '/api'`, which is good for a same-origin Vercel deployment.
- The server currently listens on `SPARKY_FITNESS_SERVER_PORT || 3010`; Vercel needs support for `process.env.PORT`.
- The server currently creates PostgreSQL pools without SSL options. Managed Postgres commonly requires SSL.
- Startup applies migrations and RLS policies. Autoscaled instances can race unless migration execution is locked or moved to a one-shot deploy step.
- The server schedules multiple `node-cron` jobs at startup. That is risky on Vercel because instances can start, stop, and duplicate.
- Uploads and backups currently assume durable local filesystem paths such as `uploads/` and `backup/`; Vercel runtime storage should be treated as ephemeral.

## Tech Stack

- Frontend: React 19, Vite 8, TypeScript 5, Tailwind CSS v4, TanStack Query 5, React Router 7.
- Backend: Express 5, TypeScript 5, Better Auth, PostgreSQL via `pg`, Zod, Vitest.
- Shared contracts: `@workspace/shared`.
- Deployment target: Vercel web/backend services.
- Database: managed PostgreSQL.
- Optional later storage: Vercel Blob or S3-compatible storage.

## Commands

Run from repo root unless noted.

```bash
corepack enable
pnpm install --frozen-lockfile
```

Frontend validation:

```bash
cd SparkyFitnessFrontend
pnpm run validate
pnpm run test:ci
pnpm run build
```

Server validation:

```bash
cd SparkyFitnessServer
pnpm run validate
pnpm run test:ci
```

Migration smoke test against a configured Postgres instance:

```bash
cd SparkyFitnessServer
pnpm run test:migrations
```

Secret generation:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Project Structure

- `SparkyFitnessFrontend/` - React/Vite web app.
- `SparkyFitnessFrontend/vercel.json` - planned frontend routing/build configuration if using a frontend-root Vercel project.
- `SparkyFitnessServer/` - Express API and startup logic.
- `SparkyFitnessServer/db/` - migrations, RLS policies, and grants.
- `SparkyFitnessServer/utils/` - startup helpers, migrations, env, proxy, secrets.
- `SparkyFitnessServer/db/poolManager.ts` - PostgreSQL connection pools.
- `SparkyFitnessServer/SparkyFitnessServer.ts` - Express app, routes, cron scheduling, listener.
- `Dockerfile.vercel` - backend Vercel container entrypoint.
- `Containerfile` - frontend Vercel container entrypoint.
- `shared/` - shared Zod schemas and utilities.
- `agent-docs/vercel-web-launch-tasks.md` - implementation task list.

## Code Style

Follow the existing package conventions. Server code uses ESM imports with `.js` extensions from TypeScript files and shared logging helpers rather than raw `console.*` in application code.

Example style for env-driven behavior:

```ts
const isVercelRuntime = process.env.VERCEL === "1";
const disableBackgroundJobs =
  process.env.SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS === "true";

if (!disableBackgroundJobs) {
  scheduleBackupsOnStartup();
}

const port = process.env.PORT ?? process.env.SPARKY_FITNESS_SERVER_PORT ?? 3010;
```

## Testing Strategy

- Unit tests for new env parsing and DB pool configuration.
- Startup-oriented tests for migration locking behavior where practical.
- Existing server validation: `pnpm run validate` and `pnpm run test:ci`.
- Existing frontend validation: `pnpm run validate`, `pnpm run test:ci`, and `pnpm run build`.
- Deployment smoke tests after Vercel deploy:
  - `GET /` returns the app shell.
  - `GET /api/health` returns healthy status through the public domain.
  - Sign up/sign in works.
  - Authenticated `/api/identity/user` works.
  - Create/read a diary entry.
  - Confirm disabled features fail clearly or durable storage works.

## Boundaries

Always:

- Keep health data and auth secrets out of source control.
- Keep `SPARKY_FITNESS_FRONTEND_URL` and `BETTER_AUTH_URL` on the public HTTPS web domain.
- Prefer same-origin API routing for the browser.
- Keep public API docs disabled by default.
- Disable `DEV_TOOLS_ENABLED` in production.
- Preserve RLS behavior and migration order.
- Run package validation before declaring launch readiness.

Ask first:

- Choosing a paid managed Postgres provider.
- Choosing Vercel Blob vs S3-compatible storage.
- Disabling upload/backup features for the MVP.
- Adding new production dependencies.
- Changing auth/session behavior.
- Changing database schema or migration behavior beyond launch safety.

Never:

- Commit `.env` files or production secrets.
- Expose Postgres publicly.
- Store production uploads only on Vercel ephemeral filesystem.
- Run uncontrolled cron/sync jobs on every autoscaled backend instance.
- Enable public developer tools in production.
- Change `BETTER_AUTH_SECRET` or `SPARKY_FITNESS_API_ENCRYPTION_KEY` after real users are onboarded unless there is a deliberate rotation plan.

## Environment Variables

Minimum production variables:

```bash
NODE_ENV=production
SPARKY_FITNESS_FRONTEND_URL=https://fitness.hala-apps.com
BETTER_AUTH_URL=https://fitness.hala-apps.com
SPARKY_FITNESS_DB_HOST=...
SPARKY_FITNESS_DB_PORT=5432
SPARKY_FITNESS_DB_NAME=...
SPARKY_FITNESS_DB_USER=...
SPARKY_FITNESS_DB_PASSWORD=...
SPARKY_FITNESS_APP_DB_USER=...
SPARKY_FITNESS_APP_DB_PASSWORD=...
SPARKY_FITNESS_API_ENCRYPTION_KEY=...
BETTER_AUTH_SECRET=...
SPARKY_FITNESS_DISABLE_SIGNUP=false
SPARKY_FITNESS_PUBLIC_API_DOCS=false
DEV_TOOLS_ENABLED=false
SPARKY_FITNESS_DISABLE_BACKGROUND_JOBS=true
SPARKY_FITNESS_SKIP_STARTUP_MIGRATIONS=true
```

Expected new or updated variables:

```bash
SPARKY_FITNESS_DB_SSL=require
SPARKY_FITNESS_STORAGE_MODE=disabled
```

`SPARKY_FITNESS_STORAGE_MODE=disabled` is the fastest safe MVP path if we do
not implement durable uploads before launch. The current launch-safety code
recognizes `local` and `disabled`; object storage modes such as `vercel-blob`
or `s3` belong to the optional durable media phase before uploads can be
re-enabled.

## Launch Phases

### Phase 1: Vercel Web MVP

- Make backend Vercel-runtime compatible.
- Connect managed Postgres securely.
- Make migrations safe under autoscaling.
- Disable background cron jobs by default.
- Deploy frontend and backend through Vercel.
- Launch core tracking workflows.
- Disable or clearly gate local-disk-only uploads/backups.

### Phase 2: Durable Media

- Add object-storage abstraction.
- Migrate avatar, OIDC logo, exercise image, exercise entry image, check-in photo, and pregnancy photo flows.
- Serve stored media through stable URLs or backend streaming routes.
- Re-enable upload UI after storage verification.

### Phase 3: Production Hardening

- Add uptime monitoring and error tracking.
- Configure managed database backups.
- Add deployment rollback checklist.
- Add release documentation for Vercel launch.
- Consider background jobs through Vercel Cron or another worker host.

## Open Questions

1. What is the final production domain?
2. Which managed Postgres provider should we use?
3. Are image uploads required on day one, or can the MVP disable them until durable storage is implemented?
4. Should signups remain open after your first admin account is created?
5. Do you need AI image/chat features on day one, or can provider API keys wait until after core launch?

## Source References

- Vercel backend/Express docs: https://vercel.com/docs/frameworks/backend/express
- Vercel Docker/container docs: https://vercel.com/kb/guide/does-vercel-support-docker-deployments
- SparkyFitness Docker Compose docs: https://codewithcj.github.io/SparkyFitness/install/docker-compose/
- SparkyFitness environment variables docs: https://codewithcj.github.io/SparkyFitness/install/environment-variables/
