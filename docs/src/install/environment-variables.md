# Environment Variables Reference

This document provides a comprehensive reference and detailed descriptions of all environment variables used by SparkyFitness.

::: info
💡 **Quick Setup Available:**
Instead of configuring variables manually, you can use our **[Interactive .env Generator](/install/env-generator)** to generate a clean, secure `.env` file directly in your browser, or start with the minimal **[docker/.env.simple.example](https://github.com/CodeWithCJ/SparkyFitness/blob/main/docker/.env.simple.example)** (~8 lines total).
:::

For the complete tracked reference file, see [`.env.example` on GitHub](https://github.com/CodeWithCJ/SparkyFitness/blob/main/docker/.env.example).

::: tip
💡 **For Standard Docker Compose Users:**
You **only need to edit your `.env` file**. The official `docker-compose.yml` already passes the variables it defines through to the services it runs (`Database`, `Server`, and `Frontend`). The `Garmin` service is commented out by default — uncomment it to use the Garmin variables — and the iOS build variables are only read by local mobile builds, never by Compose.

🛠️ **For Custom Deployments (Kubernetes, Helm, Portainer, Bare-Metal):**
The service tags below (`[Backend Server]`, `[Frontend Nginx]`, `[PostgreSQL]`, `[Garmin]`) indicate which component consumes each setting.
:::

---

## 🔑 Core Essentials (Mandatory)

These five have no safe default and must be supplied; the server fails its preflight checks without them. Everything else — including the database name, host, port and the restricted application user — has a working default and is covered under [Database Names & Connection](#module-8-database-names-connection) below.

### 1. Application Access URL `[Frontend & Backend]`

- **`SPARKY_FITNESS_FRONTEND_URL`**: The public URL of your frontend (e.g., `http://localhost:3004` for Docker Compose, `http://localhost:8080` for bare-metal local development, or your domain like `https://fitness.example.com` for production). This is crucial for CORS security and cookie sessions.

### 2. PostgreSQL Superuser `[Database & Backend]`

SparkyFitness uses a two-tier database model: a superuser for migrations and schema setup, and an unprivileged application user for daily RLS-enforced queries. Only the superuser's credentials are mandatory — the server creates and maintains the application role itself.

- **`SPARKY_FITNESS_DB_USER`**: Database superuser for migrations and schema setup. Defaults to `sparky`, and Docker Compose supplies it, so in practice you only set this for a bare-metal or external database.
- **`SPARKY_FITNESS_DB_PASSWORD`**: Superuser password. No default — you must choose one. (Can also be supplied via **`SPARKY_FITNESS_DB_PASSWORD_FILE`**).

::: danger Changing database credentials after the first start
`SPARKY_FITNESS_DB_NAME`, `SPARKY_FITNESS_DB_USER` and `SPARKY_FITNESS_DB_PASSWORD` are handed to PostgreSQL only when it initialises an empty data directory. On every later start PostgreSQL ignores them and keeps what it already has, so editing them in `.env` does not change the database — it only changes what the server tries to authenticate with, which then fails. To rotate them, `ALTER` the role inside PostgreSQL yourself. The application user is different: the server keeps that role's password in sync automatically.
:::

### 3. Security & Cryptographic Secrets `[Backend]`

- **`SPARKY_FITNESS_API_ENCRYPTION_KEY`**: A 64-character hex string (256-bit AES) for encrypting stored external provider API keys and tokens in Postgres. (Can also be supplied via **`SPARKY_FITNESS_API_ENCRYPTION_KEY_FILE`**).
  - Generate with: `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **`BETTER_AUTH_SECRET`**: A secret key used by Better Auth to sign session JWTs and encrypt TOTP 2-Factor Authentication keys in the database. (Can also be supplied via **`BETTER_AUTH_SECRET_FILE`**).
  - Generate with: `openssl rand -base64 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  - Use **base64**, not hex. The server decodes this value as base64 and silently drops anything outside that alphabet, so a passphrase containing `!@#$%` yields a shorter key than it appears to. The server refuses to start if the value decodes to an empty key (for example a literal `...`) and logs a warning if it decodes to fewer than 32 bytes.
  - > [!CAUTION]
    > **CRITICAL for 2FA/TOTP:** If you change this variable after users have enabled 2FA, the server will lose access to their secret keys and **all 2FA users will be locked out**. Keep this value persistent and back it up.
  - The server refuses to start while this is still the placeholder from `.env.example` or `.env.simple.example` (any value starting with `changeme` or `replace_with`). Every install that copied a template shares those values, so each server needs its own. If an existing install stops at this check, generate a real secret and accept the one-time cost: every user is signed out, and users with 2FA must have it cleared under **Admin > User Management > Reset MFA** and re-enroll. Passkeys, passwords and data are unaffected. If the only admin is locked out, follow the recovery steps in the [FAQ](/faq#troubleshooting).

---

## 📦 Optional Configuration Modules

Configure these optional modules based on your deployment environment and desired features.

### Module 1: 💾 Persistent Host Storage Paths `[Host Volumes]`

Maps persistent container directories to specific locations on your host filesystem (e.g., Synology NAS, Unraid, TrueNAS).

::: warning Upgrading an existing instance
`docker-compose.yml` falls back to these same defaults when the variables are absent, so a running instance already uses them whether or not they appear in your `.env`. If you change one, the server starts against a new, empty directory and it will look like your data is gone. Copy the values from your existing `.env` rather than assuming the defaults, and if you bind-mounted paths directly in `docker-compose.yml` these variables are ignored entirely.
:::

- **`DB_PATH`**: Host directory for PostgreSQL cluster data. Defaults to `./postgresql`, relative to your `docker-compose.yml`.
- **`SERVER_BACKUP_PATH`**: Host directory where database backups are exported (e.g., `./backup`).
- **`SERVER_UPLOADS_PATH`**: Host directory for profile avatars and custom food photos (e.g., `./uploads`).

The three below are the bare-metal equivalents, read by the server process itself rather than by `docker-compose.yml`. Leave them unset under Docker Compose — the volume mappings above already put the data in the right place, and setting these as well only moves it somewhere the container does not persist.

- **`SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY`**: Absolute path the server writes avatars, food photos and OIDC provider logos to. Defaults to `uploads/` inside the server directory.
- **`SPARKY_FITNESS_CUSTOM_BACKUP_DIRECTORY`**: Absolute path for exported database backups.
- **`SPARKY_FITNESS_CUSTOM_TEMP_DIRECTORY`**: Absolute path for the staging area used while a backup is being uploaded for restore.

### Module 2: ⚙️ Server Runtime `[Backend]`

Always written by the generator. These have working defaults, but the timezone in particular is worth setting: it decides which calendar day an entry is filed under.

- **`TZ`**: Server timezone as a TZ database name (e.g. `America/New_York`, `Europe/Berlin`). Defaults to `Etc/UTC`. A wrong value silently files diary entries under the wrong day.
- **`SPARKY_FITNESS_LOG_LEVEL`**: Verbosity — `DEBUG`, `INFO`, `WARN`, `ERROR` or `SILENT`. Defaults to `ERROR`. Raise it only while troubleshooting.
- **`NODE_ENV`**: Always `production` for a deployment. The generator hardcodes it.
- **`SPARKY_FITNESS_SERVER_PORT`**: Port the backend listens on inside its container. Defaults to `3010`. Docker Compose passes the same value to the frontend, whose nginx proxies to it, so the two always move together.
- **`SPARKY_FITNESS_SERVER_HOST`**: Hostname or IP the frontend's nginx proxies to. Defaults to the `sparkyfitness-server` service name. It is resolved dynamically from inside the frontend container via DNS. If pointing to a host defined in `/etc/hosts` (such as `host.docker.internal` on Linux, `localhost`, or `--link` aliases), the frontend entrypoint automatically detects it and resolves it to its IP address directly. nginx queries DNS directly and does not expand the `search` domains in `/etc/resolv.conf`, so a bare hostname that only resolves through a search path would not be reachable. The frontend entrypoint compensates: when the hostname contains no dot and does not resolve on its own, it is completed against each search domain in turn and the first that resolves is used (on Kubernetes, `sparkyfitness-server` becomes `sparkyfitness-server.<namespace>.svc.cluster.local`). Supplying the full in-cluster service FQDN yourself remains the most explicit option and skips that lookup entirely.
- **`SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS`**: Comma-separated additional origins Better Auth should trust. Leave blank unless you reach the app on more than one URL.
- **`BETTER_AUTH_URL`**: Overrides the base URL Better Auth builds callback links from. Only needed when it cannot be derived from `SPARKY_FITNESS_FRONTEND_URL`.
- **`SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS`**: The maximum time, in seconds, the server takes to stop after `SIGTERM` or `SIGINT`. From `1` to `3600`; unset or blank uses `15`, and any other value logs an error and uses `15`. During that time it stops taking new connections and lets running requests finish; when the time runs out it exits anyway. Whatever stops the container must wait longer than this before killing it: with Docker Compose, raise `SPARKY_FITNESS_STOP_GRACE_PERIOD` along with it; with the Helm chart, set `server.shutdownTimeoutSeconds` instead, which sets both.
- **`SPARKY_FITNESS_STOP_GRACE_PERIOD`**: How long Docker Compose waits for the server container to stop before killing it (`stop_grace_period` in the bundled compose files), as a Compose duration such as `20s` or `2m`. Defaults to `20s`. Keep it a few seconds longer than `SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS`, for example `65s` for a timeout of `60`; a shorter value cuts the shutdown off.
- **`SPARKY_FITNESS_DISABLE_SCHEDULED_JOBS`**: Set to `true` on every instance except one when [running multiple instances](./multiple-instances.md#run-scheduled-jobs-on-one-instance), so a single instance runs the scheduled jobs. Set it on each instance's own environment, not in a shared `.env` file, or no instance will run them. Leave it unset on a single-container install.
- **`SPARKY_FITNESS_HEALTH_WORKOUT_DEDUPE`**: Set to `true` to skip a synced workout that is probably already stored from another app (different record id, at least 80% overlap in time, and at least two of duration, distance, steps and heart rate within 15%; walking, running, hiking and similar on-foot activities count as the same activity, anything else must match). The more complete copy is kept, and the other record's id is remembered so later syncs skip it too. Manual entries are never skipped, replaced or deleted. Off by default. To review duplicates stored before turning it on, run `pnpm exec tsx scripts/reportDuplicateWorkouts.script.ts` in `SparkyFitnessServer/`; it changes nothing.

### Module 3: 🛡️ Admin Email, Public Signups & Access Policy `[Backend]`

Controls initial administrator privileges, who may register, and how users sign in:

- **`SPARKY_FITNESS_ADMIN_EMAIL`**: (Optional) Email address automatically granted Admin privileges on server startup. If left blank, the **first user to register** becomes Admin.
- **`SPARKY_FITNESS_DISABLE_SIGNUP`**: Set to `true` to disable new user registrations and lock the instance for private use.
- **`SPARKY_FITNESS_DISABLE_EMAIL_LOGIN`**: Set to `true` to force users to log in exclusively via SSO. Overridden by `SPARKY_FITNESS_FORCE_EMAIL_LOGIN`. Configure OIDC or SMTP-backed magic links first — on a fresh instance with neither, this leaves no way to sign in, because passkey registration needs an existing session.
- **`SPARKY_FITNESS_FORCE_EMAIL_LOGIN`**: Fail-safe toggle. Set to `true` to keep password login available if OIDC misbehaves. It takes precedence over `SPARKY_FITNESS_DISABLE_EMAIL_LOGIN`, so to actually disable password login you must set that to `true` **and** unset this one (or set it to `false`). `docker/.env.example` carries it only as a commented example, so it is off unless you uncomment it.
- **`SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN`**: Set to `true` to force passkey login off. Admins can also turn it off under Admin > Authentication > Login Management; this variable wins over that switch. Overridden by `SPARKY_FITNESS_FORCE_PASSKEY_LOGIN`. When off, passkey sign-in and adding new passkeys stop working; existing passkeys stay stored and can still be deleted. `SPARKY_FITNESS_FORCE_EMAIL_LOGIN` remains the way back in if SSO stops working.
- **`SPARKY_FITNESS_FORCE_PASSKEY_LOGIN`**: Fail-safe toggle. Set to `true` to keep passkey login available even if it was turned off under Admin > Authentication > Login Management or with `SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN`; it takes precedence over both. Use it to get back in if passkeys were turned off and were the only way to sign in.
- **`ALLOW_PRIVATE_NETWORK_CORS`**: Set to `true` to allow Cross-Origin Resource Sharing (CORS) from private LAN subnets (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`, `localhost`).

### Module 4: ✉️ SMTP Email Notifications `[Backend]`

Enable email delivery for password resets, account verification codes, and system alerts:

- **`SPARKY_FITNESS_EMAIL_HOST`**: SMTP outgoing server hostname (e.g., `smtp.mailgun.org` or `smtp.gmail.com`).
- **`SPARKY_FITNESS_EMAIL_PORT`**: SMTP port (`587` for STARTTLS, `465` for SSL/TLS, `25` for local relays). Defaults to `587`.
- **`SPARKY_FITNESS_EMAIL_SECURE`**: Set to `true` for port `465` implicit TLS; `false` for port `587` STARTTLS.
- **`SPARKY_FITNESS_EMAIL_USER`**: SMTP username.
- **`SPARKY_FITNESS_EMAIL_PASS`**: SMTP password or API token. (Can also be supplied via **`SPARKY_FITNESS_EMAIL_PASS_FILE`**).
- **`SPARKY_FITNESS_EMAIL_FROM`**: Sender email address visible to recipients (e.g., `noreply@yourdomain.com`).

### Module 5: 🔑 OpenID Connect (OIDC / SSO) `[Backend]`

Integrate with centralized identity providers such as Authentik, Keycloak, Authelia, or Okta:

- **`SPARKY_FITNESS_OIDC_AUTH_ENABLED`**: Set to `true` to enable OIDC single sign-on.
- **`SPARKY_FITNESS_OIDC_PROVIDER_NAME`**: Display label on the "Log in with..." button (e.g., `Authentik`).
- **`SPARKY_FITNESS_OIDC_PROVIDER_SLUG`**: URL-safe unique identifier (e.g., `authentik`).
- **`SPARKY_FITNESS_OIDC_ISSUER_URL`**: Base URL of your IdP (e.g., `https://auth.example.com/application/o/sparky/`).
- **`SPARKY_FITNESS_OIDC_CLIENT_ID`**: OAuth2 Client ID created in your IdP.
- **`SPARKY_FITNESS_OIDC_CLIENT_SECRET`**: OAuth2 Client Secret. (Can also be supplied via **`SPARKY_FITNESS_OIDC_CLIENT_SECRET_FILE`**).
- **`SPARKY_FITNESS_OIDC_ADMIN_GROUP`**: Group or role claim that automatically elevates the user to Admin (e.g., `Admin`).
- **`SPARKY_FITNESS_OIDC_SCOPE`**: Scopes to request (defaults to `openid email profile`).

#### Advanced OIDC (rarely needed)

These only apply when the four required values above (`ISSUER_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `PROVIDER_SLUG`) are all set; the whole env-configured provider is ignored otherwise. Every one has a working default, so change them only if your IdP demands it.

- **`SPARKY_FITNESS_OIDC_AUTO_REGISTER`**: Whether a successful login creates an account that does not exist yet. Defaults to `true`; set to `false` to require that accounts be provisioned first.
- **`SPARKY_FITNESS_OIDC_AUTO_REDIRECT`**: Set to `true` to send users straight to the IdP instead of showing the login page. Defaults to `false`. Pair it with a fail-safe (`SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true`) while you are still testing the provider.
- **`SPARKY_FITNESS_OIDC_DOMAIN`**: Email domain associated with the provider. Defaults to `<provider-slug>.env`.
- **`SPARKY_FITNESS_OIDC_LOGO_URL`**: Icon shown on the "Log in with…" button. Defaults to none.
- **`SPARKY_FITNESS_OIDC_TOKEN_AUTH_METHOD`**: How the client authenticates at the token endpoint. Defaults to `client_secret_post`.
- **`SPARKY_FITNESS_OIDC_ID_TOKEN_SIGNED_ALG`**: Expected ID-token signing algorithm. Defaults to `RS256`.
- **`SPARKY_FITNESS_OIDC_USERINFO_SIGNED_ALG`**: Expected userinfo signing algorithm. Defaults to `none`, meaning an unsigned JSON response.
- **`SPARKY_FITNESS_OIDC_TIMEOUT`**: Milliseconds to wait on the IdP before giving up. Defaults to `30000`.

### Module 6: ⌚ Garmin Connect Microservice `[Garmin & Backend]`

Connect to the Python-based Garmin sync microservice bundled in `docker-compose.prod.yml`:

- **`GARMIN_MICROSERVICE_URL`**: Microservice endpoint URL (e.g., `http://sparkyfitness-garmin:8000`).
- **`GARMIN_SERVICE_PORT`**: Microservice port. Defaults to `8000`.

### Module 7: ⏱️ Sign-in & API Key Rate Limiting `[Backend]`

Customizes rate-limiting thresholds for logins, two-factor verification, and external automation API keys:

- **`SPARKY_FITNESS_SIGN_IN_RATELIMIT_MAX`**: Maximum login attempts allowed per IP before temporary lockout. Defaults to `4`.
- **`SPARKY_FITNESS_SIGN_IN_RATELIMIT_WINDOW`**: Lockout tracking window in seconds. Defaults to `60`.
- **`SPARKY_FITNESS_API_KEY_RATELIMIT_MAX_REQUESTS`**: Maximum requests per API key token window. Defaults to `100`.
- **`SPARKY_FITNESS_API_KEY_RATELIMIT_WINDOW_MS`**: API key window in milliseconds. Defaults to `60000` (1 minute).

### Module 8: 🗄️ Database Names & Connection `[Database & Backend]` {#module-8-database-names-connection}

Every value here has a working default that Docker Compose already supplies, so a standard install never sets them. Change them for an external or managed PostgreSQL, or to use non-default names.

- **`SPARKY_FITNESS_DB_HOST`**: Database hostname. Defaults to `sparkyfitness-db`, the Compose service name. Use `localhost` for a bare-metal install, or a socket directory (any value starting with `/`) to connect over a Unix socket.
- **`SPARKY_FITNESS_DB_NAME`**: PostgreSQL database name. Defaults to `sparkyfitness_db`. Read only at first initialisation — see the warning above.
- **`SPARKY_FITNESS_DB_PORT`**: Defaults to `5432`. Under Docker Compose the server always reaches the database on `5432` inside the network, and this only selects the **host** port if you uncomment the database `ports:` mapping for pgAdmin or DBeaver. Change it for a bare-metal or external PostgreSQL on a non-standard port.
- **`SPARKY_FITNESS_APP_DB_USER`**: Application database user with limited privileges. Defaults to `sparky_app`. The server creates this role itself.
- **`SPARKY_FITNESS_APP_DB_PASSWORD`**: If unset, the server generates one on each start and updates the role to match. Set it explicitly if more than one server shares this database, or if you pre-created the role on a managed PostgreSQL. (Can also be supplied via **`SPARKY_FITNESS_APP_DB_PASSWORD_FILE`**).

### Module 9: 🌐 Nginx, Ports & Reverse Proxy Headers `[Frontend Nginx & Backend]`

Controls web access ports, Nginx brute-force protection, and client IP resolution behind reverse proxies:

- **`SPARKY_FITNESS_FRONTEND_PORT`**: Port exposed on your host machine for web access. Defaults to `3004`.
- **`NGINX_RATE_LIMIT`**: Rate limit on `/api/auth/*` routes to prevent brute-force attacks (e.g., `5r/s`). Defaults to `5r/s`.
- **`NGINX_RESOLVER`**: DNS resolver used by Nginx to dynamically resolve upstream hostnames (e.g. when backend containers are restarted or recreated). Defaults to auto-detecting nameservers from `/etc/resolv.conf`, falling back to `127.0.0.11` (Docker embedded DNS). Host aliases defined in `/etc/hosts` (such as `host.docker.internal` or `localhost`) are automatically detected and resolved to IP literals on startup.
- **`SPARKY_FITNESS_REAL_IP_HEADER`**: Name of the trusted proxy header containing the real client IP (e.g., `CF-Connecting-IP` for Cloudflare Tunnel / CDN, `True-Client-IP` for Akamai). Only use this when your upstream edge proxy/CDN unconditionally sets or overwrites this header and direct access to your origin server is prevented.
- **`SPARKY_FITNESS_TRUSTED_PROXY_HOPS`**: Number of proxy layers between client and the backend server when not using a named header. Defaults to `1` (which accounts for the bundled frontend Nginx container). If you run behind an external reverse proxy (such as Nginx Proxy Manager, Traefik, Caddy, or HAProxy), set this to `2` (1 external reverse proxy + 1 bundled frontend Nginx).
- **`SPARKY_FITNESS_TRUSTED_PROXIES`**: Comma-separated list of trusted reverse-proxy IP addresses or CIDR blocks (e.g. `192.168.1.50,172.20.0.0/16`). Specify only the actual reverse-proxy IP addresses or a dedicated proxy-only subnet. Avoid broad private ranges (such as `192.168.0.0/16` or `10.0.0.0/8`), as every host within a trusted range is permitted to forward `X-Forwarded-For` headers.
- **`SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS`**: Comma-separated list of additional local IP origins trusted by Better Auth (e.g., `http://192.168.1.100:3004`).
- **`NGINX_LISTEN_PORT`**: Port Nginx listens on inside container (`80` root / `8080` non-root).
- **`NGINX_ACCESS_LOG`** / **`NGINX_ERROR_LOG`**: Nginx log paths.
- **`NGINX_DUMP_CONFIG`**: Set to `true` to dump resolved Nginx configuration on startup.

### Module 10: 🛡️ Outbound Corporate / Forwarding Proxy `[Backend]`

Route outgoing backend requests (such as OpenFoodFacts, Strava, or AI providers) through a corporate forward proxy:

- **`HTTP_PROXY`**: Proxy URL for outbound HTTP requests (e.g., `http://proxy.example.com:8888`).
- **`HTTPS_PROXY`**: Proxy URL for outbound HTTPS requests.
- **`NO_PROXY`**: Comma-separated list of hostnames to bypass proxy (e.g., `localhost,127.0.0.1,sparkyfitness-garmin`).

### Module 11: 🧪 Public Demo Mode `[Backend]`

Runs an isolated demo account seeded with sample data that resets every 24 hours at midnight UTC. Leave this off for a normal instance.

- **`SPARKY_FITNESS_DEMO_MODE`**: Set to `true` to enable an isolated demo user seeded with rich sample data that automatically resets every 24 hours at midnight UTC.
- **`SPARKY_FITNESS_DEMO_EMAIL`**: Email for the demo user. Defaults to `demo@sparkyfitness.com`.
- **`SPARKY_FITNESS_DEMO_PASSWORD`**: Password for the demo user. If unset, a secure temporary password is generated on startup.

### Module 12: 🛡️ Admin Policy Toggles `[Backend]`

Each of these is also settable in the Admin UI, where it is stored in the database. Setting the environment variable to `true` forces the policy on regardless of what is stored; leaving it unset defers to the Admin UI. All default to off.

- **`SPARKY_FITNESS_PUBLIC_API_DOCS`**: Serve the Swagger API docs at `/api/api-docs` without requiring a login. Also in **Admin > Authentication Settings**.
- **`DEV_TOOLS_ENABLED`**: Expose the admin-only database inspection tools to the AI chatbot and MCP endpoint. Also in **Admin > Authentication Settings**.
- **`ALLOW_PRIVATE_NETWORK_AI`**: Let non-admin users point custom AI service URLs (`custom`, `ollama`, `openai_compatible`) at private/LAN addresses. Also in **Admin > Global AI Settings**. ⚠️ Enabling this lets any registered user make the server send requests to your internal network (SSRF); only enable on a trusted single-tenant deployment.
- **`ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS`**: The same, for self-hosted recipe providers (Mealie, Tandoor, Norish). Also in **Admin > Global Provider Settings**. ⚠️ Same SSRF warning applies.

::: info Provider response capture is not configured by environment
The developer mock-data switches (formerly `SPARKY_FITNESS_SAVE_MOCK_DATA` and the per-provider `SPARKY_FITNESS_*_DATA_SOURCE` variables) have been removed. Capturing a provider's raw responses, and replaying them instead of calling the provider, are now per-sync checkboxes on the provider sync dialog, available only while an admin has enabled **Allow Local Provider Response Capture** in **Admin > Global Provider Settings**. `GARMIN_SERVICE_IS_CN` is unaffected and remains an environment variable on the Garmin container.
:::

### Module 13: 📱 iOS Mobile App Development `[Mobile Build]`

Configures code signing, bundle identifiers, and shared App Groups when building [`SparkyFitnessMobile`](/developer/getting-started):

- **`EXPO_DEV_APPLE_TEAM_ID`** / **`EXPO_PROD_APPLE_TEAM_ID`**: 10-character Apple Developer Team ID.
- **`EXPO_DEV_BUNDLE_IDENTIFIER`**: Development bundle ID (`org.SparkyApps.SparkyFitnessMobile.dev`).
- **`WIDGET_BUNDLE_IDENTIFIER`**: iOS Widget extension bundle ID (`org.SparkyApps.SparkyFitnessMobile.dev.ExpoWidgetsTarget`).
- **`IOS_APP_GROUP_DEV`** / **`IOS_APP_GROUP_PROD`**: App Group identifiers for widget shared memory.

### Module 14: 🤖 Android Mobile App Build `[Mobile Build]`

- **`GOOGLE_MAPS_ANDROID_API_KEY`** (optional): Google Maps key for cardio routes on Android. Without it, Android draws routes over OpenStreetMap vector tiles with MapLibre, which needs no key, billing account or Google Play Services; iOS always uses Apple Maps and needs no key. With it, Android keeps Google Maps instead, and the key's Google Cloud project needs billing enabled. The app only makes plain Maps SDK for Android loads (no map ID), which Google does not charge for. Restrict the key to the app's package name and signing certificates, and pass it to the build (for example as an EAS secret) rather than committing it.

---

## 🔒 Docker Secrets & File-Based Configuration (`*_FILE`)

SparkyFitness natively supports loading sensitive configuration values from files mounted by **Docker Compose secrets**, **Docker Swarm**, or **Kubernetes**.

Any backend environment variable `VAR` can be supplied via a corresponding `VAR_FILE` environment variable pointing to the mounted secret file. When `VAR_FILE` is provided and `VAR` is unset, empty, or contains only whitespace, the server automatically reads and trims the secret from the specified file on startup.

| Environment Variable                | File-Based Alternative (`*_FILE`)        | Description                             |
| :---------------------------------- | :--------------------------------------- | :-------------------------------------- |
| `POSTGRES_PASSWORD`                 | `POSTGRES_PASSWORD_FILE`                 | PostgreSQL container superuser password |
| `SPARKY_FITNESS_DB_PASSWORD`        | `SPARKY_FITNESS_DB_PASSWORD_FILE`        | Backend database superuser password     |
| `SPARKY_FITNESS_APP_DB_PASSWORD`    | `SPARKY_FITNESS_APP_DB_PASSWORD_FILE`    | Application database password           |
| `SPARKY_FITNESS_API_ENCRYPTION_KEY` | `SPARKY_FITNESS_API_ENCRYPTION_KEY_FILE` | 64-character encryption key             |
| `BETTER_AUTH_SECRET`                | `BETTER_AUTH_SECRET_FILE`                | Better Auth signing secret              |
| `SPARKY_FITNESS_EMAIL_PASS`         | `SPARKY_FITNESS_EMAIL_PASS_FILE`         | SMTP password                           |
| `SPARKY_FITNESS_OIDC_CLIENT_ID`     | `SPARKY_FITNESS_OIDC_CLIENT_ID_FILE`     | OIDC Client ID                          |
| `SPARKY_FITNESS_OIDC_CLIENT_SECRET` | `SPARKY_FITNESS_OIDC_CLIENT_SECRET_FILE` | OIDC Client Secret                      |
| `SPARKY_FITNESS_DEMO_PASSWORD`      | `SPARKY_FITNESS_DEMO_PASSWORD_FILE`      | Demo user account password              |
