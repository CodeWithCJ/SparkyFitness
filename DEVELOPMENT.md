# DEVELOPMENT.md

Local development environment for this checkout of SparkyFitness, plus the
commands used to smoke-test it.

This file documents **this machine's** setup, not a supported installation
path. The upstream, portable instructions live in
[`docs/src/install/build-from-source.md`](docs/src/install/build-from-source.md);
read that first if you are setting up a fresh machine.

- Repo: `/home/pawel/Workshops/healthy/SparkyFitness`
- Branch: `main` (tracking `origin/main`)

## What runs, and where

| Service | URL | Port | Notes |
|---|---|---|---|
| Frontend (Vite dev server) | http://localhost:8082 | 8082 | HMR over the Vite websocket |
| Backend API | http://localhost:3010 | 3010 | Express 5, restarted by nodemon |
| Dev database | `localhost:5432` | 5432 | `postgres:18.3-alpine` in Docker |
| API docs | http://localhost:3010/api/api-docs/swagger | — | returns 401 unless public docs are enabled |

The frontend dev server proxies `/api`, `/mcp`, `/uploads` and `/health-data`
to the backend on 3010, so the app is used through **8082** and the browser
never talks to 3010 directly. Override the backend host with
`VITE_BACKEND_HOST`.

### Why 8082 and not 8080

Vite's default port is 8080, but `config-gateway-1` (the NVIDIA openshell
gateway container) publishes `127.0.0.1:8080-8081` on this machine. Vite was
therefore started with `--port 8082`, and `SPARKY_FITNESS_FRONTEND_URL` in
`.env` is set to `http://localhost:8082` so that CORS and Better Auth's
callback URLs match the origin the browser actually uses. If you move the
frontend to another port, change both.

### Coexisting deployment

`../containers/sparkyfitness/` runs the published Docker images on port
**3004**. It is a separate, self-contained stack with its own database volume
and does not share state with this development environment. The two can run
at the same time; only the ports differ.

## Toolchain

| Tool | Version |
|---|---|
| OS | Pop!_OS 24.04 LTS (kernel 7.1.5) |
| Node.js | v24.22.0 |
| pnpm | 10.33.4 |
| Docker | 29.9.1 (compose 5.6.0) |

Node and pnpm versions match what CI uses (`.github/workflows/ci-tests.yml`).

## Setup from scratch

### 1. Install workspace dependencies

```bash
cd /home/pawel/Workshops/healthy/SparkyFitness
pnpm install --frozen-lockfile
```

Roughly 2,200 packages. With a warm pnpm store this takes seconds; a cold
store pulls several GB.

### 2. Create the repo-root `.env`

The backend loads `../.env` relative to `SparkyFitnessServer/`, so the file
lives at the repo root. It is gitignored.

```bash
cp docker/.env.example .env
```

Then set the following. Values in angle brackets must be generated; the
server's preflight check refuses to start if a secret still holds a template
placeholder (anything starting with `changeme` or `replace_with`).

| Key | Value |
|---|---|
| `SPARKY_FITNESS_DB_USER` | `sparky` |
| `SPARKY_FITNESS_DB_PASSWORD` | `password` (must match the container below) |
| `SPARKY_FITNESS_DB_NAME` | `sparkyfitness_db` |
| `SPARKY_FITNESS_DB_HOST` | `localhost` — the example file ships `sparkyfitness-db`, a Docker service name that does not resolve here |
| `SPARKY_FITNESS_DB_PORT` | `5432` |
| `SPARKY_FITNESS_APP_DB_USER` | `sparky_app` (the server creates the role) |
| `SPARKY_FITNESS_APP_DB_PASSWORD` | `openssl rand -hex 32` |
| `SPARKY_FITNESS_API_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `SPARKY_FITNESS_FRONTEND_URL` | `http://localhost:8082` |
| `NODE_ENV` | `development` |
| `SPARKY_FITNESS_LOG_LEVEL` | `INFO` |

Two of these are write-once:

- `BETTER_AUTH_SECRET` signs session cookies and encrypts stored 2FA secrets.
  Changing it logs every user out and permanently locks out anyone with 2FA
  enabled.
- `SPARKY_FITNESS_API_ENCRYPTION_KEY` must persist or stored data can no
  longer be decrypted.

`TZ` is left at the template default (`Etc/UTC`). Set it to your own zone if
you want day bucketing to follow local time.

### 3. Start the development database

```bash
cd /home/pawel/Workshops/healthy/SparkyFitness
docker run -d --name sparkyfitness-dev-db --restart unless-stopped \
  -e POSTGRES_DB=sparkyfitness_db \
  -e POSTGRES_USER=sparky \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -v "$PWD/docker/postgresql:/var/lib/postgresql" \
  postgres:18.3-alpine
```

Two deliberate deviations from `docker/docker-compose.db_dev.yml`:

- **Image**: that file pins `postgres:15-alpine`. The docs require PostgreSQL
  17+, and production runs 18.3, so this uses `postgres:18.3-alpine` to match.
- **Mount point**: PostgreSQL 18 changed its data directory, so the volume is
  mounted at `/var/lib/postgresql`, not `/var/lib/postgresql/data`. Mounting
  the old path on an 18.x image silently persists nothing.

`docker/postgresql` is gitignored. The database is disposable — deleting the
directory gives you a clean instance, and the next server start rebuilds the
schema.

### 4. Start the backend

```bash
mkdir -p /tmp/sparky-dev
nohup setsid sh -c 'cd /home/pawel/Workshops/healthy/SparkyFitness/SparkyFitnessServer && sleep infinity | exec pnpm start' \
  > /tmp/sparky-dev/server.log 2>&1 &
```

`pnpm start` runs `nodemon`, which executes `tsx index.ts`. On first start
against an empty database it applies all migrations and RLS policies, then
creates the `sparky_app` role.

#### Why the `sleep infinity |` is there

nodemon keeps a `ReadStream` on stdin so you can type `rs` to restart it.
When nodemon is started detached with a closed or `/dev/null` stdin, that
stream fails and nodemon dies roughly a second after spawning its child:

```
[nodemon] starting `tsx index.ts`
Error: EBADF: bad file descriptor, read
Emitted 'error' event on ReadStream instance at:
```

The child survives and is reparented to PID 1, so **the API keeps answering
on 3010 while file watching is dead**. It looks healthy and silently stops
reloading. Piping from `sleep infinity` gives nodemon a stdin that never
reaches EOF, which avoids the failure.

Symptoms if this happens again: `pgrep -af nodemon` returns nothing, yet
`curl localhost:3010/api/health` still returns 200.

### 5. Start the frontend

```bash
nohup sh -c 'cd /home/pawel/Workshops/healthy/SparkyFitness/SparkyFitnessFrontend && exec pnpm dev --port 8082' \
  > /tmp/sparky-dev/frontend.log 2>&1 &
```

### 6. Production build (optional)

```bash
cd SparkyFitnessFrontend
pnpm run build
```

`build` runs `validate` first (typecheck, ESLint with `--max-warnings 0`,
Prettier check, Knip) and then `vite build`, emitting `dist/` and the PWA
service worker. `dist/` is gitignored. The dev server serves source with HMR,
not `dist/`; serve the build separately (`pnpm exec vite preview`) if you need
to exercise the production bundle.

## Process management

Current process tree, as of the last verified run. PIDs change on every
restart — use the `pgrep` forms below rather than copying these.

| Role | Command | Last PID |
|---|---|---|
| Backend supervisor | `nodemon/bin/nodemon.js` | 2657556 |
| Backend app (owns 3010) | `SparkyFitnessServer/.../tsx/dist/cli.mjs index.ts` | 2657910 |
| Frontend | `SparkyFitnessFrontend/.../vite/bin/vite.js --port 8082` | 2649342 |
| stdin holder | `sleep infinity` | 2657527 |

```bash
# what is listening
ss -ltnp | grep -E ':(5432|3010|8082) '

# who is what
pgrep -af 'nodemon/bin/nodemon'
pgrep -af 'vite/bin/vite'
pgrep -af 'SparkyFitnessServer/node_modules/.bin/../tsx'

# logs
sed -n "$(($(wc -l < /tmp/sparky-dev/server.log)-40)),\$p" /tmp/sparky-dev/server.log
sed -n "$(($(wc -l < /tmp/sparky-dev/frontend.log)-20)),\$p" /tmp/sparky-dev/frontend.log
```

Restart the backend (nodemon watches source, so this is the normal path):

```bash
touch SparkyFitnessServer/index.ts
```

Stop everything:

```bash
pkill -f 'nodemon/bin/nodemon'
pkill -f 'vite/bin/vite'
docker stop sparkyfitness-dev-db
```

The `sleep infinity` holder exits with the pipeline once nodemon goes.

> Unrelated: another `tsx ... index.ts` process (PID 2440110 at the time of
> writing, owned by a different user) also runs on this machine. It is not
> part of this environment and cannot be signalled by this user.

## Smoke test

Each step is independent; run them in order for a full check. Expected
results are given inline.

### 1. Services are up

```bash
ss -ltn | grep -E ':(5432|3010|8082) '
docker ps --filter name=sparkyfitness-dev-db --format '{{.Names}}  {{.Status}}'
```

Expect three listening sockets and a container in `Up` state.

### 2. Backend health

```bash
curl -s -w '\nHTTP %{http_code}\n' http://localhost:3010/api/health
```

Expect `{"status":"UP"}` and `HTTP 200`.

### 3. Frontend serves the app, and its render path compiles

```bash
for u in "/" "/login" "/src/main.tsx" "/locales/en/translation.json"; do
  printf '%-32s -> %s\n' "$u" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://localhost:8082$u")"
done
```

Expect `200` for all four. `/src/main.tsx` returning 200 proves the dev
server is compiling the app entry module, and `/login` returning 200 proves
SPA history fallback works. The served HTML at `/` should contain
`id="root"`, `/src/main.tsx` and `/@vite/client`:

```bash
curl -s http://localhost:8082/ | grep -oE 'id="root"|/@vite/client|/src/main\.tsx' | sort -u
```

### 4. API reachable through the app origin, auth still enforced

```bash
curl -s -o /dev/null -w '/api/health      -> %{http_code}\n' http://localhost:8082/api/health
curl -s -o /dev/null -w '/api/health-data -> %{http_code}\n' http://localhost:8082/api/health-data
```

Expect `200` and `401`. The 401 confirms the auth middleware is mounted and
running — a `502` here would mean the Vite proxy cannot reach the backend.

### 5. End-to-end: sign up, authenticate, read own data

This is the check that exercises proxy → Express → Better Auth → Postgres
under row-level security, and it verifies a real write.

```bash
cd /home/pawel/Workshops/healthy/SparkyFitness
JAR=/tmp/sparky-dev/smoke-cookies.txt
EMAIL=smoke-test@example.com
PASSWORD='Smoke-Test-Password-123'
rm -f "$JAR"

# create the account (skip if it already exists, and sign in instead)
curl -s -o /tmp/sparky-dev/signup.json -w 'sign-up       HTTP %{http_code}\n' \
  -c "$JAR" -X POST http://localhost:8082/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:8082' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Smoke Test\"}"

# session is readable with the cookie
curl -s -b "$JAR" -o /tmp/sparky-dev/session.json -w 'get-session   HTTP %{http_code}\n' \
  http://localhost:8082/api/auth/get-session

# an authenticated, database-backed read
curl -s -b "$JAR" -o /tmp/sparky-dev/summary.json -w 'daily-summary HTTP %{http_code}\n' \
  "http://localhost:8082/api/daily-summary?date=$(date +%F)"
```

Expect `200` from all three, and a `daily-summary` body containing a `goals`
object with numeric calorie and macro targets.

To sign in to an account that already exists, swap the first call for:

```bash
curl -s -o /dev/null -w 'sign-in HTTP %{http_code}\n' \
  -c "$JAR" -X POST http://localhost:8082/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:8082' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

A local test account `e2e-test@example.com` also exists in the development
database from earlier runs.

### 6. The write actually landed

```bash
export PGPASSWORD=password
docker exec -e PGPASSWORD sparkyfitness-dev-db \
  psql -U sparky -d sparkyfitness_db -t -A \
  -c "select count(*) from \"user\" where email='smoke-test@example.com';" \
  -c "select 'sessions: '||count(*) from session;"
unset PGPASSWORD
```

Expect `1` and a non-zero session count.

### 7. Hot reload still works

```bash
touch SparkyFitnessServer/config/logging.ts
sleep 8
grep -c 'restarting due to changes' /tmp/sparky-dev/server.log
curl -s -o /dev/null -w 'health after reload -> %{http_code}\n' http://localhost:3010/api/health
```

Expect a count of at least 1 and a `200`. If the count does not increase,
nodemon is not watching — see the stdin note above.

## Database inspection

Migration state lives in the `system` schema, not `public`:

```bash
export PGPASSWORD=password
docker exec -e PGPASSWORD sparkyfitness-dev-db psql -U sparky -d sparkyfitness_db -t -A \
  -c "select count(*) from system.schema_migrations;" \
  -c "select count(*) from information_schema.tables where table_schema='public';" \
  -c "select 'RLS tables: '||count(*) from pg_tables where schemaname='public' and rowsecurity;"
unset PGPASSWORD
```

Last verified: **258** applied migrations (matching 258 files in
`SparkyFitnessServer/db/migrations/`), **114** public tables, **98** with RLS
enabled, and roles `sparky` plus `sparky_app`.

Migrations are idempotent across restarts: after a nodemon reload, the log
shows no `Applying migration:` lines. To confirm:

```bash
awk '/restarting due to changes/{n++} n && /Applying migration/{c++} END{print c+0}' \
  /tmp/sparky-dev/server.log
```

## Known issues

- **Swagger spec is incomplete.** Startup logs
  `YAMLSemanticError: Nested mappings are not allowed in compact mappings`
  for `routes/v2/runProgramRoutes.ts:8`, so that route is dropped from the
  generated spec. The server runs normally; the fix is to reflow that JSDoc
  description block.
- **`/api/api-docs/swagger` returns 401.** Public API docs are off by
  default. `SPARKY_FITNESS_PUBLIC_API_DOCS=true` in `.env` exposes them.
- **`/api/goals` returns 404.** That is not a valid path; goal values come
  back inside `GET /api/daily-summary`. The correct routes live under
  `routes/goalRoutes.ts`.
- **Ports 8080 and 8081 are occupied** by `config-gateway-1`, which is why
  the frontend runs on 8082.

## Repo hygiene

Everything this environment creates is gitignored, so `git status` stays
clean:

| Path | Ignored by |
|---|---|
| `.env` | `.gitignore:21` |
| `SparkyFitnessFrontend/dist` | `.gitignore:18` |
| `docker/postgresql` | `.gitignore:11` |
| `node_modules` | `.gitignore:14` |

The `.env` file holds live secrets and must never be committed — this
repository is public. Logs are written outside the tree, under
`/tmp/sparky-dev/`.
