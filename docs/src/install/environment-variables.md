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

The following environment variables are **mandatory** and must be supplied for the application to start correctly. Failure to provide these will result in the server failing preflight checks.

### 1. Application Access URL `[Frontend & Backend]`

- **`SPARKY_FITNESS_FRONTEND_URL`**: The public URL of your frontend (e.g., `http://localhost:3004` for Docker Compose, `http://localhost:8080` for bare-metal local development, or your domain like `https://fitness.example.com` for production). This is crucial for CORS security and cookie sessions.

### 2. PostgreSQL Database Credentials `[Database & Backend]`

SparkyFitness implements a two-tier database security model using superuser privileges for migrations and unprivileged application user credentials for daily RLS-enforced queries:

- **`SPARKY_FITNESS_DB_HOST`**: Database hostname (e.g., `sparkyfitness-db` inside Docker, or `localhost` for local development).
- **`SPARKY_FITNESS_DB_NAME`**: _(Optional)_ PostgreSQL database name. Defaults to `sparkyfitness_db`. Read only at first initialisation — see the warning below.
- **`SPARKY_FITNESS_DB_USER`**: Database superuser for migrations and schema setup (e.g., `sparky`). _(Optional)_ Defaults to `sparky`. Read only at first initialisation.
- **`SPARKY_FITNESS_DB_PASSWORD`**: Superuser password. (Can also be supplied via **`SPARKY_FITNESS_DB_PASSWORD_FILE`**).
- **`SPARKY_FITNESS_APP_DB_USER`**: _(Optional)_ Application database user with limited privileges. Defaults to `sparky_app`. The server creates this role itself.
- **`SPARKY_FITNESS_APP_DB_PASSWORD`**: _(Optional)_ Application database user password. If unset, the server generates one on each start and updates the role to match. Set it explicitly if more than one server shares this database, or if you pre-created the role. (Can also be supplied via **`SPARKY_FITNESS_APP_DB_PASSWORD_FILE`**).
- **`SPARKY_FITNESS_DB_PORT`**: (Optional) Host port to expose PostgreSQL externally for tools like pgAdmin/DBeaver. Defaults to `5432`.

::: danger Changing database credentials after the first start
`SPARKY_FITNESS_DB_NAME`, `SPARKY_FITNESS_DB_USER` and `SPARKY_FITNESS_DB_PASSWORD` are handed to PostgreSQL only when it initialises an empty data directory. On every later start PostgreSQL ignores them and keeps what it already has, so editing them in `.env` does not change the database — it only changes what the server tries to authenticate with, which then fails. To rotate them, `ALTER` the role inside PostgreSQL yourself. The application user is different: the server keeps that role's password in sync automatically.
:::

### 3. Security & Cryptographic Secrets `[Backend]`

- **`SPARKY_FITNESS_API_ENCRYPTION_KEY`**: A 64-character hex string (256-bit AES) for encrypting stored external provider API keys and tokens in Postgres. (Can also be supplied via **`SPARKY_FITNESS_API_ENCRYPTION_KEY_FILE`**).
  - Generate with: `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **`BETTER_AUTH_SECRET`**: A secret key used by Better Auth to sign session JWTs and encrypt TOTP 2-Factor Authentication keys in the database. (Can also be supplied via **`BETTER_AUTH_SECRET_FILE`**).
  - Generate with: `openssl rand -hex 32`
  - > [!CAUTION]
    > **CRITICAL for 2FA/TOTP:** If you change this variable after users have enabled 2FA, the server will lose access to their secret keys and **all 2FA users will be locked out**. Keep this value persistent and back it up.

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

### Module 2: 🛡️ Admin Email, Public Signups & Access Policy `[Backend]`

Controls initial administrator privileges, who may register, and how users sign in:

- **`SPARKY_FITNESS_ADMIN_EMAIL`**: (Optional) Email address automatically granted Admin privileges on server startup. If left blank, the **first user to register** becomes Admin.
- **`SPARKY_FITNESS_DISABLE_SIGNUP`**: Set to `true` to disable new user registrations and lock the instance for private use.
- **`SPARKY_FITNESS_DISABLE_EMAIL_LOGIN`**: Set to `true` to force users to log in exclusively via SSO. Requires OIDC to be configured (Module 5), otherwise nobody can sign in.
- **`SPARKY_FITNESS_FORCE_EMAIL_LOGIN`**: Fail-safe toggle. Set to `true` to force password login enabled if OIDC misbehaves. Do not set this alongside `SPARKY_FITNESS_DISABLE_EMAIL_LOGIN` — the two contradict each other and the server resolves the conflict differently depending on the code path.
- **`ALLOW_PRIVATE_NETWORK_CORS`**: Set to `true` to allow Cross-Origin Resource Sharing (CORS) from private LAN subnets (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`, `localhost`).

### Module 3: 🧪 Public Demo Mode `[Backend]`

Runs an isolated demo account seeded with sample data that resets every 24 hours at midnight UTC. Leave this off for a normal instance.

- **`SPARKY_FITNESS_DEMO_MODE`**: Set to `true` to enable an isolated demo user seeded with rich sample data that automatically resets every 24 hours at midnight UTC.
- **`SPARKY_FITNESS_DEMO_EMAIL`**: Email for the demo user. Defaults to `demo@sparkyfitness.com`.
- **`SPARKY_FITNESS_DEMO_PASSWORD`**: Password for the demo user. If unset, a secure temporary password is generated on startup.

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

### Module 6: ⌚ Garmin Connect Microservice `[Garmin & Backend]`

Connect to the Python-based Garmin sync microservice bundled in `docker-compose.prod.yml`:

- **`GARMIN_MICROSERVICE_URL`**: Microservice endpoint URL (e.g., `http://sparkyfitness-garmin:8000`).
- **`GARMIN_SERVICE_PORT`**: Microservice port. Defaults to `8000`.

### Module 7: 🌐 Nginx, Ports & Reverse Proxy Headers `[Frontend Nginx & Backend]`

Controls web access ports, Nginx brute-force protection, and client IP resolution behind reverse proxies:

- **`SPARKY_FITNESS_FRONTEND_PORT`**: Port exposed on your host machine for web access. Defaults to `3004`.
- **`NGINX_RATE_LIMIT`**: Rate limit on `/api/auth/*` routes to prevent brute-force attacks (e.g., `5r/s`). Defaults to `5r/s`.
- **`SPARKY_FITNESS_REAL_IP_HEADER`**: Name of the trusted proxy header containing the real client IP (e.g., `CF-Connecting-IP` for Cloudflare Tunnel / CDN, `X-Forwarded-For` for NPM/Traefik, `True-Client-IP` for Akamai).
- **`SPARKY_FITNESS_TRUSTED_PROXY_HOPS`**: Number of proxy layers between client and server when not using a named header. Defaults to `1`.
- **`SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS`**: Comma-separated list of additional local IP origins trusted by Better Auth (e.g., `http://192.168.1.100:3004`).
- **`NGINX_LISTEN_PORT`**: Port Nginx listens on inside container (`80` root / `8080` non-root).
- **`NGINX_ACCESS_LOG`** / **`NGINX_ERROR_LOG`**: Nginx log paths.
- **`NGINX_DUMP_CONFIG`**: Set to `true` to dump resolved Nginx configuration on startup.

### Module 8: ⏱️ Sign-in & API Key Rate Limiting `[Backend]`

Customizes rate-limiting thresholds for logins, two-factor verification, and external automation API keys:

- **`SPARKY_FITNESS_SIGN_IN_RATELIMIT_MAX`**: Maximum login attempts allowed per IP before temporary lockout. Defaults to `4`.
- **`SPARKY_FITNESS_SIGN_IN_RATELIMIT_WINDOW`**: Lockout tracking window in seconds. Defaults to `60`.
- **`SPARKY_FITNESS_API_KEY_RATELIMIT_MAX_REQUESTS`**: Maximum requests per API key token window. Defaults to `100`.
- **`SPARKY_FITNESS_API_KEY_RATELIMIT_WINDOW_MS`**: API key window in milliseconds. Defaults to `60000` (1 minute).

### Module 9: 🛡️ Outbound Corporate / Forwarding Proxy `[Backend]`

Route outgoing backend requests (such as OpenFoodFacts, Strava, or AI providers) through a corporate forward proxy:

- **`HTTP_PROXY`**: Proxy URL for outbound HTTP requests (e.g., `http://proxy.example.com:8888`).
- **`HTTPS_PROXY`**: Proxy URL for outbound HTTPS requests.
- **`NO_PROXY`**: Comma-separated list of hostnames to bypass proxy (e.g., `localhost,127.0.0.1,sparkyfitness-garmin`).

### Module 10: 🛡️ Admin Policy Toggles `[Backend]`

Each of these is also settable in the Admin UI, where it is stored in the database. Setting the environment variable to `true` forces the policy on regardless of what is stored; leaving it unset defers to the Admin UI. All default to off.

- **`SPARKY_FITNESS_PUBLIC_API_DOCS`**: Serve the Swagger API docs at `/api/api-docs` without requiring a login. Also in **Admin > Authentication Settings**.
- **`DEV_TOOLS_ENABLED`**: Expose the admin-only database inspection tools to the AI chatbot and MCP endpoint. Also in **Admin > Authentication Settings**.
- **`ALLOW_PRIVATE_NETWORK_AI`**: Let non-admin users point custom AI service URLs (`custom`, `ollama`, `openai_compatible`) at private/LAN addresses. Also in **Admin > Global AI Settings**. ⚠️ Enabling this lets any registered user make the server send requests to your internal network (SSRF); only enable on a trusted single-tenant deployment.
- **`ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS`**: The same, for self-hosted recipe providers (Mealie, Tandoor, Norish). Also in **Admin > Global Provider Settings**. ⚠️ Same SSRF warning applies.

::: info Provider response capture is not configured by environment
The developer mock-data switches (formerly `SPARKY_FITNESS_SAVE_MOCK_DATA` and the per-provider `SPARKY_FITNESS_*_DATA_SOURCE` variables) have been removed. Capturing a provider's raw responses, and replaying them instead of calling the provider, are now per-sync checkboxes on the provider sync dialog, available only while an admin has enabled **Allow Local Provider Response Capture** in **Admin > Global Provider Settings**. `GARMIN_SERVICE_IS_CN` is unaffected and remains an environment variable on the Garmin container.
:::

### Module 11: 📱 iOS Mobile App Development `[Mobile Build]`

Configures code signing, bundle identifiers, and shared App Groups when building [`SparkyFitnessMobile`](/developer/getting-started):

- **`EXPO_DEV_APPLE_TEAM_ID`** / **`EXPO_PROD_APPLE_TEAM_ID`**: 10-character Apple Developer Team ID.
- **`EXPO_DEV_BUNDLE_IDENTIFIER`**: Development bundle ID (`org.SparkyApps.SparkyFitnessMobile.dev`).
- **`WIDGET_BUNDLE_IDENTIFIER`**: iOS Widget extension bundle ID (`org.SparkyApps.SparkyFitnessMobile.dev.ExpoWidgetsTarget`).
- **`IOS_APP_GROUP_DEV`** / **`IOS_APP_GROUP_PROD`**: App Group identifiers for widget shared memory.

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
