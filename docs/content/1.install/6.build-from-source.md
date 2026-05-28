# Build from Source

Run SparkyFitness directly on your machine without Docker. You will need Node.js, pnpm, and a running PostgreSQL instance.

## Prerequisites

- **Node.js** 24 or later
- **pnpm** — install with `npm install -g pnpm`
- **PostgreSQL** 17 or later

## 1. Clone the repository

```bash
git clone https://github.com/CodeWithCJ/SparkyFitness.git
cd SparkyFitness
```

## 2. Install dependencies

```bash
pnpm install
```

## 3. Configure environment variables

Copy the example env file to the repo root and fill in your values:

**Linux / macOS**
```bash
cp docker/.env.example .env
```

**Windows (PowerShell)**
```powershell
Copy-Item docker\.env.example .env
```

Required values to set in `.env`:

| Variable | Description |
|---|---|
| `SPARKY_FITNESS_DB_HOST` | PostgreSQL host — use `localhost` for local installs |
| `SPARKY_FITNESS_DB_NAME` | Database name (e.g. `sparkyfitness_db`) |
| `SPARKY_FITNESS_DB_USER` | Superuser used for migrations (e.g. `sparky`) |
| `SPARKY_FITNESS_DB_PASSWORD` | Superuser password |
| `SPARKY_FITNESS_APP_DB_USER` | App user with limited privileges (e.g. `sparky_app`) |
| `SPARKY_FITNESS_APP_DB_PASSWORD` | App user password |
| `SPARKY_FITNESS_FRONTEND_URL` | Set to `http://localhost:8080` for local builds |
| `SPARKY_FITNESS_API_ENCRYPTION_KEY` | 64-character hex string — generate with `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BETTER_AUTH_SECRET` | Strongly recommended — auto-generated if absent but sessions will not survive server restarts. Signs sessions and encrypts 2FA/TOTP data. **Never change after users have enabled 2FA or they will be locked out.** |

> **Note:** The default `SPARKY_FITNESS_DB_HOST` in the example file is set to a Docker service name. Change it to `localhost` for a local install.

## 4. Set up PostgreSQL

Create the superuser and database that match your `.env` values.

**Linux**
```bash
sudo -u postgres createuser --pwprompt sparky
sudo -u postgres createdb sparkyfitness_db --owner sparky
```

**macOS (Homebrew)** — drop the `sudo -u postgres` prefix if your current user already has PostgreSQL superuser rights:
```bash
createuser --pwprompt sparky
createdb sparkyfitness_db --owner sparky
```

**Windows** — open a terminal and use `psql` as the `postgres` user (adjust the path to match your PostgreSQL install):
```powershell
psql -U postgres -c "CREATE ROLE sparky WITH LOGIN PASSWORD 'yourpassword';"
psql -U postgres -c "CREATE DATABASE sparkyfitness_db OWNER sparky;"
```

The `sparky_app` application user is created automatically by the server on first startup — you do not need to create it manually. Database migrations also run automatically on server start.

## 5. Start the backend server

```bash
cd SparkyFitnessServer
pnpm start
```

The API server starts on port `3010` by default. On first run it applies all migrations and creates the app database user. API docs are available at `http://localhost:3010/api/api-docs/swagger`.

## 6. Start the frontend

Open a second terminal from the repo root:

```bash
cd SparkyFitnessFrontend
pnpm dev
```

The web app starts on port `8080` by default. Open `http://localhost:8080` in your browser.

## Port summary

| Service | Default URL |
|---|---|
| Backend API | `http://localhost:3010` |
| Frontend | `http://localhost:8080` |
| API Docs | `http://localhost:3010/api/api-docs/swagger` |
